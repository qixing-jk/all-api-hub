import { beforeEach, describe, expect, it, vi } from "vitest"

import { TEMP_CONTEXT_MODES } from "~/constants/tempContextMode"
import { logger } from "~/services/browsingContext/tempPage/diagnostics"
import { openFallbackAwareTempContext } from "~/services/browsingContext/tempPage/openingAdapter"
import * as browserApi_tabs from "~/utils/browser/tabs"
import * as browserApi_windows from "~/utils/browser/windows"

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
    vi.spyOn(browserApi_windows, "hasWindowsAPI").mockReturnValue(true)
  })

  describe("openFallbackAwareTempContext", () => {
    it("opens a plain tab when requestedMode is Tab", async () => {
      vi.spyOn(browserApi_tabs, "createTab").mockResolvedValue({
        id: 10,
      } as any)

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

    it("preserves the browser error when an ordinary temporary tab cannot be created", async () => {
      const browserError = new Error("Browser tab creation failed")
      vi.spyOn(browserApi_tabs, "createTab").mockRejectedValueOnce(browserError)
      const createWindow = vi.spyOn(browserApi_windows, "createWindow")

      await expect(
        openFallbackAwareTempContext({
          url: "https://example.com",
          origin: "https://example.com",
          requestId: "req-tab-browser-error",
          requestedMode: TEMP_CONTEXT_MODES.Tab,
          allowWindowRollback: true,
        }),
      ).rejects.toBe(browserError)
      expect(createWindow).not.toHaveBeenCalled()
    })

    it.each(["firefox-default", undefined])(
      "rejects a mismatched cookie store even if tab cleanup fails (actual store: %s)",
      async (cookieStoreId) => {
        vi.spyOn(browserApi_tabs, "createTab").mockResolvedValueOnce({
          id: 21,
          cookieStoreId,
        } as any)
        const removeTab = vi
          .spyOn(browserApi_tabs, "removeTab")
          .mockRejectedValueOnce(new Error("Tab cleanup failed"))
        const createWindow = vi.spyOn(browserApi_windows, "createWindow")
        const warn = vi.spyOn(logger, "warn").mockImplementation(() => {})

        await expect(
          openFallbackAwareTempContext({
            url: "https://example.com",
            origin: "https://example.com",
            requestId: "req-store-cleanup-error",
            requestedMode: TEMP_CONTEXT_MODES.Tab,
            allowWindowRollback: true,
            cookieStoreId: "store-a",
          }),
        ).rejects.toMatchObject({
          name: "CookieStoreContextUnavailableError",
        })
        expect(removeTab).toHaveBeenCalledWith(21)
        expect(createWindow).not.toHaveBeenCalled()
        expect(warn).toHaveBeenCalledWith(
          "Failed to remove tab created in the wrong cookie store",
          {
            tabId: 21,
            expectedCookieStoreId: "store-a",
            actualCookieStoreId: cookieStoreId ?? null,
            error: "Tab cleanup failed",
          },
        )
      },
    )

    it("creates cookie-store contexts in that store and rejects mismatched tabs", async () => {
      const createTab = vi.spyOn(browserApi_tabs, "createTab")
      const removeTab = vi
        .spyOn(browserApi_tabs, "removeTab")
        .mockResolvedValue()
      createTab.mockResolvedValueOnce({
        id: 19,
        cookieStoreId: "store-a",
      } as any)

      const result = await openFallbackAwareTempContext({
        url: "https://example.com",
        origin: "https://example.com",
        requestId: "req-store-a",
        requestedMode: TEMP_CONTEXT_MODES.Tab,
        allowWindowRollback: false,
        cookieStoreId: "store-a",
      })

      expect(createTab).toHaveBeenCalledWith("about:blank", false, {
        cookieStoreId: "store-a",
      })
      expect(result.tabId).toBe(19)

      createTab.mockResolvedValueOnce({
        id: 20,
        cookieStoreId: "firefox-default",
      } as any)
      await expect(
        openFallbackAwareTempContext({
          url: "https://example.com",
          origin: "https://example.com",
          requestId: "req-store-mismatch",
          requestedMode: TEMP_CONTEXT_MODES.Tab,
          allowWindowRollback: false,
          cookieStoreId: "store-a",
        }),
      ).rejects.toThrow(/cookie store/i)
      expect(removeTab).toHaveBeenCalledWith(20)
    })

    it("rejects when the browser cannot create a tab in the requested store", async () => {
      vi.spyOn(browserApi_tabs, "createTab").mockRejectedValueOnce(
        new Error("cookieStoreId is not supported"),
      )

      await expect(
        openFallbackAwareTempContext({
          url: "https://example.com",
          origin: "https://example.com",
          requestId: "req-store-unsupported",
          requestedMode: TEMP_CONTEXT_MODES.Tab,
          allowWindowRollback: false,
          cookieStoreId: "store-a",
        }),
      ).rejects.toMatchObject({
        name: "CookieStoreContextUnavailableError",
      })
    })

    it("throws if plain tab creation fails", async () => {
      vi.spyOn(browserApi_tabs, "createTab").mockResolvedValue(null as any)

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
      vi.spyOn(browserApi_windows, "createWindow").mockResolvedValue({
        id: 77,
      } as any)
      vi.spyOn(browserApi_tabs, "queryTabs").mockResolvedValue([
        { id: 88 },
      ] as any)
      const updateWindowSpy = vi
        .spyOn(browserApi_windows, "updateWindow")
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

    it("keeps an incognito cookie store when the private window exposes it", async () => {
      vi.spyOn(browserApi_windows, "createWindow").mockResolvedValue({
        id: 80,
      } as any)
      vi.spyOn(browserApi_tabs, "queryTabs").mockResolvedValue([
        { id: 81, cookieStoreId: "firefox-private" },
      ] as any)

      const result = await openFallbackAwareTempContext({
        url: "https://example.com",
        origin: "https://example.com",
        requestId: "req-private-store",
        requestedMode: TEMP_CONTEXT_MODES.Window,
        allowWindowRollback: false,
        suppressMinimize: true,
        incognito: true,
        cookieStoreId: "firefox-private",
      })

      expect(result).toMatchObject({
        id: 80,
        tabId: 81,
        mode: TEMP_CONTEXT_MODES.Window,
      })
      expect(browserApi_windows.createWindow).toHaveBeenCalledWith(
        expect.objectContaining({ incognito: true }),
      )
    })

    it("cleans up an incognito window whose tab belongs to another cookie store", async () => {
      vi.spyOn(browserApi_windows, "createWindow").mockResolvedValue({
        id: 82,
      } as any)
      vi.spyOn(browserApi_tabs, "queryTabs").mockResolvedValue([
        { id: 83, cookieStoreId: "firefox-default" },
      ] as any)
      const removeWindow = vi
        .spyOn(browserApi_windows, "removeWindow")
        .mockResolvedValue()
      const createTab = vi.spyOn(browserApi_tabs, "createTab")

      await expect(
        openFallbackAwareTempContext({
          url: "https://example.com",
          origin: "https://example.com",
          requestId: "req-private-store-mismatch",
          requestedMode: TEMP_CONTEXT_MODES.Window,
          allowWindowRollback: false,
          suppressMinimize: true,
          incognito: true,
          cookieStoreId: "firefox-private",
        }),
      ).rejects.toMatchObject({
        name: "CookieStoreContextUnavailableError",
      })

      expect(removeWindow).toHaveBeenCalledWith(82)
      expect(createTab).not.toHaveBeenCalled()
    })

    it("handles updateWindow minimize failure gracefully", async () => {
      vi.spyOn(browserApi_windows, "createWindow").mockResolvedValue({
        id: 78,
      } as any)
      vi.spyOn(browserApi_tabs, "queryTabs").mockResolvedValue([
        { id: 89 },
      ] as any)
      vi.spyOn(browserApi_windows, "updateWindow").mockRejectedValue(
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
      vi.spyOn(browserApi_windows, "createWindow").mockRejectedValue(
        new Error("window creation blocked"),
      )
      vi.spyOn(browserApi_tabs, "createTab").mockResolvedValue({
        id: 123,
      } as any)

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
      vi.spyOn(browserApi_windows, "createWindow").mockRejectedValue(
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
      vi.spyOn(browserApi_windows, "createWindow").mockRejectedValue(err)

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
      vi.spyOn(browserApi_windows, "createWindow").mockResolvedValue({
        id: 79,
      } as any)
      vi.spyOn(browserApi_tabs, "queryTabs").mockResolvedValue([])
      const removeWindowSpy = vi
        .spyOn(browserApi_windows, "removeWindow")
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
      vi.spyOn(browserApi_windows, "createWindow").mockResolvedValue({} as any)

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
