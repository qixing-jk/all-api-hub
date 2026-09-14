import { execFileSync } from "node:child_process"
import { existsSync, readFileSync } from "node:fs"

import {
  compareColorTokenBaseline,
  findColorTokenViolations,
} from "./utils/color-tokens.mjs"

const staged = process.argv.includes("--staged")
const report = process.argv.includes("--report")
const baselinePath = "scripts/color-token-baseline.json"
const git = (...args) =>
  execFileSync("git", args, { encoding: "utf8", maxBuffer: 20 * 1024 * 1024 })
const splitPaths = (output) => output.split("\0").filter(Boolean)
const changed = staged
  ? splitPaths(git("diff", "--cached", "--name-only", "--no-renames", "-z"))
  : []
const guardChanged = changed.some((path) =>
  [
    baselinePath,
    "scripts/check-color-tokens.mjs",
    "scripts/utils/color-tokens.mjs",
  ].includes(path),
)
const index = new Map(
  staged
    ? splitPaths(
        git("ls-files", "--stage", "-z", "--", "src", baselinePath),
      ).map((entry) => {
        const [, object, stage, file] = /^\d+ ([\da-f]+) (\d)\t([\s\S]+)$/.exec(
          entry,
        )
        if (stage !== "0") throw new Error(`Unmerged index entry: ${file}`)
        return [file, object]
      })
    : [],
)
const files = (
  staged
    ? [...index.keys()].filter((file) => file.startsWith("src/"))
    : splitPaths(
        git(
          "ls-files",
          "-z",
          "--cached",
          "--others",
          "--exclude-standard",
          "--",
          "src",
        ),
      )
).filter(
  (file) =>
    /\.(?:[cm]?[jt]sx?|css|html)$/.test(file) && (staged || existsSync(file)),
)
const selected = [...new Set(files)].filter(
  (file) => !staged || guardChanged || changed.includes(file),
)

/** Read each indexed blob once, preserving byte boundaries before UTF-8 decoding. */
function readIndexFiles(paths) {
  const objects = [
    ...new Set(
      paths.map((file) => {
        const object = index.get(file)
        if (!object) throw new Error(`Missing index entry: ${file}`)
        return object
      }),
    ),
  ]
  const contents = new Map()
  if (!objects.length) return contents
  const output = execFileSync("git", ["cat-file", "--batch"], {
    input: objects.join("\n") + "\n",
    maxBuffer: 64 * 1024 * 1024,
  })
  let offset = 0
  for (const object of objects) {
    const headerEnd = output.indexOf(10, offset)
    const header = output.toString("ascii", offset, headerEnd)
    const match = /^([\da-f]+) blob (\d+)$/.exec(header)
    if (!match || match[1] !== object) {
      throw new Error(`Cannot read indexed blob: ${object}`)
    }
    const start = headerEnd + 1
    const end = start + Number(match[2])
    if (end >= output.length || output[end] !== 10) {
      throw new Error(`Incomplete indexed blob: ${object}`)
    }
    contents.set(object, output.toString("utf8", start, end))
    offset = end + 1
  }
  return new Map(paths.map((file) => [file, contents.get(index.get(file))]))
}

const indexedContents = staged
  ? readIndexFiles([...selected, ...(report ? [] : [baselinePath])])
  : new Map()
const read = (file) =>
  staged ? indexedContents.get(file) : readFileSync(file, "utf8")
const baseline = report ? {} : JSON.parse(read(baselinePath))
const errors = []
const findings = {}
for (const file of selected.sort()) {
  const violations = findColorTokenViolations(file, read(file))
  if (report && violations.length) findings[file] = violations
  else errors.push(...compareColorTokenBaseline(file, violations, baseline))
}
// Deleting a source file must also remove its allowance, including staged deletions.
for (const file of Object.keys(baseline)) {
  if (
    !files.includes(file) &&
    (!staged || guardChanged || changed.includes(file))
  ) {
    errors.push(...compareColorTokenBaseline(file, [], baseline))
  }
}

if (report) {
  console.log(JSON.stringify(findings, null, 2))
} else if (errors.length) {
  console.error(errors.join("\n"))
  process.exitCode = 1
} else {
  console.log(`Color tokens checked in ${selected.length} source files.`)
}
