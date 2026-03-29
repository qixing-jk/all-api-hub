import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const originalBrowser = (globalThis as any).browser

describe("tempWindowPool open/close handlers", () => {
  let createTabMock: ReturnType<typeof vi.fn>
  let createWindowMock: ReturnType<typeof vi.fn>
  let hasWindowsApiMock: ReturnType<typeof vi.fn>
  let onTabRemovedMock: ReturnType<typeof vi.fn>
  let onWindowRemovedMock: ReturnType<typeof vi.fn>
  let removeTabOrWindowMock: ReturnType<typeof vi.fn>
  let tabsQueryMock: ReturnType<typeof vi.fn>
  let windowsGetMock: ReturnType<typeof vi.fn>
  let tempContextMode: "window" | "composite" | "tab"

  beforeEach(() => {
    createTabMock = vi.fn()
    createWindowMock = vi.fn()
    hasWindowsApiMock = vi.fn(() => true)
    onTabRemovedMock = vi.fn(() => () => {})
    onWindowRemovedMock = vi.fn(() => () => {})
    removeTabOrWindowMock = vi.fn().mockResolvedValue(undefined)
    tabsQueryMock = vi.fn().mockResolvedValue([{ id: 902 }])
    windowsGetMock = vi.fn().mockResolvedValue({ id: 901 })
    tempContextMode = "window"

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
        removeTabOrWindow: removeTabOrWindowMock,
      }
    })
    vi.doMock("~/services/preferences/userPreferences", () => ({
      DEFAULT_PREFERENCES: {
        tempWindowFallback: {
          tempContextMode,
        },
      },
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
    tempContextMode = "window"
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

    expect(removeTabOrWindowMock).toHaveBeenCalledWith(801)
    expect(closeResponse).toHaveBeenCalledWith({ success: true })
  })

  it("opens a composite temp tab when composite mode is enabled", async () => {
    tempContextMode = "composite"
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
    tempContextMode = "composite"
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

  it("recreates the composite window after a stale reuse failure", async () => {
    tempContextMode = "composite"
    createWindowMock
      .mockResolvedValueOnce({ id: 901 })
      .mockResolvedValueOnce({ id: 905 })
    createTabMock.mockResolvedValueOnce({})
    tabsQueryMock
      .mockResolvedValueOnce([{ id: 902 }])
      .mockResolvedValueOnce([{ id: 906 }])

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

    const secondResponse = vi.fn()
    await handleOpenTempWindow(
      {
        requestId: "req-composite-recreated",
        url: "https://example.com/composite/recreated",
      },
      secondResponse,
    )

    expect(createWindowMock).toHaveBeenCalledTimes(2)
    expect(removeTabOrWindowMock).toHaveBeenCalledWith(901)
    expect(secondResponse).toHaveBeenCalledWith({
      success: true,
      windowId: 905,
      tabId: 906,
    })
  })

  it("shares an in-flight composite window creation across concurrent opens", async () => {
    tempContextMode = "composite"

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

  it("falls back to a plain tab when window mode is unavailable", async () => {
    tempContextMode = "window"
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
    tempContextMode = "window"
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
    tempContextMode = "tab"
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
})
