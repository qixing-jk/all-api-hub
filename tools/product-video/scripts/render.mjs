import { mkdir, readFile, writeFile } from "node:fs/promises"
import { join, resolve } from "node:path"
import { bundle } from "@remotion/bundler"
import {
  getCompositions,
  openBrowser,
  renderMedia,
  renderStill,
} from "@remotion/renderer"

const project = resolve(import.meta.dirname, "..")
const output = join(project, "output")
const plan = JSON.parse(
  await readFile(join(project, "src/shot-plan.json"), "utf8"),
)
const args = process.argv.slice(2)
const unknown = args.filter(
  (arg) => arg !== "--stills" && !arg.startsWith("--shot="),
)
if (unknown.length) throw new Error(`Unknown argument: ${unknown.join(", ")}`)
const selectedId = args.find((arg) => arg.startsWith("--shot="))?.slice(7)
const selected = plan.filter(
  (shot) => selectedId === undefined || shot.id === selectedId,
)
if (!selected.length) throw new Error(`Unknown shot: ${selectedId}`)
const stillsOnly = args.includes("--stills")
const browserExecutable = process.env.CHROME_PATH || undefined
const serveUrl = await bundle({
  entryPoint: join(project, "src/index.tsx"),
  publicDir: join(project, "public"),
  webpackOverride: (config) => ({ ...config, cache: false }),
})
const puppeteerInstance = await openBrowser("chrome", { browserExecutable })
try {
  const compositions = await getCompositions(serveUrl, { puppeteerInstance })
  await mkdir(join(output, "stills"), { recursive: true })
  await mkdir(join(output, "shots"), { recursive: true })

  for (const shot of selected) {
    const composition = compositions.find((item) => item.id === shot.id)
    const expectedFrames = Math.round((shot.end - shot.start + 0.6) * 60)
    if (
      !composition ||
      composition.durationInFrames !== expectedFrames ||
      shot.frames !== expectedFrames
    ) {
      throw new Error(`Composition timing does not match shot plan: ${shot.id}`)
    }
    const frames = [
      ...new Set([
        0,
        18,
        Math.min(45, shot.frames - 1),
        Math.min(75, shot.frames - 1),
        shot.frames - 19,
        shot.frames - 1,
      ]),
    ]
    for (const frame of frames) {
      await renderStill({
        serveUrl,
        composition,
        puppeteerInstance,
        frame,
        imageFormat: "png",
        output: join(
          output,
          "stills",
          `${shot.id}-${String(frame).padStart(3, "0")}.png`,
        ),
        logLevel: "error",
      })
    }
    console.log(`Stills: ${shot.id}`)
    if (stillsOnly) continue
    const outputLocation = join(
      output,
      "shots",
      `${shot.file}_${shot.start.toFixed(2)}-${shot.end.toFixed(2)}s.mp4`,
    )
    let lastProgress = -1
    await renderMedia({
      serveUrl,
      composition,
      puppeteerInstance,
      outputLocation,
      codec: "h264",
      crf: 14,
      pixelFormat: "yuv420p",
      imageFormat: "png",
      colorSpace: "bt709",
      gopSize: 30,
      x264Preset: "fast",
      concurrency: 2,
      muted: true,
      logLevel: "error",
      onProgress: ({ progress }) => {
        const step = Math.floor(progress * 4)
        if (step === lastProgress) return
        lastProgress = step
        console.log(`${shot.id}: ${Math.round(progress * 100)}%`)
      },
    })
    console.log(`Video: ${outputLocation}`)
  }
  await writeFile(
    join(output, "shot-plan.json"),
    JSON.stringify(selected, null, 2) + "\n",
  )
} finally {
  await puppeteerInstance.close({ silent: true })
}
