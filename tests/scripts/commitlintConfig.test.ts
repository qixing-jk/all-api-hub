import { spawnSync } from "node:child_process"
import { readFileSync } from "node:fs"
import { createRequire } from "node:module"
import { describe, expect, it } from "vitest"

const require = createRequire(import.meta.url)
const translationSubject = "chore(docs): auto-translate documentation"

function lintMessage(message: string) {
  const cli = require.resolve("@commitlint/cli/cli.js")
  return spawnSync(process.execPath, [cli], {
    cwd: process.cwd(),
    encoding: "utf8",
    input: `${message}\n`,
  })
}

function header(length: number) {
  const prefix = "feat: "
  return prefix + "a".repeat(length - prefix.length)
}

function pathFiltersFor(workflow: string, trigger: string) {
  const lines = workflow.replace(/\r\n/g, "\n").split("\n")
  const triggerStart = lines.indexOf(`  ${trigger}:`)
  if (triggerStart === -1) throw new Error(`missing ${trigger} trigger`)

  const pathsStart = lines.findIndex(
    (line, index) => index > triggerStart && line === "    paths:",
  )
  if (pathsStart === -1) throw new Error(`missing ${trigger} paths filter`)

  const filters: string[] = []
  for (const line of lines.slice(pathsStart + 1)) {
    if (!line.startsWith("      - ")) break
    filters.push(line.slice("      - ".length).replace(/^"|"$/g, ""))
  }
  return filters
}

describe("commitlint policy", () => {
  it.each([
    translationSubject,
    "chore(main): release 4.1.0",
    "perf: improve multi-account page loading and key-list feedback",
    "feat(verification): bound persisted test results by age and owner liveness",
    "feat!: drop the legacy storage path",
  ])("accepts %s", (message) => {
    const result = lintMessage(message)
    expect(result.status, `${result.stdout}\n${result.stderr}`).toBe(0)
  })

  it("accepts a 120-character header", () => {
    const result = lintMessage(header(120))
    expect(header(120)).toHaveLength(120)
    expect(result.status, `${result.stdout}\n${result.stderr}`).toBe(0)
  })

  it.each(["🌐 Auto-translate documentation", "update the docs"])(
    "rejects %s",
    (message) => {
      const result = lintMessage(message)
      expect(result.status, `${result.stdout}\n${result.stderr}`).not.toBe(0)
    },
  )

  it("rejects a 121-character header because it exceeds header-max-length", () => {
    const result = lintMessage(header(121))
    expect(result.status).not.toBe(0)
    expect(`${result.stdout}\n${result.stderr}`).toContain("header-max-length")
  })

  it("keeps the generated translation pull request on the same subject", () => {
    const workflow = readFileSync(
      ".github/workflows/translate-docs.yml",
      "utf8",
    )
    const normalized = workflow.replace(/\r\n/g, "\n")
    expect(normalized).toContain(`title: "${translationSubject}"`)
    expect(normalized).toContain(
      `commit-message: |\n            ${translationSubject}\n`,
    )
    expect(lintMessage(translationSubject).status).toBe(0)
  })

  it("checks subjects from the commit-msg hook and pull requests", () => {
    const hook = readFileSync(".husky/commit-msg", "utf8")
    expect(hook).toContain('commitlint --edit "$1"')

    const check = readFileSync(".github/workflows/commitlint.yml", "utf8")
    expect(check).toContain("github.event.pull_request.title")
    expect(check).toContain("github.event.pull_request.base.sha")
    expect(check).toContain("github.event.pull_request.head.sha")
    expect(check).toContain("edited")
    expect(check).toContain("commitlint")
  })

  it("runs the policy tests whenever their workflow inputs change", () => {
    const workflow = readFileSync(".github/workflows/test.yml", "utf8")
    const triggerFiles = [
      "commitlint.config.mjs",
      ".husky/commit-msg",
      ".github/workflows/commitlint.yml",
      ".github/workflows/translate-docs.yml",
    ]

    for (const trigger of ["push", "pull_request"]) {
      const filters = pathFiltersFor(workflow, trigger)
      // Guard the parser against a trivially matching list.
      expect(filters).toContain("tests/**")
      expect(filters).toContain(".github/workflows/test.yml")
      expect(filters).toEqual(expect.arrayContaining(triggerFiles))
    }
  })
})
