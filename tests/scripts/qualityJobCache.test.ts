import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"

const workflow = readFileSync(".github/workflows/quality.yml", "utf8")
const packageJson = JSON.parse(readFileSync("package.json", "utf8"))

/**
 * The quality job spends most of its time re-linting and re-checking files that did not
 * change. Both tools can skip that work, but only when the command enables it and CI
 * restores the files it writes — a mismatch silently costs the whole saving.
 */
describe("quality job caching", () => {
  it("restores the caches before the commands that write them", () => {
    const restore = workflow.indexOf("- name: Restore incremental type-check")
    expect(restore).toBeGreaterThan(-1)
    expect(restore).toBeLessThan(workflow.indexOf("run: pnpm compile"))
    expect(restore).toBeLessThan(workflow.indexOf("run: pnpm lint"))

    const step = workflow.slice(
      restore,
      workflow.indexOf("- name:", restore + 10),
    )
    expect(step).toContain("tsconfig.tsbuildinfo")
    expect(step).toContain(".eslintcache")
    // A key that only varies by commit would never hit, so reuse across commits and
    // bound the reuse to the tool configuration and dependency versions.
    expect(step).not.toContain("github.sha")
    expect(step).toContain("hashFiles('eslint.config.js'")
    expect(step).toContain("'pnpm-lock.yaml'")
    expect(step).toContain("restore-keys:")
    const key = step.match(/^ {10}key: (.+)$/m)?.[1]
    expect(key).toContain("github.run_id")
    expect(key).toContain("github.run_attempt")
    expect(step).toMatch(/restore-keys: \|\r?\n {12}quality-cache-.*hashFiles/u)
  })

  it("enables the caches in the scripts the job runs", () => {
    expect(packageJson.scripts.compile).toContain("--incremental")
    expect(packageJson.scripts.lint).toMatch(/(?:^|\s)--cache(?:\s|$)/u)
  })

  it("keeps the cache files out of the repository", () => {
    const ignore = readFileSync(".gitignore", "utf8")
    expect(ignore).toMatch(/^\/tsconfig\.tsbuildinfo\r?$/m)
    expect(ignore).toMatch(/^\/\.eslintcache\r?$/m)
  })
})
