import { afterAll, beforeEach, describe, expect, it, vi } from "vitest"

import { RuntimeActionIds } from "~/constants/runtimeActions"
import {
  addActionClickListener,
  checkPermissionViaMessage,
  classifyRecoverableWindowCreationFailure,
  clearAlarm,
  clearNotification,
  containsPermissions,
  createAlarm,
  createNotification,
  createWindow,
  focusTab,
  getActionApi,
  getActiveOrAllTabs,
  getActiveTab,
  getActiveTabs,
  getAlarm,
  getAllAlarms,
  getAllTabs,
  getExtensionURL,
  getManifest,
  getManifestVersion,
  hasAlarmsAPI,
  hasNotificationsAPI,
  isAllowedIncognitoAccess,
  isMessageReceiverUnavailableError,
  onAlarm,
  onInstalled,
  onNotificationClicked,
  onPermissionsAdded,
  onPermissionsRemoved,
  onRuntimeMessage,
  onStartup,
  onSuspend,
  onTabActivated,
  onTabRemoved,
  onTabUpdated,
  onWindowRemoved,
  removeActionClickListener,
  removePermissions,
  removeTabOrWindow,
  requestPermissions,
  sendRuntimeActionMessage,
  sendTabMessageWithRetry,
  setActionPopup,
  WINDOW_CREATION_FAILURE_REASONS,
} from "~/utils/browser/browserApi"

const originalBrowser = (globalThis as any).browser
const originalChrome = (globalThis as any).chrome

// Note: these helpers now use the unified logger, so tests avoid asserting on `console.*` output.
describe("browserApi alarms helpers", () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    ;(globalThis as any).browser = undefined
  })

  it("hasAlarmsAPI should return false when browser.alarms is missing", () => {
    ;(globalThis as any).browser = {}

    expect(hasAlarmsAPI()).toBe(false)
  })

  it("hasAlarmsAPI should return true when browser.alarms exists", () => {
    ;(globalThis as any).browser = { alarms: {} }

    expect(hasAlarmsAPI()).toBe(true)
  })

  it("createAlarm should warn and not throw when alarms API is not supported", async () => {
    ;(globalThis as any).browser = {}

    await expect(
      createAlarm("test", { when: Date.now() }),
    ).resolves.toBeUndefined()
  })

  it("createAlarm should delegate to browser.alarms.create when supported", async () => {
    const createMock = vi.fn()
    ;(globalThis as any).browser = {
      alarms: {
        create: createMock,
      },
    }

    const when = Date.now()
    await createAlarm("test-alarm", { when })

    expect(createMock).toHaveBeenCalledWith("test-alarm", { when })
  })

  it("clearAlarm should return false and warn when alarms API is not supported", async () => {
    ;(globalThis as any).browser = {}

    const result = await clearAlarm("missing")

    expect(result).toBe(false)
  })

  it("clearAlarm should delegate to browser.alarms.clear when supported", async () => {
    const clearMock = vi.fn().mockResolvedValue(true)
    ;(globalThis as any).browser = {
      alarms: {
        clear: clearMock,
      },
    }

    const result = await clearAlarm("alarm-1")

    expect(clearMock).toHaveBeenCalledWith("alarm-1")
    expect(result).toBe(true)
  })

  it("getAlarm should return undefined and warn when alarms API is not supported", async () => {
    ;(globalThis as any).browser = {}

    const result = await getAlarm("alarm-x")

    expect(result).toBeUndefined()
  })

  it("getAlarm should delegate to browser.alarms.get when supported", async () => {
    const alarm = { name: "alarm-x" }
    const getMock = vi.fn().mockResolvedValue(alarm)
    ;(globalThis as any).browser = {
      alarms: {
        get: getMock,
      },
    }

    const result = await getAlarm("alarm-x")

    expect(getMock).toHaveBeenCalledWith("alarm-x")
    expect(result).toBe(alarm)
  })

  it("getAllAlarms should return empty array and warn when alarms API is not supported", async () => {
    ;(globalThis as any).browser = {}

    const result = await getAllAlarms()

    expect(result).toEqual([])
  })

  it("getAllAlarms should delegate to browser.alarms.getAll when supported", async () => {
    const alarms = [{ name: "a" }, { name: "b" }]
    const getAllMock = vi.fn().mockResolvedValue(alarms)
    ;(globalThis as any).browser = {
      alarms: {
        getAll: getAllMock,
      },
    }

    const result = await getAllAlarms()

    expect(getAllMock).toHaveBeenCalled()
    expect(result).toBe(alarms)
  })

  it("onAlarm should warn and return no-op when alarms API is not supported", () => {
    ;(globalThis as any).browser = {}

    const callback = vi.fn()
    const cleanup = onAlarm(callback)

    expect(typeof cleanup).toBe("function")

    // call cleanup to ensure it is safe
    cleanup()
  })

  it("onAlarm should register and unregister listener when supported", () => {
    const addListenerMock = vi.fn()
    const removeListenerMock = vi.fn()

    ;(globalThis as any).browser = {
      // hasAlarmsAPI relies on browser.alarms truthiness
      alarms: {
        onAlarm: {
          addListener: addListenerMock,
          removeListener: removeListenerMock,
        },
      },
    }

    const callback = vi.fn()
    const cleanup = onAlarm(callback)

    expect(addListenerMock).toHaveBeenCalledWith(callback)

    cleanup()
    expect(removeListenerMock).toHaveBeenCalledWith(callback)
  })

  // restore original browser after all tests
  afterAll(() => {
    ;(globalThis as any).browser = originalBrowser
    ;(globalThis as any).chrome = originalChrome
  })
})

