import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import {
  TEMP_CONTEXT_MODES,
  type TempContextMode,
} from "~/services/preferences/userPreferences"

const originalBrowser = (globalThis as any).browser

describe("tempWindowPool open/close handlers", () => {
  let createTabMock: ReturnType<typeof vi.fn>
  let createWindowMock: ReturnType<typeof vi.fn>
  let hasWindowsApiMock: ReturnType<typeof vi.fn>
  let onTabRemovedMock: ReturnType<typeof vi.fn>
  let onWindowRemovedMock: ReturnType<typeof vi.fn>
  let removeTabMock: ReturnType<typeof vi.fn>
  let removeWindowMock: ReturnType<typeof vi.fn>
  let removeTabOrWindowMock: ReturnType<typeof vi.fn>
  let tabsQueryMock: ReturnType<typeof vi.fn>
  let windowsGetMock: ReturnType<typeof vi.fn>
  let tempContextMode: TempContextMode

  beforeEach(() => {
    createTabMock = vi.fn()
    createWindowMock = vi.fn()
    hasWindowsApiMock = vi.fn(() => true)
    onTabRemovedMock = vi.fn(() => () => {})
    onWindowRemovedMock = vi.fn(() => () => {})
    removeTabMock = vi.fn().mockResolvedValue(undefined)
    removeWindowMock = vi.fn().mockResolvedValue(undefined)
    removeTabOrWindowMock = vi.fn().mockResolvedValue(undefined)
    tabsQueryMock = vi.fn().mockResolvedValue([{ id: 902 }])
    windowsGetMock = vi.fn().mockResolvedValue({ id: 901 })
    tempContextMode = TEMP_CONTEXT_MODES.Window

    vi.useFakeTimers()
    vi.resetModules()
    ;(globalThis as any).browser = {
      runtime: {
        getURL: vi.fn((path: string) => `chrome-extension://test/${path}`),
      },
      tabs: {
        query: tabsQueryMock,
      },
      windows: {
        get: windowsGetMock,
        update: vi.fn().mockResolvedValue(undefined),
      },
    }

    vi.doMock("~/utils/browser/browserApi", async (importOriginal) => {
      const actual =
        await importOriginal<typeof import("~/utils/browser/browserApi")>()

      return {
        ...actual,
        createTab: createTabMock,
        createWindow: createWindowMock,
        hasWindowsAPI: hasWindowsApiMock,
        onTabRemoved: onTabRemovedMock,
        onWindowRemoved: onWindowRemovedMock,
        removeTab: removeTabMock,
        removeTabOrWindow: removeTabOrWindowMock,
        removeWindow: removeWindowMock,
      }
    })
    vi.doMock("~/services/preferences/userPreferences", () => ({
      DEFAULT_PREFERENCES: {
        tempWindowFallback: {
          tempContextMode,
        },
      },
      TEMP_CONTEXT_MODES,
      userPreferences: {
        getPreferences: vi.fn().mockImplementation(() =>
          Promise.resolve({
            tempWindowFallback: {
              tempContextMode,
            },
          }),
        ),
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

  it("opens and closes a popup temp window in window mode", async () => {
    tempContextMode = TEMP_CONTEXT_MODES.Window
    createWindowMock.mockResolvedValueOnce({ id: 801 })

    const { handleCloseTempWindow, handleOpenTempWindow } = await import(
      "~/entrypoints/background/tempWindowPool"
    )

    const openResponse = vi.fn()
    await handleOpenTempWindow(
      {
        requestId: "req-window",
        url: "https://example.com/window",
      },
      openResponse,
    )

    expect(openResponse).toHaveBeenCalledWith({
      success: true,
      windowId: 801,
    })

    const closeResponse = vi.fn()
    await handleCloseTempWindow({ requestId: "req-window" }, closeResponse)

    expect(removeWindowMock).toHaveBeenCalledWith(801)
    expect(removeTabOrWindowMock).not.toHaveBeenCalled()
    expect(closeResponse).toHaveBeenCalledWith({ success: true })
  })

  it("opens a composite temp tab when composite mode is enabled", async () => {
    tempContextMode = TEMP_CONTEXT_MODES.Composite
    createWindowMock.mockResolvedValueOnce({ id: 901 })

    const { handleOpenTempWindow } = await import(
      "~/entrypoints/background/tempWindowPool"
    )

    const sendResponse = vi.fn()
    await handleOpenTempWindow(
      {
        requestId: "req-composite",
        url: "https://example.com/composite",
      },
      sendResponse,
    )

    expect(createWindowMock).toHaveBeenCalledWith(
      expect.objectContaining({
        focused: false,
        type: "normal",
        url: "https://example.com/composite",
      }),
    )
    expect(sendResponse).toHaveBeenCalledWith({
      success: true,
      windowId: 901,
      tabId: 902,
    })
  })

  it("reuses the existing composite window for later temp opens", async () => {
    tempContextMode = TEMP_CONTEXT_MODES.Composite
    createWindowMock.mockResolvedValueOnce({ id: 901 })
    createTabMock.mockResolvedValueOnce({ id: 903 })

    const { handleOpenTempWindow } = await import(
      "~/entrypoints/background/tempWindowPool"
    )

    const firstResponse = vi.fn()
    await handleOpenTempWindow(
      {
        requestId: "req-composite-first",
        url: "https://example.com/composite/first",
      },
      firstResponse,
    )

    const secondResponse = vi.fn()
    await handleOpenTempWindow(
      {
        requestId: "req-composite-second",
        url: "https://example.com/composite/second",
      },
      secondResponse,
    )

    expect(createWindowMock).toHaveBeenCalledTimes(1)
    expect(windowsGetMock).toHaveBeenCalledWith(901)
    expect(createTabMock).toHaveBeenCalledWith(
      "https://example.com/composite/second",
      false,
      { windowId: 901 },
    )
    expect(secondResponse).toHaveBeenCalledWith({
      success: true,
      windowId: 901,
      tabId: 903,
    })
  })

  it("closes the owner window for the final manual composite tab", async () => {
    tempContextMode = TEMP_CONTEXT_MODES.Composite
    createWindowMock.mockResolvedValueOnce({ id: 901 })
    tabsQueryMock.mockResolvedValue([{ id: 902 }])

    const { handleCloseTempWindow, handleOpenTempWindow } = await import(
      "~/entrypoints/background/tempWindowPool"
    )
    await handleOpenTempWindow(
      {
        requestId: "req-composite-final",
        url: "https://example.invalid/composite/final",
      },
      vi.fn(),
    )

    const closeResponse = vi.fn()
    await handleCloseTempWindow(
      { requestId: "req-composite-final" },
      closeResponse,
    )

    expect(removeWindowMock).toHaveBeenCalledWith(901)
    expect(removeTabMock).not.toHaveBeenCalled()
    expect(removeTabOrWindowMock).not.toHaveBeenCalled()
    expect(closeResponse).toHaveBeenCalledWith({ success: true })
  })

  it("removes only the completed composite tab when another tab exists", async () => {
    tempContextMode = TEMP_CONTEXT_MODES.Composite
    createWindowMock.mockResolvedValueOnce({ id: 911 })
    tabsQueryMock
      .mockResolvedValueOnce([{ id: 912 }])
      .mockResolvedValueOnce([{ id: 912 }, { id: 913 }])

    const { handleCloseTempWindow, handleOpenTempWindow } = await import(
      "~/entrypoints/background/tempWindowPool"
    )
    await handleOpenTempWindow(
      {
        requestId: "req-composite-shared",
        url: "https://example.invalid/composite/shared",
      },
      vi.fn(),
    )

    await handleCloseTempWindow({ requestId: "req-composite-shared" }, vi.fn())

    expect(removeTabMock).toHaveBeenCalledWith(912)
    expect(removeWindowMock).not.toHaveBeenCalled()
    expect(removeTabOrWindowMock).not.toHaveBeenCalled()
  })

  it("preserves a confirmed composite window when tab creation fails", async () => {
    tempContextMode = TEMP_CONTEXT_MODES.Composite
    createWindowMock.mockResolvedValueOnce({ id: 901 })
    createTabMock.mockResolvedValueOnce({})
    tabsQueryMock
      .mockResolvedValueOnce([{ id: 902 }])
      .mockResolvedValueOnce([{ id: 902 }, { id: 905 }])

    const { handleOpenTempWindow } = await import(
      "~/entrypoints/background/tempWindowPool"
    )

    const firstResponse = vi.fn()
    await handleOpenTempWindow(
      {
        requestId: "req-composite-initial",
        url: "https://example.com/composite/initial",
      },
      firstResponse,
    )

    const failedResponse = vi.fn()
    await handleOpenTempWindow(
      {
        requestId: "req-composite-tab-failure",
        url: "https://example.com/composite/tab-failure",
      },
      failedResponse,
    )

    expect(createWindowMock).toHaveBeenCalledTimes(1)
    expect(removeWindowMock).not.toHaveBeenCalled()
    expect(removeTabOrWindowMock).not.toHaveBeenCalled()
    expect(failedResponse).toHaveBeenCalledWith({
      success: false,
      error: "messages:background.windowCreationUnavailable",
    })

    createTabMock.mockResolvedValueOnce({ id: 905 })
    const reusedResponse = vi.fn()
    await handleOpenTempWindow(
      {
        requestId: "req-composite-reused-after-tab-failure",
        url: "https://example.com/composite/reused-after-tab-failure",
      },
      reusedResponse,
    )

    expect(createWindowMock).toHaveBeenCalledTimes(1)
    expect(createTabMock).toHaveBeenLastCalledWith(
      "https://example.com/composite/reused-after-tab-failure",
      false,
      { windowId: 901 },
    )
    expect(reusedResponse).toHaveBeenCalledWith({
      success: true,
      windowId: 901,
      tabId: 905,
    })
  })

  it("recreates the composite window when the existing window handle is unavailable", async () => {
    tempContextMode = TEMP_CONTEXT_MODES.Composite
    createWindowMock
      .mockResolvedValueOnce({ id: 901 })
      .mockResolvedValueOnce({ id: 905 })
    windowsGetMock.mockResolvedValueOnce(null)
    tabsQueryMock
      .mockResolvedValueOnce([{ id: 902 }])
      .mockResolvedValueOnce([{ id: 906 }])

    const { handleOpenTempWindow } = await import(
      "~/entrypoints/background/tempWindowPool"
    )

    const firstResponse = vi.fn()
    await handleOpenTempWindow(
      {
        requestId: "req-composite-null-window-initial",
        url: "https://example.com/composite/null-window/initial",
      },
      firstResponse,
    )

    const secondResponse = vi.fn()
    await handleOpenTempWindow(
      {
        requestId: "req-composite-null-window-recreated",
        url: "https://example.com/composite/null-window/recreated",
      },
      secondResponse,
    )

    expect(windowsGetMock).toHaveBeenCalledWith(901)
    expect(createWindowMock).toHaveBeenCalledTimes(2)
    expect(removeTabOrWindowMock).not.toHaveBeenCalled()
    expect(secondResponse).toHaveBeenCalledWith({
      success: true,
      windowId: 905,
      tabId: 906,
    })
  })

  it("does not remove a confirmed composite window when tab creation fails", async () => {
    tempContextMode = TEMP_CONTEXT_MODES.Composite
    createWindowMock.mockResolvedValueOnce({ id: 901 })
    createTabMock.mockResolvedValueOnce({})
    tabsQueryMock.mockResolvedValueOnce([{ id: 902 }])

    const { handleOpenTempWindow } = await import(
      "~/entrypoints/background/tempWindowPool"
    )

    const firstResponse = vi.fn()
    await handleOpenTempWindow(
      {
        requestId: "req-composite-cleanup-failure-first",
        url: "https://example.com/composite/cleanup-failure/first",
      },
      firstResponse,
    )

    const secondResponse = vi.fn()
    await handleOpenTempWindow(
      {
        requestId: "req-composite-preserve-after-tab-failure",
        url: "https://example.com/composite/preserve-after-tab-failure",
      },
      secondResponse,
    )

    expect(createWindowMock).toHaveBeenCalledTimes(1)
    expect(removeWindowMock).not.toHaveBeenCalled()
    expect(removeTabOrWindowMock).not.toHaveBeenCalled()
    expect(secondResponse).toHaveBeenCalledWith({
      success: false,
      error: "messages:background.windowCreationUnavailable",
    })
  })

  it("shares an in-flight composite window creation across concurrent opens", async () => {
    tempContextMode = TEMP_CONTEXT_MODES.Composite

    let resolveWindow!: (value: { id: number }) => void
    const windowCreated = new Promise<{ id: number }>((resolve) => {
      resolveWindow = resolve
    })
    createWindowMock.mockReturnValueOnce(windowCreated)
    tabsQueryMock.mockResolvedValueOnce([{ id: 902 }])
    createTabMock.mockResolvedValueOnce({ id: 903 })

    const { handleOpenTempWindow } = await import(
      "~/entrypoints/background/tempWindowPool"
    )

    const firstResponse = vi.fn()
    const secondResponse = vi.fn()

    const firstOpen = handleOpenTempWindow(
      {
        requestId: "req-composite-concurrent-1",
        url: "https://example.com/composite/concurrent-1",
      },
      firstResponse,
    )
    const secondOpen = handleOpenTempWindow(
      {
        requestId: "req-composite-concurrent-2",
        url: "https://example.com/composite/concurrent-2",
      },
      secondResponse,
    )

    await Promise.resolve()
    await Promise.resolve()
    resolveWindow({ id: 901 })
    await Promise.all([firstOpen, secondOpen])

    expect(createWindowMock).toHaveBeenCalledTimes(1)
    expect(createTabMock).toHaveBeenCalledWith(
      "https://example.com/composite/concurrent-2",
      false,
      { windowId: 901 },
    )
    expect(firstResponse).toHaveBeenCalledWith({
      success: true,
      windowId: 901,
      tabId: 902,
    })
    expect(secondResponse).toHaveBeenCalledWith({
      success: true,
      windowId: 901,
      tabId: 903,
    })
  })

  it("surfaces a concurrent composite-tab creation failure after the shared window is created", async () => {
    tempContextMode = TEMP_CONTEXT_MODES.Composite

    let resolveWindow!: (value: { id: number }) => void
    const windowCreated = new Promise<{ id: number }>((resolve) => {
      resolveWindow = resolve
    })
    createWindowMock.mockReturnValueOnce(windowCreated)
    tabsQueryMock.mockResolvedValueOnce([{ id: 902 }])
    createTabMock.mockResolvedValueOnce({})

    const { handleOpenTempWindow } = await import(
      "~/entrypoints/background/tempWindowPool"
    )

    const firstResponse = vi.fn()
    const secondResponse = vi.fn()

    const firstOpen = handleOpenTempWindow(
      {
        requestId: "req-composite-concurrent-fail-1",
        url: "https://example.com/composite/concurrent-fail-1",
      },
      firstResponse,
    )
    const secondOpen = handleOpenTempWindow(
      {
        requestId: "req-composite-concurrent-fail-2",
        url: "https://example.com/composite/concurrent-fail-2",
      },
      secondResponse,
    )

    await Promise.resolve()
    await Promise.resolve()
    resolveWindow({ id: 901 })
    await Promise.all([firstOpen, secondOpen])

    expect(createWindowMock).toHaveBeenCalledTimes(1)
    expect(createTabMock).toHaveBeenCalledWith(
      "https://example.com/composite/concurrent-fail-2",
      false,
      { windowId: 901 },
    )
    expect(firstResponse).toHaveBeenCalledWith({
      success: true,
      windowId: 901,
      tabId: 902,
    })
    expect(secondResponse).toHaveBeenCalledWith({
      success: false,
      error: "messages:background.windowCreationUnavailable",
    })
  })

  it("serializes final composite cleanup with a concurrent open", async () => {
    tempContextMode = TEMP_CONTEXT_MODES.Composite
    createWindowMock
      .mockResolvedValueOnce({ id: 921 })
      .mockResolvedValueOnce({ id: 925 })
    createTabMock.mockResolvedValueOnce({ id: 923 })
    tabsQueryMock.mockResolvedValueOnce([{ id: 922 }])

    let resolveCleanupQuery!: (tabs: browser.tabs.Tab[]) => void
    tabsQueryMock.mockReturnValueOnce(
      new Promise<browser.tabs.Tab[]>((resolve) => {
        resolveCleanupQuery = resolve
      }),
    )
    tabsQueryMock.mockResolvedValueOnce([{ id: 926 }])

    const { handleCloseTempWindow, handleOpenTempWindow } = await import(
      "~/entrypoints/background/tempWindowPool"
    )
    await handleOpenTempWindow(
      {
        requestId: "req-composite-race-old",
        url: "https://example.invalid/composite/race/old",
      },
      vi.fn(),
    )

    const closePromise = handleCloseTempWindow(
      { requestId: "req-composite-race-old" },
      vi.fn(),
    )
    const nextResponse = vi.fn()
    const nextOpenPromise = handleOpenTempWindow(
      {
        requestId: "req-composite-race-new",
        url: "https://example.invalid/composite/race/new",
      },
      nextResponse,
    )

    expect(createWindowMock).toHaveBeenCalledTimes(1)
    resolveCleanupQuery([{ id: 922 } as browser.tabs.Tab])
    await Promise.all([closePromise, nextOpenPromise])

    expect(removeWindowMock).toHaveBeenCalledWith(921)
    expect(createWindowMock).toHaveBeenCalledTimes(2)
    expect(nextResponse).toHaveBeenCalledWith({
      success: true,
      windowId: 925,
      tabId: 926,
    })
  })

  it("falls back to a plain tab when window mode is unavailable", async () => {
    tempContextMode = TEMP_CONTEXT_MODES.Window
    hasWindowsApiMock.mockReturnValue(false)
    createTabMock.mockResolvedValueOnce({ id: 701 })

    const { handleOpenTempWindow } = await import(
      "~/entrypoints/background/tempWindowPool"
    )

    const sendResponse = vi.fn()
    await handleOpenTempWindow(
      {
        requestId: "req-tab",
        url: "https://example.com/tab",
      },
      sendResponse,
    )

    expect(createTabMock).toHaveBeenCalledWith("https://example.com/tab", false)
    expect(sendResponse).toHaveBeenCalledWith({
      success: true,
      tabId: 701,
    })
  })

  it("returns an error when window mode cannot provide a window id", async () => {
    tempContextMode = TEMP_CONTEXT_MODES.Window
    createWindowMock.mockResolvedValueOnce({})

    const { handleOpenTempWindow } = await import(
      "~/entrypoints/background/tempWindowPool"
    )

    const sendResponse = vi.fn()
    await handleOpenTempWindow(
      {
        requestId: "req-window-missing-id",
        url: "https://example.com/window",
      },
      sendResponse,
    )

    expect(sendResponse).toHaveBeenCalledWith({
      success: false,
      error: "messages:background.cannotCreateWindow",
    })
  })

  it("returns an error when tab mode cannot provide a tab id", async () => {
    tempContextMode = TEMP_CONTEXT_MODES.Tab
    createTabMock.mockResolvedValueOnce({})

    const { handleOpenTempWindow } = await import(
      "~/entrypoints/background/tempWindowPool"
    )

    const sendResponse = vi.fn()
    await handleOpenTempWindow(
      {
        requestId: "req-tab-missing-id",
        url: "https://example.com/tab",
      },
      sendResponse,
    )

    expect(sendResponse).toHaveBeenCalledWith({
      success: false,
      error: "messages:background.cannotCreateWindow",
    })
  })

  it("surfaces unexpected popup-window creation failures to the caller", async () => {
    tempContextMode = TEMP_CONTEXT_MODES.Window
    createWindowMock.mockRejectedValueOnce(new Error("window blocked"))

    const { handleOpenTempWindow } = await import(
      "~/entrypoints/background/tempWindowPool"
    )

    const sendResponse = vi.fn()
    await handleOpenTempWindow(
      {
        requestId: "req-window-error",
        url: "https://example.com/window-error",
      },
      sendResponse,
    )

    expect(sendResponse).toHaveBeenCalledWith({
      success: false,
      error: "window blocked",
    })
  })

  it("surfaces unexpected plain-tab creation failures to the caller", async () => {
    tempContextMode = TEMP_CONTEXT_MODES.Tab
    createTabMock.mockRejectedValueOnce(new Error("tab blocked"))

    const { handleOpenTempWindow } = await import(
      "~/entrypoints/background/tempWindowPool"
    )

    const sendResponse = vi.fn()
    await handleOpenTempWindow(
      {
        requestId: "req-tab-error",
        url: "https://example.com/tab-error",
      },
      sendResponse,
    )

    expect(sendResponse).toHaveBeenCalledWith({
      success: false,
      error: "tab blocked",
    })
  })

  it("returns a not-found error when closing an unknown temp window", async () => {
    const { handleCloseTempWindow } = await import(
      "~/entrypoints/background/tempWindowPool"
    )

    const sendResponse = vi.fn()
    await handleCloseTempWindow({ requestId: "missing" }, sendResponse)

    expect(removeTabOrWindowMock).not.toHaveBeenCalled()
    expect(sendResponse).toHaveBeenCalledWith({
      success: false,
      error: "messages:background.windowNotFound",
    })
  })

  it("registers tab and window cleanup listeners", async () => {
    const { setupTempWindowListeners } = await import(
      "~/entrypoints/background/tempWindowPool"
    )

    setupTempWindowListeners()

    expect(onWindowRemovedMock).toHaveBeenCalledTimes(1)
    expect(onTabRemovedMock).toHaveBeenCalledTimes(1)
  })

  it("drops tracked popup-window mappings when the browser reports the temp window was closed", async () => {
    tempContextMode = TEMP_CONTEXT_MODES.Window
    createWindowMock.mockResolvedValueOnce({ id: 811 })

    const {
      handleCloseTempWindow,
      handleOpenTempWindow,
      setupTempWindowListeners,
    } = await import("~/entrypoints/background/tempWindowPool")

    setupTempWindowListeners()
    const onWindowRemoved = onWindowRemovedMock.mock.calls[0]?.[0]

    const openResponse = vi.fn()
    await handleOpenTempWindow(
      {
        requestId: "req-window-removed",
        url: "https://example.com/window-removed",
      },
      openResponse,
    )

    expect(openResponse).toHaveBeenCalledWith({
      success: true,
      windowId: 811,
    })

    await onWindowRemoved?.(811)

    const closeResponse = vi.fn()
    await handleCloseTempWindow(
      { requestId: "req-window-removed" },
      closeResponse,
    )

    expect(closeResponse).toHaveBeenCalledWith({
      success: false,
      error: "messages:background.windowNotFound",
    })
    expect(removeTabOrWindowMock).not.toHaveBeenCalled()
  })

  it("recreates the composite window after the browser reports the shared window was closed", async () => {
    tempContextMode = TEMP_CONTEXT_MODES.Composite
    createWindowMock
      .mockResolvedValueOnce({ id: 901 })
      .mockResolvedValueOnce({ id: 905 })
    tabsQueryMock
      .mockResolvedValueOnce([{ id: 902 }])
      .mockResolvedValueOnce([{ id: 906 }])

    const { handleOpenTempWindow, setupTempWindowListeners } = await import(
      "~/entrypoints/background/tempWindowPool"
    )

    setupTempWindowListeners()
    const onWindowRemoved = onWindowRemovedMock.mock.calls[0]?.[0]

    const firstResponse = vi.fn()
    await handleOpenTempWindow(
      {
        requestId: "req-composite-closed-first",
        url: "https://example.com/composite/closed-first",
      },
      firstResponse,
    )

    await onWindowRemoved?.(901)

    const secondResponse = vi.fn()
    await handleOpenTempWindow(
      {
        requestId: "req-composite-closed-second",
        url: "https://example.com/composite/closed-second",
      },
      secondResponse,
    )

    expect(createWindowMock).toHaveBeenCalledTimes(2)
    expect(secondResponse).toHaveBeenCalledWith({
      success: true,
      windowId: 905,
      tabId: 906,
    })
  })

  it("drops tracked plain-tab mappings when the browser reports the temp tab was closed", async () => {
    tempContextMode = TEMP_CONTEXT_MODES.Tab
    createTabMock.mockResolvedValueOnce({ id: 711 })

    const {
      handleCloseTempWindow,
      handleOpenTempWindow,
      setupTempWindowListeners,
    } = await import("~/entrypoints/background/tempWindowPool")

    setupTempWindowListeners()
    const onTabRemoved = onTabRemovedMock.mock.calls[0]?.[0]

    const openResponse = vi.fn()
    await handleOpenTempWindow(
      {
        requestId: "req-tab-removed",
        url: "https://example.com/tab-removed",
      },
      openResponse,
    )

    expect(openResponse).toHaveBeenCalledWith({
      success: true,
      tabId: 711,
    })

    await onTabRemoved?.(711)

    const closeResponse = vi.fn()
    await handleCloseTempWindow({ requestId: "req-tab-removed" }, closeResponse)

    expect(closeResponse).toHaveBeenCalledWith({
      success: false,
      error: "messages:background.windowNotFound",
    })
    expect(removeTabOrWindowMock).not.toHaveBeenCalled()
  })
})
