import { execFileSync } from "node:child_process"
import { readFileSync } from "node:fs"

import { runPnpm } from "./utils/run-pnpm.mjs"

/**
 * Recognize prose maintained outside extension/runtime and tooling inputs.
 * Unknown paths retain full validation; docs builds remain owned by docs CI.
 * @param file Repository-relative Git path.
 * @returns Whether the file is known documentation only.
 */
function isDocumentation(file) {
  return (
    /^[^/]+\.md$/.test(file) ||
    /^docs\/(?:docs|agents)\/.*\.md$/.test(file) ||
    /^\.agents\/skills\/.*\.md$/.test(file) ||
    file === ".husky/README.md"
  )
}

/**
 * Inspect every update supplied by Git's pre-push stdin protocol.
 * New refs or unavailable objects have no proven range, so retain the full gate.
 * @param input Lines containing local ref/SHA and remote ref/SHA.
 * @returns Whether the complete push gate is needed.
 */
function needsValidation(input) {
  const updates = input.trim().split(/\r?\n/).filter(Boolean)
  if (updates.length === 0) return true

  for (const update of updates) {
    const fields = update.trim().split(/\s+/)
    const [, localSha, , remoteSha] = fields
    if (
      fields.length !== 4 ||
      !/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/.test(localSha) ||
      !/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/.test(remoteSha)
    )
      return true
    if (/^0+$/.test(localSha)) continue
    if (/^0+$/.test(remoteSha)) return true

    const changed = execFileSync(
      "git",
      ["diff", "--name-only", "-z", "--no-renames", remoteSha, localSha, "--"],
      { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
    )
      .split("\0")
      .filter(Boolean)
    if (changed.some((file) => !isDocumentation(file))) return true
  }
  return false
}

let shouldValidate = true
try {
  // Direct interactive invocation also falls back to the full gate.
  if (!process.stdin.isTTY)
    shouldValidate = needsValidation(readFileSync(0, "utf8"))
} catch {
  console.log("Push range unavailable; running full validation.")
}

if (shouldValidate) {
  runPnpm(["run", "validate:push"])
} else {
  console.log(
    "Skipping compile/knip: only known documentation or ref deletions changed.",
  )
}