describe("browserApi notification helpers", () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    ;(globalThis as any).browser = undefined
  })

  afterAll(() => {
    ;(globalThis as any).browser = originalBrowser
    ;(globalThis as any).chrome = originalChrome
  })

  it("reports notification API support from browser.notifications", () => {
    ;(globalThis as any).browser = {}
    expect(hasNotificationsAPI()).toBe(false)
    ;(globalThis as any).browser = { notifications: {} }
    expect(hasNotificationsAPI()).toBe(true)
  })

  it("returns null or false when notifications are unavailable", async () => {
    ;(globalThis as any).browser = {}

    await expect(
      createNotification("test", {
        type: "basic",
        title: "Title",
        message: "Message",
        iconUrl: "icon.png",
      }),
    ).resolves.toBeNull()
    await expect(clearNotification("test")).resolves.toBe(false)
  })

  it("returns a safe no-op cleanup when notification click events are unavailable", () => {
    ;(globalThis as any).browser = {}

    const cleanup = onNotificationClicked(vi.fn())

    expect(typeof cleanup).toBe("function")
    cleanup()
  })

  it("creates, clears, and subscribes to notification clicks when supported", async () => {
    const addListener = vi.fn()
    const removeListener = vi.fn()
    ;(globalThis as any).browser = {
      notifications: {
        create: vi.fn().mockResolvedValue("test"),
        clear: vi.fn().mockResolvedValue(true),
        onClicked: {
          addListener,
          removeListener,
        },
      },
    }

    const options = {
      type: "basic" as const,
      title: "Title",
      message: "Message",
      iconUrl: "icon.png",
    }
    const callback = vi.fn()
    const cleanup = onNotificationClicked(callback)

    await expect(createNotification("test", options)).resolves.toBe("test")
    await expect(clearNotification("test")).resolves.toBe(true)
    expect(
      (globalThis as any).browser.notifications.create,
    ).toHaveBeenCalledWith("test", options)
    expect(
      (globalThis as any).browser.notifications.clear,
    ).toHaveBeenCalledWith("test")
    expect(addListener).toHaveBeenCalledWith(callback)

    cleanup()
    expect(removeListener).toHaveBeenCalledWith(callback)
  })

  it("swallows notification create and clear failures", async () => {
    ;(globalThis as any).browser = {
      notifications: {
        create: vi.fn().mockRejectedValue(new Error("create failed")),
        clear: vi.fn().mockRejectedValue(new Error("clear failed")),
      },
    }

    await expect(
      createNotification("test", {
        type: "basic",
        title: "Title",
        message: "Message",
        iconUrl: "icon.png",
      }),
    ).resolves.toBeNull()
    await expect(clearNotification("test")).resolves.toBe(false)
  })
})

describe("browserApi onSuspend", () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    ;(globalThis as any).browser = undefined
  })

  afterAll(() => {
    ;(globalThis as any).browser = originalBrowser
    ;(globalThis as any).chrome = originalChrome
  })

  it("returns a no-op cleanup when runtime.onSuspend is unavailable", () => {
    ;(globalThis as any).browser = {
      runtime: {},
    }

    const cleanup = onSuspend(vi.fn())

    expect(typeof cleanup).toBe("function")
    cleanup()
  })

  it("registers and unregisters runtime.onSuspend when supported", () => {
    const addListenerMock = vi.fn()
    const removeListenerMock = vi.fn()
    const callback = vi.fn()

    ;(globalThis as any).browser = {
      runtime: {
        onSuspend: {
          addListener: addListenerMock,
          removeListener: removeListenerMock,
        },
      },
    }

    const cleanup = onSuspend(callback)

    expect(addListenerMock).toHaveBeenCalledWith(callback)

    cleanup()
    expect(removeListenerMock).toHaveBeenCalledWith(callback)
  })
})

