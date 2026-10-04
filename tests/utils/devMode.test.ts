// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

describe("devMode", () => {
  beforeEach(() => {
    vi.resetModules()
    vi.restoreAllMocks()
    window.localStorage.clear()
  })

  afterEach(() => {
    vi.resetModules()
    vi.doUnmock("~/utils/core/environment")
  })

  describe("when in development mode (wxt dev)", () => {
    beforeEach(() => {
      vi.doMock("~/utils/core/environment", async (importOriginal) => ({
        ...(await importOriginal<typeof import("~/utils/core/environment")>()),
        isDevelopmentMode: () => true,
      }))
    })

    it("reports isDevUnlocked as true", async () => {
      const { isDevUnlocked: checkUnlocked } = await import(
        "~/utils/core/devMode"
      )
      expect(checkUnlocked()).toBe(true)
    })

    it("returns 'already_dev' from toggleDevUnlocked and does not lock dev mode", async () => {
      const { toggleDevUnlocked: toggle } = await import("~/utils/core/devMode")
      const result = toggle()
      expect(result).toBe("already_dev")
    })
  })

  describe("when in production mode", () => {
    beforeEach(() => {
      vi.doMock("~/utils/core/environment", async (importOriginal) => ({
        ...(await importOriginal<typeof import("~/utils/core/environment")>()),
        isDevelopmentMode: () => false,
      }))
    })

    it("reports isDevUnlocked as false by default", async () => {
      const { isDevUnlocked: checkUnlocked } = await import(
        "~/utils/core/devMode"
      )
      expect(checkUnlocked()).toBe(false)
    })

    it("toggles dev unlock state from false to true, then back to false", async () => {
      const { toggleDevUnlocked: toggle, isDevUnlocked: checkUnlocked } =
        await import("~/utils/core/devMode")

      expect(checkUnlocked()).toBe(false)

      const firstToggle = toggle()
      expect(firstToggle).toBe("unlocked")
      expect(checkUnlocked()).toBe(true)

      const secondToggle = toggle()
      expect(secondToggle).toBe("locked")
      expect(checkUnlocked()).toBe(false)
    })
  })
})
