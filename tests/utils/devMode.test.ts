// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react"
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

    it("reacts to toggles and storage events and removes its listeners on unmount", async () => {
      const { useDevUnlocked, toggleDevUnlocked } = await import(
        "~/utils/core/devMode"
      )
      const remove = vi.spyOn(window, "removeEventListener")
      const { result, unmount } = renderHook(useDevUnlocked)
      expect(result.current).toBe(false)
      act(() => {
        toggleDevUnlocked()
      })
      expect(result.current).toBe(true)
      act(() => {
        window.localStorage.clear()
        window.dispatchEvent(new StorageEvent("storage"))
      })
      expect(result.current).toBe(false)
      unmount()
      expect(remove).toHaveBeenCalledWith("storage", expect.any(Function))
    })

    it("treats inaccessible storage as locked", async () => {
      const { isDevUnlocked } = await import("~/utils/core/devMode")
      vi.spyOn(Storage.prototype, "getItem").mockImplementationOnce(() => {
        throw new Error("blocked")
      })
      expect(isDevUnlocked()).toBe(false)
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