describe("browserApi sendRuntimeActionMessage", () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    ;(globalThis as any).browser = undefined
  })

  afterAll(() => {
    ;(globalThis as any).browser = originalBrowser
    ;(globalThis as any).chrome = originalChrome
  })

  it("forwards payload to browser.runtime.sendMessage unchanged", async () => {
    const sendMessageMock = vi.fn().mockResolvedValue({ ok: true })
    ;(globalThis as any).browser = { runtime: { sendMessage: sendMessageMock } }

    const message = {
      action: RuntimeActionIds.PermissionsCheck,
      permissions: {},
    }
    const response = await sendRuntimeActionMessage(message)

    expect(response).toEqual({ ok: true })
    expect(sendMessageMock).toHaveBeenCalledTimes(1)
    expect(sendMessageMock.mock.calls[0]?.[0]).toBe(message)
  })

  it("forwards retry options to sendMessageWithRetry behavior", async () => {
    const recoverableError = new Error("Receiving end does not exist")
    const message = {
      action: RuntimeActionIds.PermissionsCheck,
      permissions: {},
    }

    await expect(
      (async () => {
        const sendMessageMockNoRetry = vi
          .fn()
          .mockRejectedValue(recoverableError)
        ;(globalThis as any).browser = {
          runtime: { sendMessage: sendMessageMockNoRetry },
        }
        try {
          await sendRuntimeActionMessage(message, {
            maxAttempts: 1,
            delayMs: 0,
          })
          throw new Error("Expected sendRuntimeActionMessage to reject")
        } catch (error) {
          expect(sendMessageMockNoRetry).toHaveBeenCalledTimes(1)
          throw error
        }
      })(),
    ).rejects.toThrow("Receiving end does not exist")

    await expect(
      (async () => {
        const sendMessageMockRetry = vi
          .fn()
          .mockRejectedValueOnce(recoverableError)
          .mockResolvedValueOnce({ ok: true })
        ;(globalThis as any).browser = {
          runtime: { sendMessage: sendMessageMockRetry },
        }
        const result = await sendRuntimeActionMessage(message, {
          maxAttempts: 2,
          delayMs: 0,
        })
        expect(sendMessageMockRetry).toHaveBeenCalledTimes(2)
        return result
      })(),
    ).resolves.toEqual({ ok: true })
  })
})

describe("browserApi isMessageReceiverUnavailableError", () => {
  it("matches receiver-missing messaging errors", () => {
    expect(
      isMessageReceiverUnavailableError(
        new Error(
          "Could not establish connection. Receiving end does not exist.",
        ),
      ),
    ).toBe(true)
  })

  it("returns false for unrelated errors", () => {
    expect(
      isMessageReceiverUnavailableError(new Error("Network timeout")),
    ).toBe(false)
  })
})

describe("browserApi sendTabMessageWithRetry", () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    ;(globalThis as any).browser = undefined
  })

  afterAll(() => {
    ;(globalThis as any).browser = originalBrowser
    ;(globalThis as any).chrome = originalChrome
  })

  it("forwards payload to browser.tabs.sendMessage unchanged", async () => {
    const sendMessageMock = vi.fn().mockResolvedValue({ ok: true })
    ;(globalThis as any).browser = { tabs: { sendMessage: sendMessageMock } }

    const message = {
      action: RuntimeActionIds.PermissionsCheck,
      payload: { ok: true },
    }
    const response = await sendTabMessageWithRetry(123, message)

    expect(response).toEqual({ ok: true })
    expect(sendMessageMock).toHaveBeenCalledTimes(1)
    expect(sendMessageMock).toHaveBeenCalledWith(123, message)
  })

  it("forwards retry options to sendTabMessageWithRetry behavior", async () => {
    const recoverableError = new Error("Receiving end does not exist")
    const message = {
      action: RuntimeActionIds.PermissionsCheck,
      payload: { ok: true },
    }

    await expect(
      (async () => {
        const sendMessageMockNoRetry = vi
          .fn()
          .mockRejectedValue(recoverableError)
        ;(globalThis as any).browser = {
          tabs: { sendMessage: sendMessageMockNoRetry },
        }
        try {
          await sendTabMessageWithRetry(123, message, {
            maxAttempts: 1,
            delayMs: 0,
          })
          throw new Error("Expected sendTabMessageWithRetry to reject")
        } catch (error) {
          expect(sendMessageMockNoRetry).toHaveBeenCalledTimes(1)
          throw error
        }
      })(),
    ).rejects.toThrow("Receiving end does not exist")

    await expect(
      (async () => {
        const sendMessageMockRetry = vi
          .fn()
          .mockRejectedValueOnce(recoverableError)
          .mockResolvedValueOnce({ ok: true })
        ;(globalThis as any).browser = {
          tabs: { sendMessage: sendMessageMockRetry },
        }
        const result = await sendTabMessageWithRetry(123, message, {
          maxAttempts: 2,
          delayMs: 0,
        })
        expect(sendMessageMockRetry).toHaveBeenCalledTimes(2)
        return result
      })(),
    ).resolves.toEqual({ ok: true })
  })
})

describe("browserApi classifyRecoverableWindowCreationFailure", () => {
  it("returns null instead of throwing when the error message is undefined", () => {
    expect(
      classifyRecoverableWindowCreationFailure({
        error: undefined,
        windowsApiAvailable: true,
      }),
    ).toBeNull()
  })

  it("classifies blocked popup errors as recoverable window creation failures", () => {
    expect(
      classifyRecoverableWindowCreationFailure({
        error: new Error("Popup blocked by user settings"),
        windowsApiAvailable: true,
      }),
    ).toBe(WINDOW_CREATION_FAILURE_REASONS.WINDOW_CREATION_UNAVAILABLE)
  })

  it("classifies unavailable popup errors as recoverable window creation failures", () => {
    expect(
      classifyRecoverableWindowCreationFailure({
        error: new Error("Popup window unavailable on this runtime"),
        windowsApiAvailable: true,
      }),
    ).toBe(WINDOW_CREATION_FAILURE_REASONS.WINDOW_CREATION_UNAVAILABLE)
  })
})

