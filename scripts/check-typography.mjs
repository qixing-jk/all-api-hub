import { execFileSync } from "node:child_process"
import { existsSync, readFileSync } from "node:fs"

import { findTypographyViolations } from "./utils/typography.mjs"

const staged = process.argv.includes("--staged")
const git = (...args) =>
  execFileSync("git", args, { encoding: "utf8", maxBuffer: 32 * 1024 * 1024 })
const files = [
  ...new Set(
    git(
      ...(staged
        ? [
            "diff",
            "--cached",
            "--name-only",
            "--diff-filter=ACMR",
            "-z",
            "--",
            "src",
          ]
        : [
            "ls-files",
            "--cached",
            "--others",
            "--exclude-standard",
            "-z",
            "--",
            "src",
          ]),
    )
      .split("\0")
      .filter(
        (file) =>
          /\.(?:ts|tsx|css|html)$/u.test(file) && (staged || existsSync(file)),
      ),
  ),
]
const errors = files.flatMap((file) => {
  const source = staged ? git("show", `:${file}`) : readFileSync(file, "utf8")
  return findTypographyViolations(file, source).map(
    ({ line, message }) => `${file}:${line}: ${message}`,
  )
})
if (errors.length) {
  console.error(errors.join("\n"))
  process.exitCode = 1
} else console.log(`Typography checked in ${files.length} source files.`)
