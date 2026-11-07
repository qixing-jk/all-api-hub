import path from "node:path"
import { afterEach, describe, expect, it, vi } from "vitest"

describe("development browser startup", () => {
  afterEach(() => {
    vi.unstubAllEnvs()
    vi.resetModules()
  })

  it("keeps development browser data in an absolute worktree-local profile", async () => {
    const { default: config } = await import("~~/wxt.config")

    expect(config.webExt?.chromiumProfile).toBe(
      path.resolve(".wxt/chrome-data"),
    )
    expect(config.webExt?.keepProfileChanges).toBe(true)
  })

  it.each([
    [undefined, false],
    ["0", true],
    ["1", false],
  ])(
    "WXT_OPEN_BROWSER=%s disables browser startup: %s",
    async (value, disabled) => {
      vi.stubEnv("WXT_OPEN_BROWSER", value)
      vi.resetModules()
      const { default: config } = await import("~~/wxt.config")

      expect(config.webExt?.disabled).toBe(disabled)
    },
  )
})