describe("browserApi getSidePanelSupport", () => {
  const mockUserAgent = (userAgent: string) =>
    vi.spyOn(window.navigator, "userAgent", "get").mockReturnValue(userAgent)

  beforeEach(() => {
    vi.restoreAllMocks()
    vi.resetModules()
    ;(globalThis as any).browser = undefined
    ;(globalThis as any).chrome = undefined
    mockUserAgent("Mozilla/5.0 (Windows NT 10.0; Win64; x64)")
  })

  afterAll(() => {
    ;(globalThis as any).browser = originalBrowser
    ;(globalThis as any).chrome = originalChrome
  })

  it("treats browser.sidebarAction.open as Firefox side panel support", async () => {
    ;(globalThis as any).browser = {
      sidebarAction: {
        open: vi.fn(),
      },
    }
    ;(globalThis as any).chrome = {}

    const { getSidePanelSupport } = await import("~/utils/browser/browserApi")
    expect(getSidePanelSupport()).toEqual({
      supported: true,
      kind: "firefox-sidebar-action",
    })
  })

  it("treats chrome.sidePanel.open as Chromium side panel support", async () => {
    ;(globalThis as any).browser = {}
    ;(globalThis as any).chrome = {
      sidePanel: {
        open: vi.fn(),
      },
    }

    const { getSidePanelSupport } = await import("~/utils/browser/browserApi")
    expect(getSidePanelSupport()).toEqual({
      supported: true,
      kind: "chromium-side-panel",
    })
  })

  it("treats exposed side panel APIs as unsupported on known mobile runtimes", async () => {
    mockUserAgent(
      "Mozilla/5.0 (Android 14; Mobile; rv:136.0) Gecko/136.0 Firefox/136.0",
    )
    ;(globalThis as any).browser = {
      sidebarAction: {
        open: vi.fn(),
      },
    }
    ;(globalThis as any).chrome = {
      sidePanel: {
        open: vi.fn(),
      },
    }

    const { getSidePanelSupport } = await import("~/utils/browser/browserApi")
    const result = getSidePanelSupport()

    expect(result.supported).toBe(false)
    expect(result.kind).toBe("unsupported")
    if (result.supported) {
      throw new Error("Expected getSidePanelSupport to return unsupported")
    }
    expect(result.reason).toContain("mobile runtime")
  })

  it("treats exposed side panel APIs as unsupported on touch-tablet runtimes", async () => {
    vi.doMock("~/utils/browser/device", async (importOriginal) => {
      const actual =
        await importOriginal<typeof import("~/utils/browser/device")>()
      return {
        ...actual,
        getDeviceTypeInfo: vi.fn(() => ({
          type: "tablet",
          isMobile: false,
          isTablet: true,
          isDesktop: false,
          isTouchDevice: true,
        })),
      }
    })
    ;(globalThis as any).browser = {
      sidebarAction: {
        open: vi.fn(),
      },
    }
    ;(globalThis as any).chrome = {}

    const { getSidePanelSupport } = await import("~/utils/browser/browserApi")
    const result = getSidePanelSupport()

    expect(result.supported).toBe(false)
    expect(result.kind).toBe("unsupported")
    if (result.supported) {
      throw new Error("Expected getSidePanelSupport to return unsupported")
    }
    expect(result.reason).toContain("mobile runtime")

    vi.doUnmock("~/utils/browser/device")
  })

  it("marks support as unsupported after an observed open failure", async () => {
    ;(globalThis as any).browser = {
      sidebarAction: {
        open: vi.fn().mockRejectedValue(new Error("fail")),
      },
    }
    ;(globalThis as any).chrome = {}

    const { getSidePanelSupport, openSidePanel } = await import(
      "~/utils/browser/browserApi"
    )

    await expect(openSidePanel()).rejects.toThrow("fail")

    const result = getSidePanelSupport()
    expect(result.supported).toBe(false)
    expect(result.kind).toBe("unsupported")
    if (result.supported) {
      throw new Error("Expected getSidePanelSupport to return unsupported")
    }
    expect(result.reason).toContain("open failed")
  })

  it("returns unsupported when neither side panel API is available", async () => {
    ;(globalThis as any).browser = {}
    ;(globalThis as any).chrome = {}

    const { getSidePanelSupport } = await import("~/utils/browser/browserApi")
    const result = getSidePanelSupport()

    expect(result.supported).toBe(false)
    expect(result.kind).toBe("unsupported")
    if (result.supported) {
      throw new Error("Expected getSidePanelSupport to return unsupported")
    }
    expect(result.reason).toContain("browser.sidebarAction.open missing")
    expect(result.reason).toContain("chrome.sidePanel.open missing")
  })

  it("recomputes support on each call", async () => {
    ;(globalThis as any).browser = {
      sidebarAction: {
        open: vi.fn(),
      },
    }
    ;(globalThis as any).chrome = {}

    const { getSidePanelSupport } = await import("~/utils/browser/browserApi")

    expect(getSidePanelSupport()).toEqual({
      supported: true,
      kind: "firefox-sidebar-action",
    })
    ;(globalThis as any).browser = {}
    ;(globalThis as any).chrome = {
      sidePanel: {
        open: vi.fn(),
      },
    }

    expect(getSidePanelSupport()).toEqual({
      supported: true,
      kind: "chromium-side-panel",
    })
  })

  it("uses specific reasons when APIs exist but are unusable", async () => {
    ;(globalThis as any).browser = {
      sidebarAction: {
        open: {},
      },
    }
    ;(globalThis as any).chrome = {
      sidePanel: {
        open: {},
      },
    }

    const { getSidePanelSupport } = await import("~/utils/browser/browserApi")
    const result = getSidePanelSupport()

    expect(result.supported).toBe(false)
    expect(result.kind).toBe("unsupported")
    if (result.supported) {
      throw new Error("Expected getSidePanelSupport to return unsupported")
    }
    expect(result.reason).toBe(
      "browser.sidebarAction.open missing; chrome.sidePanel.open missing",
    )
  })

  it("uses the provided Chromium tab context before querying the active tab", async () => {
    const queryTabs = vi.fn().mockRejectedValue(new Error("should not query"))
    const open = vi.fn().mockResolvedValue(undefined)
    ;(globalThis as any).browser = {
      tabs: {
        query: queryTabs,
      },
    }
    ;(globalThis as any).chrome = {
      sidePanel: {
        open,
      },
    }

    const { openSidePanel } = await import("~/utils/browser/browserApi")

    await openSidePanel({ id: 7, windowId: 9 } as browser.tabs.Tab)

    expect(open).toHaveBeenCalledWith({ windowId: 9 })
    expect(queryTabs).not.toHaveBeenCalled()
  })

  it("opens the Chromium side panel by tab id when no window id is available", async () => {
    const queryTabs = vi.fn().mockRejectedValue(new Error("should not query"))
    const open = vi.fn().mockResolvedValue(undefined)
    ;(globalThis as any).browser = {
      tabs: {
        query: queryTabs,
      },
    }
    ;(globalThis as any).chrome = {
      sidePanel: {
        open,
      },
    }

    const { openSidePanel } = await import("~/utils/browser/browserApi")

    await openSidePanel({ id: 7 } as browser.tabs.Tab)

    expect(open).toHaveBeenCalledWith({ tabId: 7 })
    expect(queryTabs).not.toHaveBeenCalled()
  })

  it("looks up the active tab and falls back from windowId to tabId when Chromium rejects the first open attempt", async () => {
    const queryTabs = vi.fn().mockResolvedValue([{ id: 11, windowId: 12 }])
    const open = vi
      .fn()
      .mockRejectedValueOnce(new Error("window open failed"))
      .mockResolvedValueOnce(undefined)
    ;(globalThis as any).browser = {
      tabs: {
        query: queryTabs,
      },
    }
    ;(globalThis as any).chrome = {
      sidePanel: {
        open,
      },
    }

    const { openSidePanel } = await import("~/utils/browser/browserApi")

    await expect(openSidePanel()).resolves.toBeUndefined()

    expect(queryTabs).toHaveBeenCalled()
    expect(open).toHaveBeenNthCalledWith(1, { windowId: 12 })
    expect(open).toHaveBeenNthCalledWith(2, { tabId: 11 })
  })

  it("throws when Chromium cannot resolve an active tab or window id", async () => {
    ;(globalThis as any).browser = {
      tabs: {
        query: vi.fn().mockResolvedValue([{}]),
      },
    }
    ;(globalThis as any).chrome = {
      sidePanel: {
        open: vi.fn(),
      },
    }

    const { openSidePanel, getSidePanelSupport } = await import(
      "~/utils/browser/browserApi"
    )

    await expect(openSidePanel()).rejects.toThrow(
      "Side panel open failed: active tab/window not found",
    )

    const support = getSidePanelSupport()
    expect(support.supported).toBe(false)
  })

  it("opens the Firefox sidebar action directly", async () => {
    const open = vi.fn().mockResolvedValue(undefined)
    ;(globalThis as any).browser = {
      sidebarAction: {
        open,
      },
    }
    ;(globalThis as any).chrome = {}

    const { openSidePanel } = await import("~/utils/browser/browserApi")

    await expect(openSidePanel()).resolves.toBeUndefined()
    expect(open).toHaveBeenCalledTimes(1)
  })
})

