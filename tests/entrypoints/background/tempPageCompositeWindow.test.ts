import { beforeEach, describe, expect, it, vi } from "vitest"

import {
  forgetCompositeWindow,
  hasLiveCompositeWindow,
  openTabInCompositeWindow,
  removeCompositeTab,
  TEMP_CONTEXT_INITIAL_URL,
} from "~/services/browsingContext/tempPage/compositeWindow"
import * as browserApi_tabs from "~/utils/browser/tabs"
import * as browserApi_windows from "~/utils/browser/windows"

vi.mock("~/services/browsingContext/tempPage/browserAdapter", () => ({
  resolveTempWindowSize: vi.fn().mockResolvedValue({ width: 800, height: 600 }),
}))

describe("compositeWindow", () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    vi.spyOn(browserApi_windows, "hasWindowsAPI").mockReturnValue(true)
  })

  describe("hasLiveCompositeWindow", () => {
    it("returns false initially when no window is remembered", async () => {
      expect(await hasLiveCompositeWindow()).toBe(false)
    })

    it("returns true when remembered window exists", async () => {
      vi.spyOn(browserApi_windows, "createWindow").mockResolvedValue({
        id: 100,
      } as any)
      vi.spyOn(browserApi_windows, "updateWindow").mockResolvedValue({} as any)
      vi.spyOn(browserApi_tabs, "queryTabs").mockResolvedValue([
        { id: 10 },
      ] as any)
      vi.spyOn(browserApi_windows, "getWindow").mockResolvedValue({
        id: 100,
      } as any)

      await openTabInCompositeWindow({
        origin: "https://example.com",
        requestId: "req-1",
      })

      expect(await hasLiveCompositeWindow()).toBe(true)
    })

    it("returns false and forgets window when getWindow throws", async () => {
      vi.spyOn(browserApi_windows, "createWindow").mockResolvedValue({
        id: 101,
      } as any)
      vi.spyOn(browserApi_windows, "updateWindow").mockResolvedValue({} as any)
      vi.spyOn(browserApi_tabs, "queryTabs").mockResolvedValue([
        { id: 11 },
      ] as any)

      await openTabInCompositeWindow({
        origin: "https://example.com",
        requestId: "req-2",
      })

      const getWindowSpy = vi
        .spyOn(browserApi_windows, "getWindow")
        .mockRejectedValue(new Error("Window not found"))
      expect(await hasLiveCompositeWindow()).toBe(false)
      // Second check should immediately return false without getWindow
      getWindowSpy.mockClear()
      expect(await hasLiveCompositeWindow()).toBe(false)
      expect(getWindowSpy).not.toHaveBeenCalled()
    })
  })

  describe("openTabInCompositeWindow", () => {
    it("throws recoverable error when windows API is unavailable", async () => {
      vi.spyOn(browserApi_windows, "hasWindowsAPI").mockReturnValue(false)

      await expect(
        openTabInCompositeWindow({
          origin: "https://example.com",
          requestId: "req-3",
        }),
      ).rejects.toMatchObject({
        name: "RecoverableWindowCreationError",
        reason:
          browserApi_windows.WINDOW_CREATION_FAILURE_REASONS
            .WINDOWS_API_UNAVAILABLE,
      })
    })

    it("creates a new window, minimizes it, and retrieves active tab", async () => {
      const createWindowSpy = vi
        .spyOn(browserApi_windows, "createWindow")
        .mockResolvedValue({ id: 200 } as any)
      const updateWindowSpy = vi
        .spyOn(browserApi_windows, "updateWindow")
        .mockResolvedValue({} as any)
      const queryTabsSpy = vi
        .spyOn(browserApi_tabs, "queryTabs")
        .mockResolvedValue([{ id: 20 }] as any)

      const result = await openTabInCompositeWindow({
        origin: "https://example.com",
        requestId: "req-4",
      })

      expect(result).toEqual({ windowId: 200, tabId: 20 })
      expect(createWindowSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          url: TEMP_CONTEXT_INITIAL_URL,
          type: "normal",
          focused: false,
          width: 800,
          height: 600,
        }),
      )
      expect(updateWindowSpy).toHaveBeenCalledWith(200, { state: "minimized" })
      expect(queryTabsSpy).toHaveBeenCalledWith({ windowId: 200, active: true })
    })

    it("suppresses minimize when requested and handles minimize failure", async () => {
      vi.spyOn(browserApi_windows, "createWindow").mockResolvedValue({
        id: 201,
      } as any)
      const updateWindowSpy = vi
        .spyOn(browserApi_windows, "updateWindow")
        .mockRejectedValue(new Error("Cannot minimize"))
      vi.spyOn(browserApi_tabs, "queryTabs").mockResolvedValue([
        { id: 21 },
      ] as any)

      // Suppress minimize
      const result1 = await openTabInCompositeWindow({
        origin: "https://example.com",
        requestId: "req-5",
        suppressMinimize: true,
      })
      expect(result1).toEqual({ windowId: 201, tabId: 21 })
      expect(updateWindowSpy).not.toHaveBeenCalled()

      // Forget and recreate with minimize failure
      forgetCompositeWindow(201)
      vi.spyOn(browserApi_windows, "createWindow").mockResolvedValue({
        id: 202,
      } as any)
      vi.spyOn(browserApi_tabs, "queryTabs").mockResolvedValue([
        { id: 22 },
      ] as any)

      const result2 = await openTabInCompositeWindow({
        origin: "https://example.com",
        requestId: "req-6",
        suppressMinimize: false,
      })
      expect(result2).toEqual({ windowId: 202, tabId: 22 })
      expect(updateWindowSpy).toHaveBeenCalledWith(202, { state: "minimized" })
    })

    it("reuses existing live composite window and creates tab in it", async () => {
      vi.spyOn(browserApi_windows, "createWindow").mockResolvedValue({
        id: 300,
      } as any)
      vi.spyOn(browserApi_windows, "updateWindow").mockResolvedValue({} as any)
      vi.spyOn(browserApi_tabs, "queryTabs").mockResolvedValue([
        { id: 30 },
      ] as any)

      await openTabInCompositeWindow({
        origin: "https://example.com",
        requestId: "req-7",
      })

      vi.spyOn(browserApi_windows, "getWindow").mockResolvedValue({
        id: 300,
      } as any)
      const createTabSpy = vi
        .spyOn(browserApi_tabs, "createTab")
        .mockResolvedValue({ id: 31 } as any)

      const second = await openTabInCompositeWindow({
        origin: "https://example.com",
        requestId: "req-8",
      })

      expect(second).toEqual({ windowId: 300, tabId: 31 })
      expect(createTabSpy).toHaveBeenCalledWith(
        TEMP_CONTEXT_INITIAL_URL,
        false,
        {
          windowId: 300,
        },
      )
    })

    it("recreates composite window if existing window throws during reuse", async () => {
      vi.spyOn(browserApi_windows, "createWindow").mockResolvedValueOnce({
        id: 400,
      } as any)
      vi.spyOn(browserApi_windows, "updateWindow").mockResolvedValue({} as any)
      vi.spyOn(browserApi_tabs, "queryTabs").mockResolvedValueOnce([
        { id: 40 },
      ] as any)

      await openTabInCompositeWindow({
        origin: "https://example.com",
        requestId: "req-9",
      })

      // First reuse fails because getWindow throws
      vi.spyOn(browserApi_windows, "getWindow").mockRejectedValue(
        new Error("Gone"),
      )
      vi.spyOn(browserApi_windows, "createWindow").mockResolvedValueOnce({
        id: 401,
      } as any)
      vi.spyOn(browserApi_tabs, "queryTabs").mockResolvedValueOnce([
        { id: 41 },
      ] as any)

      const result = await openTabInCompositeWindow({
        origin: "https://example.com",
        requestId: "req-10",
      })
      expect(result).toEqual({ windowId: 401, tabId: 41 })
    })

    it("throws if tab creation inside confirmed existing composite window fails", async () => {
      vi.spyOn(browserApi_windows, "createWindow").mockResolvedValueOnce({
        id: 500,
      } as any)
      vi.spyOn(browserApi_windows, "updateWindow").mockResolvedValue({} as any)
      vi.spyOn(browserApi_tabs, "queryTabs").mockResolvedValueOnce([
        { id: 50 },
      ] as any)

      await openTabInCompositeWindow({
        origin: "https://example.com",
        requestId: "req-11",
      })

      vi.spyOn(browserApi_windows, "getWindow").mockResolvedValue({
        id: 500,
      } as any)
      vi.spyOn(browserApi_tabs, "createTab").mockResolvedValue(null as any)

      await expect(
        openTabInCompositeWindow({
          origin: "https://example.com",
          requestId: "req-12",
        }),
      ).rejects.toMatchObject({
        name: "RecoverableWindowCreationError",
      })
    })

    it("cleans up created window and throws if queryTabs returns no active tab", async () => {
      vi.spyOn(browserApi_windows, "createWindow").mockResolvedValue({
        id: 600,
      } as any)
      vi.spyOn(browserApi_windows, "updateWindow").mockResolvedValue({} as any)
      vi.spyOn(browserApi_tabs, "queryTabs").mockResolvedValue([])
      const removeWindowSpy = vi
        .spyOn(browserApi_windows, "removeWindow")
        .mockResolvedValue(undefined as any)

      await expect(
        openTabInCompositeWindow({
          origin: "https://example.com",
          requestId: "req-13",
        }),
      ).rejects.toMatchObject({
        name: "RecoverableWindowCreationError",
      })

      expect(removeWindowSpy).toHaveBeenCalledWith(600)
    })

    it("handles failure when createWindow returns window without id", async () => {
      vi.spyOn(browserApi_windows, "createWindow").mockResolvedValue({} as any)

      await expect(
        openTabInCompositeWindow({
          origin: "https://example.com",
          requestId: "req-13b",
        }),
      ).rejects.toMatchObject({
        name: "RecoverableWindowCreationError",
      })
    })

    it("logs warning when window cleanup fails after tab query error", async () => {
      vi.spyOn(browserApi_windows, "createWindow").mockResolvedValue({
        id: 601,
      } as any)
      vi.spyOn(browserApi_windows, "updateWindow").mockResolvedValue({} as any)
      vi.spyOn(browserApi_tabs, "queryTabs").mockResolvedValue([])
      vi.spyOn(browserApi_windows, "removeWindow").mockRejectedValue(
        new Error("cleanup failed"),
      )

      await expect(
        openTabInCompositeWindow({
          origin: "https://example.com",
          requestId: "req-13c",
        }),
      ).rejects.toMatchObject({
        name: "RecoverableWindowCreationError",
      })
    })

    it("classifies window creation error from browser and cleans up if needed", async () => {
      vi.spyOn(browserApi_windows, "createWindow").mockRejectedValue(
        new Error("Cannot create window"),
      )

      await expect(
        openTabInCompositeWindow({
          origin: "https://example.com",
          requestId: "req-14",
        }),
      ).rejects.toThrow("Cannot create window")
    })
  })

  describe("removeCompositeTab", () => {
    it("removes only the tab when other tabs remain in the composite window", async () => {
      vi.spyOn(browserApi_tabs, "queryTabs").mockResolvedValue([
        { id: 10 },
        { id: 20 },
      ] as any)
      const removeTabSpy = vi
        .spyOn(browserApi_tabs, "removeTab")
        .mockResolvedValue(undefined as any)
      const removeWindowSpy = vi.spyOn(browserApi_windows, "removeWindow")

      await removeCompositeTab(700, 10)

      expect(removeTabSpy).toHaveBeenCalledWith(10)
      expect(removeWindowSpy).not.toHaveBeenCalled()
    })

    it("removes the entire window when the target tab is the only tab", async () => {
      vi.spyOn(browserApi_windows, "createWindow").mockResolvedValue({
        id: 800,
      } as any)
      vi.spyOn(browserApi_windows, "updateWindow").mockResolvedValue({} as any)
      vi.spyOn(browserApi_tabs, "queryTabs").mockResolvedValue([
        { id: 10 },
      ] as any)

      await openTabInCompositeWindow({
        origin: "https://example.com",
        requestId: "req-800",
      })

      const removeWindowSpy = vi
        .spyOn(browserApi_windows, "removeWindow")
        .mockResolvedValue(undefined as any)

      await removeCompositeTab(800, 10)

      expect(removeWindowSpy).toHaveBeenCalledWith(800)
      expect(await hasLiveCompositeWindow()).toBe(false)
    })

    it("falls back to removeTab if queryTabs fails", async () => {
      vi.spyOn(browserApi_tabs, "queryTabs").mockRejectedValue(
        new Error("query failed"),
      )
      const removeTabSpy = vi
        .spyOn(browserApi_tabs, "removeTab")
        .mockResolvedValue(undefined as any)

      await removeCompositeTab(801, 10)

      expect(removeTabSpy).toHaveBeenCalledWith(10)
    })

    it("falls back to removeTab if removeWindow fails", async () => {
      vi.spyOn(browserApi_tabs, "queryTabs").mockResolvedValue([
        { id: 10 },
      ] as any)
      vi.spyOn(browserApi_windows, "removeWindow").mockRejectedValue(
        new Error("remove failed"),
      )
      const removeTabSpy = vi
        .spyOn(browserApi_tabs, "removeTab")
        .mockResolvedValue(undefined as any)

      await removeCompositeTab(802, 10)

      expect(removeTabSpy).toHaveBeenCalledWith(10)
    })
  })

  describe("forgetCompositeWindow", () => {
    it("clears remembered window ID when matching", async () => {
      vi.spyOn(browserApi_windows, "createWindow").mockResolvedValue({
        id: 900,
      } as any)
      vi.spyOn(browserApi_windows, "updateWindow").mockResolvedValue({} as any)
      vi.spyOn(browserApi_tabs, "queryTabs").mockResolvedValue([
        { id: 90 },
      ] as any)

      await openTabInCompositeWindow({
        origin: "https://example.com",
        requestId: "req-15",
      })

      forgetCompositeWindow(900)
      expect(await hasLiveCompositeWindow()).toBe(false)
    })

    it("does nothing when non-matching window ID is passed", async () => {
      vi.spyOn(browserApi_windows, "createWindow").mockResolvedValue({
        id: 901,
      } as any)
      vi.spyOn(browserApi_windows, "updateWindow").mockResolvedValue({} as any)
      vi.spyOn(browserApi_tabs, "queryTabs").mockResolvedValue([
        { id: 91 },
      ] as any)
      vi.spyOn(browserApi_windows, "getWindow").mockResolvedValue({
        id: 901,
      } as any)

      await openTabInCompositeWindow({
        origin: "https://example.com",
        requestId: "req-16",
      })

      forgetCompositeWindow(999)
      expect(await hasLiveCompositeWindow()).toBe(true)
    })
  })
})
