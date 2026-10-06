import { beforeEach, describe, expect, it, vi } from "vitest"

import { TEMP_CONTEXT_MODES } from "~/constants/tempContextMode"
import { openFallbackAwareTempContext } from "~/services/browsingContext/tempPage/openingAdapter"
import * as browserApi from "~/utils/browser/browserApi"

vi.mock("~/services/browsingContext/tempPage/browserAdapter", () => ({
  resolveTempWindowSize: vi.fn().mockResolvedValue({ width: 800, height: 600 }),
}))

vi.mock("~/services/browsingContext/tempPage/compositeWindow", () => ({
  openTabInCompositeWindow: vi
    .fn()
    .mockResolvedValue({ windowId: 99, tabId: 101 }),
  TEMP_CONTEXT_INITIAL_URL: "about:blank",
}))

describe("openingAdapter", () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    vi.spyOn(browserApi, "hasWindowsAPI").mockReturnValue(true)
  })

  describe("openFallbackAwareTempContext", () => {
    it("opens a plain tab when requestedMode is Tab", async () => {
      vi.spyOn(browserApi, "createTab").mockResolvedValue({ id: 10 } as any)

      const result = await openFallbackAwareTempContext({
        url: "https://example.com",
        origin: "https://example.com",
        requestId: "req-tab-1",
        requestedMode: TEMP_CONTEXT_MODES.Tab,
        allowWindowRollback: false,
      })

      expect(result).toEqual({
        id: 10,
        tabId: 10,
        type: "tab",
        mode: TEMP_CONTEXT_MODES.Tab,
      })
    })

    it("throws if plain tab creation fails", async () => {
      vi.spyOn(browserApi, "createTab").mockResolvedValue(null as any)

      await expect(
        openFallbackAwareTempContext({
          url: "https://example.com",
          origin: "https://example.com",
          requestId: "req-tab-err",
          requestedMode: TEMP_CONTEXT_MODES.Tab,
          allowWindowRollback: false,
        }),
      ).rejects.toThrow()
    })

    it("opens via composite window when requestedMode is Composite", async () => {
      const result = await openFallbackAwareTempContext({
        url: "https://example.com",
        origin: "https://example.com",
        requestId: "req-comp-1",
        requestedMode: TEMP_CONTEXT_MODES.Composite,
        allowWindowRollback: false,
      })

      expect(result).toEqual({
        id: 101,
        tabId: 101,
        type: "tab",
        mode: TEMP_CONTEXT_MODES.Composite,
        ownerWindowId: 99,
      })
    })

    it("opens a popup window when requestedMode is Window", async () => {
      vi.spyOn(browserApi, "createWindow").mockResolvedValue({ id: 77 } as any)
      vi.spyOn(browserApi, "queryTabs").mockResolvedValue([{ id: 88 }] as any)
      const updateWindowSpy = vi
        .spyOn(browserApi, "updateWindow")
        .mockResolvedValue({} as any)

      const result = await openFallbackAwareTempContext({
        url: "https://example.com",
        origin: "https://example.com",
        requestId: "req-win-1",
        requestedMode: TEMP_CONTEXT_MODES.Window,
        allowWindowRollback: false,
      })

      expect(result).toEqual({
        id: 77,
        tabId: 88,
        type: "window",
        mode: TEMP_CONTEXT_MODES.Window,
        ownerWindowId: 77,
      })
      expect(updateWindowSpy).toHaveBeenCalledWith(77, { state: "minimized" })
    })

    it("handles updateWindow minimize failure gracefully", async () => {
      vi.spyOn(browserApi, "createWindow").mockResolvedValue({ id: 78 } as any)
      vi.spyOn(browserApi, "queryTabs").mockResolvedValue([{ id: 89 }] as any)
      vi.spyOn(browserApi, "updateWindow").mockRejectedValue(
        new Error("Cannot minimize"),
      )

      const result = await openFallbackAwareTempContext({
        url: "https://example.com",
        origin: "https://example.com",
        requestId: "req-win-min-err",
        requestedMode: TEMP_CONTEXT_MODES.Window,
        allowWindowRollback: false,
      })

      expect(result.id).toBe(78)
      expect(result.tabId).toBe(89)
    })

    it("rolls back to plain tab on recoverable error when allowWindowRollback is true", async () => {
      vi.spyOn(browserApi, "createWindow").mockRejectedValue(
        new Error("window creation blocked"),
      )
      vi.spyOn(browserApi, "createTab").mockResolvedValue({ id: 123 } as any)

      const result = await openFallbackAwareTempContext({
        url: "https://example.com",
        origin: "https://example.com",
        requestId: "req-fallback-1",
        requestedMode: TEMP_CONTEXT_MODES.Window,
        allowWindowRollback: true,
      })

      expect(result).toEqual({
        id: 123,
        tabId: 123,
        type: "tab",
        mode: TEMP_CONTEXT_MODES.Tab,
      })
    })

    it("throws unsupported temp context error on recoverable error when allowWindowRollback is false", async () => {
      vi.spyOn(browserApi, "createWindow").mockRejectedValue(
        new Error("window creation blocked"),
      )

      await expect(
        openFallbackAwareTempContext({
          url: "https://example.com",
          origin: "https://example.com",
          requestId: "req-fallback-no-rollback",
          requestedMode: TEMP_CONTEXT_MODES.Window,
          allowWindowRollback: false,
        }),
      ).rejects.toMatchObject({
        name: "UnsupportedTempContextError",
      })
    })

    it("rethrows unrecoverable error when window creation fails with unexpected error", async () => {
      const err = new Error("catastrophic failure")
      vi.spyOn(browserApi, "createWindow").mockRejectedValue(err)

      await expect(
        openFallbackAwareTempContext({
          url: "https://example.com",
          origin: "https://example.com",
          requestId: "req-unrec",
          requestedMode: TEMP_CONTEXT_MODES.Window,
          allowWindowRollback: true,
        }),
      ).rejects.toThrow("catastrophic failure")
    })

    it("cleans up popup window and throws if tab query returns empty, handling removeWindow error", async () => {
      vi.spyOn(browserApi, "createWindow").mockResolvedValue({ id: 79 } as any)
      vi.spyOn(browserApi, "queryTabs").mockResolvedValue([])
      const removeWindowSpy = vi
        .spyOn(browserApi, "removeWindow")
        .mockRejectedValue(new Error("removeWindow cleanup failed"))

      await expect(
        openFallbackAwareTempContext({
          url: "https://example.com",
          origin: "https://example.com",
          requestId: "req-no-tab",
          requestedMode: TEMP_CONTEXT_MODES.Window,
          allowWindowRollback: false,
        }),
      ).rejects.toThrow()

      expect(removeWindowSpy).toHaveBeenCalledWith(79)
    })

    it("throws if popupWindow is created without an id", async () => {
      vi.spyOn(browserApi, "createWindow").mockResolvedValue({} as any)

      await expect(
        openFallbackAwareTempContext({
          url: "https://example.com",
          origin: "https://example.com",
          requestId: "req-no-win-id",
          requestedMode: TEMP_CONTEXT_MODES.Window,
          allowWindowRollback: false,
        }),
      ).rejects.toMatchObject({
        name: "UnsupportedTempContextError",
      })
    })
  })
})