describe("browserApi tab helpers", () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    ;(globalThis as any).browser = {
      tabs: {
        query: vi.fn(),
      },
    }
  })

  afterAll(() => {
    ;(globalThis as any).browser = originalBrowser
    ;(globalThis as any).chrome = originalChrome
  })

  it("prefers currentWindow when querying active tabs succeeds", async () => {
    const queryMock = vi
      .fn()
      .mockResolvedValueOnce([{ id: 1 }])
      .mockResolvedValueOnce([{ id: 2 }])
    ;(globalThis as any).browser.tabs.query = queryMock

    await expect(getActiveTabs()).resolves.toEqual([{ id: 1 }])
    expect(queryMock).toHaveBeenCalledTimes(1)
    expect(queryMock).toHaveBeenCalledWith({
      active: true,
      currentWindow: true,
    })
  })

  it("falls back to active-only queries when currentWindow is unsupported", async () => {
    const queryMock = vi
      .fn()
      .mockRejectedValueOnce(new Error("currentWindow unsupported"))
      .mockResolvedValueOnce([{ id: 9 }])
    ;(globalThis as any).browser.tabs.query = queryMock

    await expect(getActiveTabs()).resolves.toEqual([{ id: 9 }])
    expect(queryMock).toHaveBeenNthCalledWith(1, {
      active: true,
      currentWindow: true,
    })
    expect(queryMock).toHaveBeenNthCalledWith(2, { active: true })
  })

  it("falls back to all tabs when there is no active tab", async () => {
    const queryMock = vi
      .fn()
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ id: 2 }, { id: 3 }])
    ;(globalThis as any).browser.tabs.query = queryMock

    await expect(getActiveOrAllTabs()).resolves.toEqual([{ id: 2 }, { id: 3 }])
    expect(queryMock).toHaveBeenNthCalledWith(1, {
      active: true,
      currentWindow: true,
    })
    expect(queryMock).toHaveBeenNthCalledWith(2, { active: true })
    expect(queryMock).toHaveBeenNthCalledWith(3, {})
  })

  it("returns null when no active tab is available", async () => {
    ;(globalThis as any).browser.tabs.query = vi.fn().mockResolvedValue([])

    await expect(getActiveTab()).resolves.toBeNull()
  })

  it("normalizes nullish all-tabs results to an empty array", async () => {
    ;(globalThis as any).browser.tabs.query = vi.fn().mockResolvedValue(null)

    await expect(getAllTabs()).resolves.toEqual([])
  })

  it("returns an empty array when both active-tab queries fail", async () => {
    const queryMock = vi
      .fn()
      .mockRejectedValueOnce(new Error("boom"))
      .mockRejectedValueOnce(new Error("still boom"))
    ;(globalThis as any).browser.tabs.query = queryMock

    await expect(getActiveTabs()).resolves.toEqual([])
  })
})

