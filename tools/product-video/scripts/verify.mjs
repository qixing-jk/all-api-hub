import { spawnSync } from "node:child_process"
import { createHash } from "node:crypto"
import { readFile, writeFile } from "node:fs/promises"
import { join, resolve } from "node:path"

const project = resolve(import.meta.dirname, "..")
const plan = JSON.parse(
  await readFile(join(project, "src/shot-plan.json"), "utf8"),
)
const args = process.argv.slice(2)
if (args.length > 1 || args.some((arg) => !arg.startsWith("--shot=")))
  throw new Error("Usage: npm run verify -- [--shot=CompositionId]")
const selectedId = args[0]?.slice(7)
const selected = plan.filter(
  (shot) => selectedId === undefined || shot.id === selectedId,
)
if (!selected.length) throw new Error(`Unknown shot: ${selectedId}`)
const run = (command, argv, maxBuffer = 40 * 1024 * 1024) => {
  const result = spawnSync(command, argv, { maxBuffer, windowsHide: true })
  if (result.error)
    throw new Error(
      `Cannot run ${command}. Install FFmpeg/ffprobe or set FFMPEG_BINARY/FFPROBE_BINARY. ${result.error.message}`,
    )
  if (result.status !== 0)
    throw new Error(`${command} failed: ${result.stderr.toString()}`)
  return result.stdout
}
const report = []
for (const shot of selected) {
  const file = `${shot.file}_${shot.start.toFixed(2)}-${shot.end.toFixed(2)}s.mp4`
  const path = join(project, "output/shots", file)
  const metadata = JSON.parse(
    run(process.env.FFPROBE_BINARY || "ffprobe", [
      "-v",
      "error",
      "-count_frames",
      "-show_streams",
      "-of",
      "json",
      path,
    ]).toString(),
  )
  const streams = metadata.streams
  const video = streams.find((stream) => stream.codec_type === "video")
  if (
    streams.length !== 1 ||
    !video ||
    video.codec_name !== "h264" ||
    video.width !== 1920 ||
    video.height !== 1080 ||
    video.avg_frame_rate !== "60/1" ||
    Number(video.nb_read_frames) !== shot.frames ||
    video.color_space !== "bt709" ||
    video.pix_fmt !== "yuv420p"
  )
    throw new Error(`Unexpected format, duration, or audio stream: ${file}`)
  const raw = run(process.env.FFMPEG_BINARY || "ffmpeg", [
    "-hide_banner",
    "-loglevel",
    "error",
    "-i",
    path,
    "-vf",
    "scale=160:90",
    "-pix_fmt",
    "rgb24",
    "-an",
    "-vcodec",
    "rawvideo",
    "-f",
    "image2pipe",
    "pipe:1",
  ])
  const size = 160 * 90 * 3
  if (raw.length !== shot.frames * size)
    throw new Error(`Decoded frame count mismatch: ${file}`)
  const changes = []
  const brightness = []
  for (let frame = 0; frame < shot.frames; frame++) {
    let delta = 0
    let light = 0
    const offset = frame * size
    for (let byte = 0; byte < size; byte++) {
      light += raw[offset + byte]
      if (frame > 0)
        delta += Math.abs(raw[offset + byte] - raw[offset - size + byte])
    }
    brightness.push(light / size)
    if (frame > 0) changes.push(delta / size)
  }
  const headChange = Math.max(...changes.slice(0, 17))
  const tailChange = Math.max(...changes.slice(-17))
  if (headChange > 0.12 || tailChange > 0.12)
    throw new Error(`Unstable editing handles: ${file}`)
  if (
    Math.min(...brightness) < 100 ||
    Math.max(...brightness) > 252 ||
    Math.max(...changes) > 14
  )
    throw new Error(`Possible blank frame or flash: ${file}`)
  report.push({
    id: shot.id,
    file,
    frames: shot.frames,
    fps: 60,
    width: 1920,
    height: 1080,
    audio: false,
    headChange,
    tailChange,
    sha256: createHash("sha256")
      .update(await readFile(path))
      .digest("hex"),
  })
  console.log(
    `Verified: ${shot.id} (${shot.frames} frames, silent, stable handles)`,
  )
}
await writeFile(
  join(
    project,
    "output",
    selectedId ? `validation-${selectedId}.json` : "validation.json",
  ),
  JSON.stringify(report, null, 2) + "\n",
)
