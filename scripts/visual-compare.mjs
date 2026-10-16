import { createHash } from "node:crypto"
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises"
import path from "node:path"
import { parseArgs } from "node:util"
import { PNG } from "pngjs"

const help = `Usage: pnpm visual:compare --before old.png --after new.png
  --before-source <revision/build> --after-source <revision/build> [--diff]
  [--output <parent-directory>]
  [--context "browser; viewport; DPR; language; theme; fixture; interaction state"]
Omit --before and --before-source to record an explicitly missing baseline.
Sources are caller declarations, not verified build provenance.
Output defaults to a unique run under the invocation directory's .scratch/visual-comparisons.
`

try {
  const { values } = parseArgs({
    options: {
      before: { type: "string" },
      after: { type: "string" },
      "before-source": { type: "string" },
      "after-source": { type: "string" },
      output: { type: "string" },
      context: { type: "string" },
      diff: { type: "boolean", default: false },
      help: { type: "boolean" },
    },
  })
  if (values.help) console.log(help)
  else console.log(JSON.stringify(await compare(values)))
} catch (error) {
  console.error(`visual:compare: ${error.message}`)
  process.exitCode = 1
}

/** Compare caller-supplied evidence without treating pixel differences as a verdict. */
async function compare(options) {
  if (!options.before && options["before-source"])
    throw new Error("--before-source requires --before")
  const before = options.before
    ? await readCapture(options.before, options["before-source"], "before")
    : null
  const after = await readCapture(
    options.after,
    options["after-source"],
    "after",
  )
  const parent = path.resolve(options.output ?? ".scratch/visual-comparisons")
  await mkdir(parent, { recursive: true })
  const directory = await mkdtemp(path.join(parent, "run-"))
  const report = {
    version: 1,
    createdAt: new Date().toISOString(),
    invocation: { cwd: process.cwd() },
    provenance:
      "caller-declared; image hashes verify bytes, not source/build identity",
    context: options.context ?? "not recorded",
    status: !before
      ? "missing-baseline"
      : before.png.width === after.png.width &&
          before.png.height === after.png.height
        ? "same-dimensions"
        : "dimension-mismatch",
    review: "required",
    reviewScope: "task-final-or-new-risk",
    agentReviewTarget: "after",
    before: before?.metadata ?? null,
    after: after.metadata,
    difference: null,
  }
  if (before) await writeFile(path.join(directory, "before.png"), before.bytes)
  await writeFile(path.join(directory, "after.png"), after.bytes)
  if (before)
    await writeFile(
      path.join(directory, "comparison.png"),
      PNG.sync.write(sideBySide(before.png, after.png)),
    )
  if (options.diff && report.status === "same-dimensions") {
    const { png, ...difference } = differenceImage(before.png, after.png)
    report.difference = difference
    await writeFile(path.join(directory, "diff.png"), PNG.sync.write(png))
  }
  await writeFile(
    path.join(directory, "report.json"),
    `${JSON.stringify(report, null, 2)}\n`,
  )
  await writeFile(
    path.join(directory, "report.md"),
    `# Visual comparison\n\nStatus: ${report.status}. Agents prioritize the final after image when visual judgment is needed. Baseline, comparison and diff artifacts primarily serve developer review; open them only for a concrete unresolved question. Generating this report does not require opening every image or repeating an unchanged review.\n\n${before ? "![Before / After](comparison.png)\n\n[Before](before.png) · " : "![After](after.png)\n\n"}[After](after.png) · [Sources and hashes](report.json)${report.difference ? " · [Exact RGBA difference](diff.png)" : ""}\n\nPixel differences are descriptive, not a visual acceptance result. Sources are caller-declared.\n`,
  )
  return {
    directory,
    status: report.status,
    report: path.join(directory, "report.md"),
  }
}

/** Decode a capture and preserve its original bytes and declared source separately. */
async function readCapture(filename, source, role) {
  if (!filename || !source?.trim())
    throw new Error(`--${role} and --${role}-source are required`)
  const absolute = path.resolve(filename)
  const bytes = await readFile(absolute)
  let png
  try {
    png = PNG.sync.read(bytes)
  } catch (error) {
    throw new Error(`Invalid PNG for ${role}: ${absolute}`, { cause: error })
  }
  return {
    bytes,
    png,
    metadata: {
      path: absolute,
      source,
      sha256: createHash("sha256").update(bytes).digest("hex"),
      width: png.width,
      height: png.height,
    },
  }
}

/** Place original-sized captures below explicit labels without cropping or resizing. */
function sideBySide(before, after) {
  const panelWidth = Math.max(88, before.width, after.width)
  const preview = new PNG({
    width: panelWidth * 2 + 16,
    height: Math.max(before.height, after.height) + 28,
  })
  preview.data.fill(255)
  PNG.bitblt(before, preview, 0, 0, before.width, before.height, 0, 28)
  PNG.bitblt(
    after,
    preview,
    0,
    0,
    after.width,
    after.height,
    panelWidth + 16,
    28,
  )
  label(preview, "BEFORE", 8)
  label(preview, "AFTER", panelWidth + 24)
  return preview
}

/** Render the two fixed labels without browser, font or native-image dependencies. */
function label(png, text, left) {
  const glyphs = {
    A: ["01110", "10001", "10001", "11111", "10001", "10001", "10001"],
    B: ["11110", "10001", "10001", "11110", "10001", "10001", "11110"],
    E: ["11111", "10000", "10000", "11110", "10000", "10000", "11111"],
    F: ["11111", "10000", "10000", "11110", "10000", "10000", "10000"],
    O: ["01110", "10001", "10001", "10001", "10001", "10001", "01110"],
    R: ["11110", "10001", "10001", "11110", "10100", "10010", "10001"],
    T: ["11111", "00100", "00100", "00100", "00100", "00100", "00100"],
  }
  for (const [letterIndex, letter] of [...text].entries()) {
    for (const [y, row] of glyphs[letter].entries()) {
      for (const [x, pixel] of [...row].entries()) {
        if (pixel !== "1") continue
        for (let dy = 0; dy < 2; dy++)
          for (let dx = 0; dx < 2; dx++) {
            const offset =
              ((8 + y * 2 + dy) * png.width +
                left +
                letterIndex * 12 +
                x * 2 +
                dx) *
              4
            png.data.set([32, 32, 32, 255], offset)
          }
      }
    }
  }
}

/** Highlight exact RGBA differences, including alpha, without a perceptual threshold. */
function differenceImage(before, after) {
  const png = new PNG({ width: before.width, height: before.height })
  let changedPixels = 0
  for (let offset = 0; offset < before.data.length; offset += 4) {
    const changed = !before.data
      .subarray(offset, offset + 4)
      .equals(after.data.subarray(offset, offset + 4))
    if (changed) changedPixels++
    png.data.set(changed ? [255, 0, 255, 255] : [0, 0, 0, 255], offset)
  }
  const totalPixels = before.width * before.height
  return { png, changedPixels, totalPixels, ratio: changedPixels / totalPixels }
}