describe("browserApi window and manifest helpers", () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    ;(globalThis as any).browser = {
      runtime: {
        getURL: vi.fn((path: string) => `chrome-extension://test/${path}`),
        getManifest: vi.fn(() => ({
          manifest_version: 3,
          name: "Test",
          version: "1.2.3",
          optional_permissions: ["tabs"],
        })),
      },
      tabs: {
        remove: vi.fn().mockResolvedValue(undefined),
        update: vi.fn().mockResolvedValue(undefined),
      },
      windows: {
        create: vi.fn().mockResolvedValue({ id: 1 }),
        remove: vi.fn().mockResolvedValue(undefined),
        update: vi.fn().mockResolvedValue(undefined),
        onRemoved: {
          addListener: vi.fn(),
          removeListener: vi.fn(),
        },
      },
      extension: {
        isAllowedIncognitoAccess: vi.fn().mockResolvedValue(true),
      },
    }
  })

  afterAll(() => {
    ;(globalThis as any).browser = originalBrowser
    ;(globalThis as any).chrome = originalChrome
  })

  it("falls back to removing a tab when removing a window fails", async () => {
    const removeWindowMock = vi
      .fn()
      .mockRejectedValueOnce(new Error("not a window"))
    const removeTabMock = vi.fn().mockResolvedValue(undefined)
    ;(globalThis as any).browser.windows.remove = removeWindowMock
    ;(globalThis as any).browser.tabs.remove = removeTabMock

    await removeTabOrWindow(42)

    expect(removeWindowMock).toHaveBeenCalledWith(42)
    expect(removeTabMock).toHaveBeenCalledWith(42)
  })

  it("returns null from createWindow when the windows API is unavailable", async () => {
    ;(globalThis as any).browser.windows = undefined

    await expect(
      createWindow({ url: "https://example.com" } as any),
    ).resolves.toBeNull()
  })

  it("delegates createWindow to browser.windows.create when supported", async () => {
    const createWindowMock = vi.fn().mockResolvedValue({ id: 23 })
    ;(globalThis as any).browser.windows.create = createWindowMock

    await expect(
      createWindow({ url: "https://example.com" } as any),
    ).resolves.toEqual({ id: 23 })

    expect(createWindowMock).toHaveBeenCalledWith({
      url: "https://example.com",
    })
  })

  it("focuses the tab window before activating the tab", async () => {
    const updateWindowMock = vi.fn().mockResolvedValue(undefined)
    const updateTabMock = vi.fn().mockResolvedValue(undefined)
    ;(globalThis as any).browser.windows.update = updateWindowMock
    ;(globalThis as any).browser.tabs.update = updateTabMock

    await focusTab({ id: 7, windowId: 8 } as browser.tabs.Tab)

    expect(updateWindowMock).toHaveBeenCalledWith(8, { focused: true })
    expect(updateTabMock).toHaveBeenCalledWith(7, { active: true })
  })

  it("still activates the tab when focusing the window fails", async () => {
    const updateTabMock = vi.fn().mockResolvedValue(undefined)
    ;(globalThis as any).browser.windows.update = vi
      .fn()
      .mockRejectedValueOnce(new Error("unsupported"))
    ;(globalThis as any).browser.tabs.update = updateTabMock

    await focusTab({ id: 77, windowId: 88 } as browser.tabs.Tab)

    expect(updateTabMock).toHaveBeenCalledWith(77, { active: true })
  })

  it("returns extension URLs through browser.runtime.getURL", () => {
    expect(getExtensionURL("popup.html")).toBe(
      "chrome-extension://test/popup.html",
    )
  })

  it("falls back to a minimal manifest when runtime.getManifest throws", () => {
    ;(globalThis as any).browser.runtime.getManifest = vi
      .fn()
      .mockImplementation(() => {
        throw new Error("manifest unavailable")
      })

    expect(getManifest()).toMatchObject({
      manifest_version: 3,
      version: "0.0.0",
      optional_permissions: [],
    })
    expect(getManifestVersion()).toBe(3)
  })

  it("returns incognito access as null when the browser API throws", async () => {
    ;(globalThis as any).browser.extension.isAllowedIncognitoAccess = vi
      .fn()
      .mockImplementationOnce(() => {
        throw new Error("unsupported")
      })

    await expect(isAllowedIncognitoAccess()).resolves.toBeNull()
  })

  it("registers and unregisters window removal listeners when supported", () => {
    const addListenerMock = vi.fn()
    const removeListenerMock = vi.fn()
    ;(globalThis as any).browser.windows.onRemoved = {
      addListener: addListenerMock,
      removeListener: removeListenerMock,
    }

    const callback = vi.fn()
    const cleanup = onWindowRemoved(callback)

    expect(addListenerMock).toHaveBeenCalledWith(callback)
    cleanup()
    expect(removeListenerMock).toHaveBeenCalledWith(callback)
  })
})

