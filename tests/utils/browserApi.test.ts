import { afterAll, beforeEach, describe, expect, it, vi } from "vitest"

import {
  clearAlarm,
  createAlarm,
  getAlarm,
  getAllAlarms,
  hasAlarmsAPI,
  onAlarm,
} from "~/utils/browserApi"

const originalBrowser = (globalThis as any).browser

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
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {})
    ;(globalThis as any).browser = {}

    await expect(
      createAlarm("test", { when: Date.now() }),
    ).resolves.toBeUndefined()

    expect(warnSpy).toHaveBeenCalledWith("Alarms API not supported")
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
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {})
    ;(globalThis as any).browser = {}

    const result = await clearAlarm("missing")

    expect(result).toBe(false)
    expect(warnSpy).toHaveBeenCalledWith("Alarms API not supported")
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
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {})
    ;(globalThis as any).browser = {}

    const result = await getAlarm("alarm-x")

    expect(result).toBeUndefined()
    expect(warnSpy).toHaveBeenCalledWith("Alarms API not supported")
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
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {})
    ;(globalThis as any).browser = {}

    const result = await getAllAlarms()

    expect(result).toEqual([])
    expect(warnSpy).toHaveBeenCalledWith("Alarms API not supported")
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
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {})
    ;(globalThis as any).browser = {}

    const callback = vi.fn()
    const cleanup = onAlarm(callback)

    expect(typeof cleanup).toBe("function")

    // call cleanup to ensure it is safe
    cleanup()
    expect(warnSpy).toHaveBeenCalledWith("Alarms API not supported")
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
