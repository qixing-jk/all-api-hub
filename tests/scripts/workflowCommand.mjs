import assert from "node:assert/strict"
import { spawnSync } from "node:child_process"
import { readFileSync } from "node:fs"
import { resolve } from "node:path"

/** Extract a real workflow command for execution against external tool fixtures. */
export function workflowCommand(workflow, name) {
  const source = readFileSync(
    new URL(`../../.github/workflows/${workflow}`, import.meta.url),
    "utf8",
  ).replaceAll("\r\n", "\n")
  const step = source.split(`      - name: ${name}\n`)[1]?.split(/\n {6}- /)[0]
  assert.ok(step, `Missing workflow step: ${name}`)
  const block = step.match(/^ {8}run: \|\n((?: {10}[^\n]*(?:\n|$)|\n)+)/m)
  const command = block
    ? block[1].replace(/^ {10}/gm, "")
    : step.match(/^ {8}run: (.+)$/m)?.[1]
  assert.ok(command && command !== "|", `Missing workflow command: ${name}`)
  return command
}

/** Git for Windows supplies Bash; Linux CI already has it on PATH. */
export function bashPath() {
  if (process.platform !== "win32") return "bash"
  const git = spawnSync("git", ["--exec-path"], { encoding: "utf8" })
  assert.equal(git.status, 0, git.stderr)
  return resolve(git.stdout.trim(), "../../..", "bin/bash.exe")
}