describe("browserApi event subscriptions", () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    ;(globalThis as any).browser = {
      runtime: {
        onMessage: {
          addListener: vi.fn(),
          removeListener: vi.fn(),
        },
        onStartup: {
          addListener: vi.fn(),
          removeListener: vi.fn(),
        },
        onInstalled: {
          addListener: vi.fn(),
          removeListener: vi.fn(),
        },
      },
      tabs: {
        onActivated: {
          addListener: vi.fn(),
          removeListener: vi.fn(),
        },
        onUpdated: {
          addListener: vi.fn(),
          removeListener: vi.fn(),
        },
        onRemoved: {
          addListener: vi.fn(),
          removeListener: vi.fn(),
        },
      },
    }
  })

  afterAll(() => {
    ;(globalThis as any).browser = originalBrowser
    ;(globalThis as any).chrome = originalChrome
  })

  it("registers and unregisters runtime, tab, startup, and install listeners", () => {
    const runtimeListener = vi.fn()
    const activatedListener = vi.fn()
    const updatedListener = vi.fn()
    const removedListener = vi.fn()
    const startupListener = vi.fn()
    const installedListener = vi.fn()

    const cleanupRuntime = onRuntimeMessage(runtimeListener)
    const cleanupActivated = onTabActivated(activatedListener)
    const cleanupUpdated = onTabUpdated(updatedListener)
    const cleanupRemoved = onTabRemoved(removedListener)
    const cleanupStartup = onStartup(startupListener)
    const cleanupInstalled = onInstalled(installedListener)

    expect(
      (globalThis as any).browser.runtime.onMessage.addListener,
    ).toHaveBeenCalledWith(runtimeListener)
    expect(
      (globalThis as any).browser.tabs.onActivated.addListener,
    ).toHaveBeenCalledWith(activatedListener)
    expect(
      (globalThis as any).browser.tabs.onUpdated.addListener,
    ).toHaveBeenCalledWith(updatedListener)
    expect(
      (globalThis as any).browser.tabs.onRemoved.addListener,
    ).toHaveBeenCalledWith(removedListener)
    expect(
      (globalThis as any).browser.runtime.onStartup.addListener,
    ).toHaveBeenCalledWith(startupListener)
    expect(
      (globalThis as any).browser.runtime.onInstalled.addListener,
    ).toHaveBeenCalledWith(installedListener)

    cleanupRuntime()
    cleanupActivated()
    cleanupUpdated()
    cleanupRemoved()
    cleanupStartup()
    cleanupInstalled()

    expect(
      (globalThis as any).browser.runtime.onMessage.removeListener,
    ).toHaveBeenCalledWith(runtimeListener)
    expect(
      (globalThis as any).browser.tabs.onActivated.removeListener,
    ).toHaveBeenCalledWith(activatedListener)
    expect(
      (globalThis as any).browser.tabs.onUpdated.removeListener,
    ).toHaveBeenCalledWith(updatedListener)
    expect(
      (globalThis as any).browser.tabs.onRemoved.removeListener,
    ).toHaveBeenCalledWith(removedListener)
    expect(
      (globalThis as any).browser.runtime.onStartup.removeListener,
    ).toHaveBeenCalledWith(startupListener)
    expect(
      (globalThis as any).browser.runtime.onInstalled.removeListener,
    ).toHaveBeenCalledWith(installedListener)
  })
})

