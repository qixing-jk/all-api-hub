import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { RuntimeActionIds } from "~/constants/runtimeActions"

const originalBrowser = (globalThis as any).browser

describe("cleanupTempContextsOnSuspend", () => {
  let createTabMock: ReturnType<typeof vi.fn>
  let removeTabOrWindowMock: ReturnType<typeof vi.fn>

  beforeEach(() => {
    createTabMock = vi
      .fn()
      .mockResolvedValueOnce({ id: 101 })
      .mockResolvedValueOnce({ id: 202 })
    removeTabOrWindowMock = vi.fn().mockResolvedValue(undefined)

    vi.useFakeTimers()
    vi.resetModules()
    ;(globalThis as any).browser = {
      runtime: {
        getURL: vi.fn((path: string) => `chrome-extension://test/${path}`),
      },
      tabs: {
        get: vi.fn().mockResolvedValue({ status: "complete" }),
        sendMessage: vi.fn(
          async (_tabId: number, message: { action: string }) => {
            switch (message.action) {
              case RuntimeActionIds.ContentShowShieldBypassUi:
                return undefined
              case RuntimeActionIds.ContentCheckCapGuard:
              case RuntimeActionIds.ContentCheckCloudflareGuard:
                return { success: true, passed: true }
              case RuntimeActionIds.ContentGetRenderedTitle:
                return { success: true, title: "Example title" }
              default:
                throw new Error(`Unexpected action: ${message.action}`)
            }
          },
        ),
      },
    }

    vi.doMock("~/utils/browser/browserApi", async (importOriginal) => {
      const actual =
        await importOriginal<typeof import("~/utils/browser/browserApi")>()
      return {
        ...actual,
        createTab: createTabMock,
        createWindow: vi.fn(),
        hasWindowsAPI: vi.fn(() => false),
        isAllowedIncognitoAccess: vi.fn().mockResolvedValue(true),
        onTabRemoved: vi.fn(() => () => {}),
        onWindowRemoved: vi.fn(() => () => {}),
        removeTabOrWindow: removeTabOrWindowMock,
      }
    })
    vi.doMock("~/services/preferences/userPreferences", () => ({
      DEFAULT_PREFERENCES: {
        tempWindowFallback: {
          tempContextMode: "tab",
        },
      },
      userPreferences: {
        getPreferences: vi.fn().mockResolvedValue({
          tempWindowFallback: {
            tempContextMode: "tab",
          },
        }),
      },
    }))
    vi.doMock("~/utils/i18n/core", () => ({
      t: vi.fn((key: string) => key),
    }))
  })

  afterEach(() => {
    ;(globalThis as any).browser = originalBrowser

    vi.useRealTimers()
    vi.doUnmock("~/utils/browser/browserApi")
    vi.doUnmock("~/services/preferences/userPreferences")
    vi.doUnmock("~/utils/i18n/core")
    vi.resetModules()
    vi.restoreAllMocks()
  })

  it("destroys tracked temp contexts on suspend and clears request mappings", async () => {
    const {
      cleanupTempContextsOnSuspend,
      handleCloseTempWindow,
      handleTempWindowGetRenderedTitle,
    } = await import("~/entrypoints/background/tempWindowPool")

    const firstResponse = vi.fn()
    const firstRequest = handleTempWindowGetRenderedTitle(
      {
        originUrl: "https://example.com/protected",
        requestId: "req-1",
      },
      firstResponse,
    )

    await vi.advanceTimersByTimeAsync(500)
    await firstRequest

    expect(firstResponse).toHaveBeenCalledWith({
      success: true,
      title: "Example title",
    })
    expect(createTabMock).toHaveBeenCalledTimes(1)

    await cleanupTempContextsOnSuspend()

    expect(removeTabOrWindowMock).toHaveBeenCalledWith(101)

    const closeResponse = vi.fn()
    await handleCloseTempWindow({ requestId: "req-1" }, closeResponse)

    expect(closeResponse).toHaveBeenCalledWith(
      expect.objectContaining({ success: false }),
    )

    await vi.advanceTimersByTimeAsync(2000)
    expect(removeTabOrWindowMock).toHaveBeenCalledTimes(1)

    const secondResponse = vi.fn()
    const secondRequest = handleTempWindowGetRenderedTitle(
      {
        originUrl: "https://example.com/protected/again",
        requestId: "req-2",
      },
      secondResponse,
    )

    await vi.advanceTimersByTimeAsync(500)
    await secondRequest

    expect(secondResponse).toHaveBeenCalledWith({
      success: true,
      title: "Example title",
    })
    expect(createTabMock).toHaveBeenCalledTimes(2)

    await cleanupTempContextsOnSuspend()
    await vi.advanceTimersByTimeAsync(2000)

    expect(removeTabOrWindowMock).toHaveBeenCalledTimes(2)
    expect(removeTabOrWindowMock).toHaveBeenLastCalledWith(202)
  })

  it("resolves without closing anything when no temp contexts are tracked", async () => {
    const { cleanupTempContextsOnSuspend } = await import(
      "~/entrypoints/background/tempWindowPool"
    )

    await expect(cleanupTempContextsOnSuspend()).resolves.toBeUndefined()
    expect(removeTabOrWindowMock).not.toHaveBeenCalled()
  })
})
