import assert from "node:assert/strict"
import { spawnSync } from "node:child_process"
import { readFileSync } from "node:fs"
import { resolve } from "node:path"

/** Extract a real workflow command for execution against external tool fixtures. */
export function workflowCommand(workflow, name) {
  const file = workflow.includes("/") ? workflow : `workflows/${workflow}`
  const source = readFileSync(
    new URL(`../../.github/${file}`, import.meta.url),
    "utf8",
  ).replaceAll("\r\n", "\n")
  const header = source
    .split("\n")
    .find((line) => line.trim() === `- name: ${name}`)
  const indentation = header?.indexOf("-")
  const step =
    header &&
    source
      .split(`${header}\n`)[1]
      ?.split(new RegExp(`\n {${indentation}}- `))[0]
  assert.ok(step, `Missing workflow step: ${name}`)
  const runIndent = indentation + 2
  const bodyIndent = indentation + 4
  const block = step.match(
    new RegExp(
      `^ {${runIndent}}run: \\|\\n((?: {${bodyIndent}}[^\\n]*(?:\\n|$)|\\n)+)`,
      "m",
    ),
  )
  const command = block
    ? block[1].replace(new RegExp(`^ {${bodyIndent}}`, "gm"), "")
    : step.match(new RegExp(`^ {${runIndent}}run: (.+)$`, "m"))?.[1]
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