describe("browserApi action and permissions helpers", () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    const onClicked = {
      addListener: vi.fn(),
      removeListener: vi.fn(),
      hasListener: vi.fn().mockReturnValue(false),
    }
    ;(globalThis as any).browser = {
      action: {
        setPopup: vi.fn().mockResolvedValue(undefined),
        onClicked,
      },
      runtime: {
        sendMessage: vi.fn(),
      },
      permissions: {
        contains: vi.fn().mockResolvedValue(true),
        request: vi.fn().mockResolvedValue(true),
        remove: vi.fn().mockResolvedValue(true),
        onAdded: {
          addListener: vi.fn(),
          removeListener: vi.fn(),
        },
        onRemoved: {
          addListener: vi.fn(),
          removeListener: vi.fn(),
        },
      },
    }
  })

  afterAll(() => {
    ;(globalThis as any).browser = originalBrowser
    ;(globalThis as any).chrome = originalChrome
  })

  it("prefers browser.action and falls back to browser.browserAction", () => {
    expect(getActionApi()).toBe((globalThis as any).browser.action)
    ;(globalThis as any).browser = {
      browserAction: {
        setPopup: vi.fn(),
        onClicked: {
          addListener: vi.fn(),
          removeListener: vi.fn(),
          hasListener: vi.fn().mockReturnValue(false),
        },
      },
    }

    expect(getActionApi()).toBe((globalThis as any).browser.browserAction)
  })

  it("throws when neither action API is available", () => {
    ;(globalThis as any).browser = {}

    expect(() => getActionApi()).toThrow(
      "Action API is not available in this environment",
    )
  })

  it("sets action popup and adds then removes click listeners safely", async () => {
    const actionApi = (globalThis as any).browser.action
    const listener = vi.fn()

    await setActionPopup("popup.html")
    expect(actionApi.setPopup).toHaveBeenCalledWith({ popup: "popup.html" })

    const cleanup = addActionClickListener(listener)
    expect(actionApi.onClicked.addListener).toHaveBeenCalledWith(listener)

    actionApi.onClicked.hasListener.mockReturnValue(true)
    cleanup()
    expect(actionApi.onClicked.removeListener).toHaveBeenCalledWith(listener)

    removeActionClickListener(listener)
    expect(actionApi.onClicked.removeListener).toHaveBeenCalledWith(listener)
  })

  it("does not add duplicate action listeners and skips removals when absent", () => {
    const actionApi = (globalThis as any).browser.action
    const listener = vi.fn()
    actionApi.onClicked.hasListener.mockReturnValue(true)

    const cleanup = addActionClickListener(listener)
    expect(actionApi.onClicked.addListener).not.toHaveBeenCalled()

    actionApi.onClicked.hasListener.mockReturnValue(false)
    cleanup()
    removeActionClickListener(listener)
    expect(actionApi.onClicked.removeListener).not.toHaveBeenCalled()
  })

  it("returns permission helper fallbacks when runtime or permissions APIs fail", async () => {
    ;(globalThis as any).browser.runtime.sendMessage = vi
      .fn()
      .mockRejectedValueOnce(new Error("boom"))
    ;(globalThis as any).browser.permissions.contains = vi
      .fn()
      .mockRejectedValueOnce(new Error("contains failed"))
    ;(globalThis as any).browser.permissions.request = vi
      .fn()
      .mockRejectedValueOnce(new Error("request failed"))
    ;(globalThis as any).browser.permissions.remove = vi
      .fn()
      .mockRejectedValueOnce(new Error("remove failed"))

    await expect(
      checkPermissionViaMessage({ permissions: ["tabs"] }),
    ).resolves.toBe(false)
    await expect(containsPermissions({ permissions: ["tabs"] })).resolves.toBe(
      false,
    )
    await expect(requestPermissions({ permissions: ["tabs"] })).resolves.toBe(
      false,
    )
    await expect(removePermissions({ permissions: ["tabs"] })).resolves.toBe(
      false,
    )
  })

  it("returns permission results and manages permission event listeners", async () => {
    ;(globalThis as any).browser.runtime.sendMessage = vi
      .fn()
      .mockResolvedValueOnce({ hasPermission: true })

    await expect(
      checkPermissionViaMessage({ permissions: ["tabs"] }),
    ).resolves.toBe(true)
    await expect(containsPermissions({ permissions: ["tabs"] })).resolves.toBe(
      true,
    )
    await expect(requestPermissions({ permissions: ["tabs"] })).resolves.toBe(
      true,
    )
    await expect(removePermissions({ permissions: ["tabs"] })).resolves.toBe(
      true,
    )

    const added = vi.fn()
    const removed = vi.fn()
    const cleanupAdded = onPermissionsAdded(added)
    const cleanupRemoved = onPermissionsRemoved(removed)

    expect(
      (globalThis as any).browser.permissions.onAdded.addListener,
    ).toHaveBeenCalledWith(added)
    expect(
      (globalThis as any).browser.permissions.onRemoved.addListener,
    ).toHaveBeenCalledWith(removed)

    cleanupAdded()
    cleanupRemoved()

    expect(
      (globalThis as any).browser.permissions.onAdded.removeListener,
    ).toHaveBeenCalledWith(added)
    expect(
      (globalThis as any).browser.permissions.onRemoved.removeListener,
    ).toHaveBeenCalledWith(removed)
  })
})
