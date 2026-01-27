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
} from "~/utils/browserApi"

const originalBrowser = (globalThis as any).browser

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
  })
})

describe("browserApi sendRuntimeActionMessage", () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    ;(globalThis as any).browser = undefined
  })

  afterAll(() => {
    ;(globalThis as any).browser = originalBrowser
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
