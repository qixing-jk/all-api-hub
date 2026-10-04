import { afterEach, describe, expect, it, vi } from "vitest"

describe("development browser startup", () => {
  afterEach(() => {
    vi.unstubAllEnvs()
    vi.resetModules()
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
