import { readFileSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { describe, expect, it } from "vitest"

const repoRoot = fileURLToPath(new URL("../../", import.meta.url))
const moduleXml = readFileSync(
  path.join(repoRoot, ".idea/all-api-hub.iml"),
  "utf8",
)

describe("JetBrains project search boundaries", () => {
  // JetBrains PathMacroUtil.getModuleDir skips the .idea directory, so
  // $MODULE_DIR$ resolves to the checkout root, not the .iml file's parent.
  for (const checkout of ["/projects/all-api-hub", "/worktrees/temp6"]) {
    const resolveUrl = (url: string) =>
      path.posix.normalize(
        url.replace("file://", "").replace("$MODULE_DIR$", checkout),
      )
    const contentRoot = resolveUrl(
      moduleXml.match(/<content url="([^"]+)"/)![1]!,
    )
    const exclusions = Array.from(
      moduleXml.matchAll(/<excludeFolder url="([^"]+)"/g),
      (match) => resolveUrl(match[1]!),
    )

    it(`limits project content to ${checkout}`, () => {
      expect(contentRoot).toBe(checkout)
    })

    it(`excludes generated artifacts inside ${checkout} and retains test source`, () => {
      expect(exclusions).toContain(`${checkout}/.output`)
      expect(exclusions).toContain(`${checkout}/coverage`)
      expect(exclusions).toContain(`${checkout}/test-results`)
      expect(exclusions).toContain(`${checkout}/docs/docs/.vuepress/dist`)
      expect(
        exclusions.every((entry) => entry.startsWith(`${checkout}/`)),
      ).toBe(true)
      for (const source of ["src", "tests", "e2e", ".scratch"]) {
        expect(
          exclusions.some(
            (entry) =>
              `${checkout}/${source}` === entry ||
              `${checkout}/${source}`.startsWith(`${entry}/`),
          ),
        ).toBe(false)
      }
    })
  }
})
