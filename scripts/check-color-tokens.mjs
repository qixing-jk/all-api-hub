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
const files = splitPaths(
  git(
    "ls-files",
    "-z",
    ...(staged ? [] : ["--cached", "--others", "--exclude-standard"]),
    "--",
    "src",
  ),
).filter(
  (file) =>
    /\.(?:[cm]?[jt]sx?|css|html)$/.test(file) && (staged || existsSync(file)),
)
const selected = [...new Set(files)].filter(
  (file) => !staged || guardChanged || changed.includes(file),
)
const read = (file) =>
  staged ? git("show", `:${file}`) : readFileSync(file, "utf8")
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
