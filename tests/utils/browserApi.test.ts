import { afterAll, beforeEach, describe, expect, it, vi } from "vitest"

import { RuntimeActionIds } from "~/constants/runtimeActions"
import {
  clearAlarm,
  createAlarm,
  getAlarm,
  getAllAlarms,
  hasAlarmsAPI,
  onAlarm,
  sendRuntimeActionMessage,
  sendTabMessageWithRetry,
} from "~/utils/browserApi"

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

describe("browserApi getSidePanelSupport", () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    vi.resetModules()
    ;(globalThis as any).browser = undefined
    ;(globalThis as any).chrome = undefined
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

    const { getSidePanelSupport } = await import("~/utils/browserApi")
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

    const { getSidePanelSupport } = await import("~/utils/browserApi")
    expect(getSidePanelSupport()).toEqual({
      supported: true,
      kind: "chromium-side-panel",
    })
  })

  it("returns unsupported when neither side panel API is available", async () => {
    ;(globalThis as any).browser = {}
    ;(globalThis as any).chrome = {}

    const { getSidePanelSupport } = await import("~/utils/browserApi")
    const result = getSidePanelSupport()

    expect(result.supported).toBe(false)
    expect(result.kind).toBe("unsupported")
    if (result.supported) {
      throw new Error("Expected getSidePanelSupport to return unsupported")
    }
    expect(result.reason).toContain("browser.sidebarAction.open missing")
    expect(result.reason).toContain("chrome.sidePanel.open missing")
  })

  it("caches support check at module load time", async () => {
    ;(globalThis as any).browser = {
      sidebarAction: {
        open: vi.fn(),
      },
    }
    ;(globalThis as any).chrome = {}

    const { getSidePanelSupport } = await import("~/utils/browserApi")

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
      kind: "firefox-sidebar-action",
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

    const { getSidePanelSupport } = await import("~/utils/browserApi")
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
})
