import { readdirSync, readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"

/**
 * Every CI job that launches a browser downloads it first. Re-downloading on each
 * shard costs a per-shard install plus a long tail when the CDN is slow, and a failed
 * download fails the whole shard before any test runs.
 */
const workflows = readdirSync(".github/workflows").filter((file) =>
  file.endsWith(".yml"),
)

function workflowSource(file: string) {
  return readFileSync(`.github/workflows/${file}`, "utf8").replace(
    /uses: \.\/(\.github\/actions\/[^\s]+)/g,
    (_match, directory: string) =>
      readFileSync(`${directory}/action.yml`, "utf8"),
  )
}

const installing = workflows.filter((file) =>
  workflowSource(file).includes("playwright install"),
)

describe("CI Playwright browser reuse", () => {
  it("finds the workflows that install a browser", () => {
    expect(installing).toEqual(
      expect.arrayContaining([
        "e2e-smoke.yml",
        "permission-warnings.yml",
        "test.yml",
      ]),
    )
  })

  it.each(installing)(
    "%s restores the browser cache before installing",
    (file) => {
      const source = workflowSource(file)
      const cacheIndex = source.indexOf("~/.cache/ms-playwright")
      expect(cacheIndex).toBeGreaterThan(-1)
      // A per-version key lets every workflow and shard share one download.
      expect(source).toContain("steps.playwright_version.outputs.version")
      const installIndex = source.indexOf("playwright install")
      expect(cacheIndex).toBeLessThan(installIndex)
    },
  )

  it.each(installing)(
    "%s resolves the Playwright version it keys on",
    (file) => {
      const source = workflowSource(file)
      const start = source.indexOf("- name: Get Playwright version")
      expect(start).toBeGreaterThan(-1)
      const step = source.slice(start, source.indexOf("- name:", start + 10))
      expect(step).toContain("id: playwright_version")
      expect(step).toContain("devDependencies?.[")
      expect(step).toContain("@playwright/test")
      expect(step).toContain("GITHUB_OUTPUT")
    },
  )
})
