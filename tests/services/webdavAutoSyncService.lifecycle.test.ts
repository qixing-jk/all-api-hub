import { beforeEach, describe, expect, it, vi } from "vitest"

import { RuntimeActionIds } from "~/constants/runtimeActions"
import {
  handleWebdavAutoSyncMessage,
  webdavAutoSyncService,
} from "~/services/webdav/webdavAutoSyncService"

const mocks = vi.hoisted(() => ({
  clearAlarm: vi.fn(),
  createAlarm: vi.fn(),
  getAlarm: vi.fn(),
  hasAlarmsAPI: vi.fn(),
  onAlarm: vi.fn(),
  sendRuntimeMessage: vi.fn(),
  isMessageReceiverUnavailableError: vi.fn(),
  getPreferences: vi.fn(),
  savePreferences: vi.fn(),
}))

vi.mock("~/utils/core/error", () => ({
  getErrorMessage: (error: unknown) =>
    error instanceof Error ? error.message : String(error),
}))

vi.mock("~/utils/browser/browserApi", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("~/utils/browser/browserApi")>()

  return {
    ...actual,
    clearAlarm: mocks.clearAlarm,
    createAlarm: mocks.createAlarm,
    getAlarm: mocks.getAlarm,
    hasAlarmsAPI: mocks.hasAlarmsAPI,
    isMessageReceiverUnavailableError: mocks.isMessageReceiverUnavailableError,
    onAlarm: mocks.onAlarm,
    sendRuntimeMessage: mocks.sendRuntimeMessage,
  }
})

vi.mock("~/services/preferences/userPreferences", async (importOriginal) => {
  const actual =
    await importOriginal<
      typeof import("~/services/preferences/userPreferences")
    >()

  return {
    ...actual,
    userPreferences: {
      ...actual.userPreferences,
      getPreferences: mocks.getPreferences,
      savePreferences: mocks.savePreferences,
    },
  }
})

/**
 * Creates a deferred promise helper for lifecycle assertions.
 */
function createDeferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

/**
 * Creates a fresh service instance that shares the concrete class implementation.
 */
function createService() {
  return new (
    webdavAutoSyncService as any
  ).constructor() as typeof webdavAutoSyncService
}

/**
 * Resets mutable singleton state between lifecycle tests.
 */
function resetServiceState(service: any) {
  service.removeAlarmListener = null
  service.isInitialized = false
  service.isSyncing = false
  service.isScheduled = false
  service.lastSyncTime = 0
  service.lastSyncStatus = "idle"
  service.lastSyncError = null
}

describe("webdavAutoSyncService lifecycle", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    resetServiceState(webdavAutoSyncService as any)
    mocks.onAlarm.mockReturnValue(() => {})
    mocks.hasAlarmsAPI.mockReturnValue(true)
    mocks.getPreferences.mockResolvedValue({
      webdav: {
        autoSync: false,
        url: "",
        username: "",
        password: "",
        syncInterval: 3600,
        syncData: {
          accounts: true,
          bookmarks: true,
          apiCredentialProfiles: true,
          preferences: true,
        },
      },
    })
    mocks.sendRuntimeMessage.mockResolvedValue(undefined)
    mocks.isMessageReceiverUnavailableError.mockReturnValue(false)
  })

  it("initializes once and only reacts to the WebDAV alarm", async () => {
    const service = createService()
    let alarmHandler: ((alarm: { name: string }) => Promise<void>) | undefined
    const removeListener = vi.fn()

    mocks.onAlarm.mockImplementation((handler) => {
      alarmHandler = handler
      return removeListener
    })

    const setupSpy = vi
      .spyOn(service, "setupAutoSync")
      .mockResolvedValue(undefined)
    const performSpy = vi
      .spyOn(service as any, "performBackgroundSync")
      .mockResolvedValue(undefined)

    await service.initialize()
    await service.initialize()

    expect(setupSpy).toHaveBeenCalledTimes(1)
    expect(mocks.onAlarm).toHaveBeenCalledTimes(1)
    expect(service.getStatus().isInitialized).toBe(true)

    await alarmHandler?.({ name: "other-alarm" })
    expect(performSpy).not.toHaveBeenCalled()

    await alarmHandler?.({ name: "webdavAutoSync" })
    expect(performSpy).toHaveBeenCalledTimes(1)

    service.destroy()
    expect(removeListener).toHaveBeenCalledTimes(1)
    expect(service.getStatus().isInitialized).toBe(false)
  })

  it("skips overlapping background sync runs and reports success to the frontend", async () => {
    const service = createService()
    const syncDeferred = createDeferred<void>()

    vi.spyOn(service, "syncWithWebdav").mockImplementation(
      () => syncDeferred.promise,
    )

    const firstRun = (service as any).performBackgroundSync()

    await vi.waitFor(() => {
      expect(service.getStatus().isSyncing).toBe(true)
    })

    await (service as any).performBackgroundSync()
    expect(service.syncWithWebdav).toHaveBeenCalledTimes(1)

    syncDeferred.resolve()
    await firstRun

    expect(service.getStatus()).toMatchObject({
      isSyncing: false,
      lastSyncStatus: "success",
      lastSyncError: null,
    })
    expect(service.getStatus().lastSyncTime).toBeGreaterThan(0)
    expect(mocks.sendRuntimeMessage).toHaveBeenCalledWith(
      {
        type: "WEBDAV_AUTO_SYNC_UPDATE",
        payload: {
          type: "sync_completed",
          data: { timestamp: expect.any(Number) },
        },
      },
      { maxAttempts: 1 },
    )
  })

  it("records sync failures and tolerates missing frontend receivers", async () => {
    const service = createService()

    vi.spyOn(service, "syncWithWebdav").mockRejectedValue(
      new Error("sync exploded"),
    )
    mocks.sendRuntimeMessage.mockRejectedValueOnce(new Error("no receiver"))
    mocks.isMessageReceiverUnavailableError.mockReturnValueOnce(true)

    await expect(
      (service as any).performBackgroundSync(),
    ).resolves.toBeUndefined()
    await Promise.resolve()

    expect(service.getStatus()).toMatchObject({
      isSyncing: false,
      lastSyncStatus: "error",
      lastSyncError: "sync exploded",
    })
    expect(mocks.sendRuntimeMessage).toHaveBeenCalledWith(
      {
        type: "WEBDAV_AUTO_SYNC_UPDATE",
        payload: {
          type: "sync_error",
          data: { error: "sync exploded" },
        },
      },
      { maxAttempts: 1 },
    )
  })

  it("keeps successful sync state when frontend notification fails unexpectedly", async () => {
    const service = createService()

    vi.spyOn(service, "syncWithWebdav").mockResolvedValue(undefined)
    mocks.sendRuntimeMessage.mockRejectedValueOnce(new Error("popup crashed"))
    mocks.isMessageReceiverUnavailableError.mockReturnValueOnce(false)

    await expect(
      (service as any).performBackgroundSync(),
    ).resolves.toBeUndefined()
    await Promise.resolve()

    expect(service.getStatus()).toMatchObject({
      isSyncing: false,
      lastSyncStatus: "success",
      lastSyncError: null,
    })
  })

  it("swallows synchronous notification exceptions after a successful background sync", async () => {
    const service = createService()

    vi.spyOn(service, "syncWithWebdav").mockResolvedValue(undefined)
    mocks.sendRuntimeMessage.mockImplementationOnce(() => {
      throw new Error("messaging unavailable")
    })

    await expect(
      (service as any).performBackgroundSync(),
    ).resolves.toBeUndefined()

    expect(service.getStatus()).toMatchObject({
      isSyncing: false,
      lastSyncStatus: "success",
      lastSyncError: null,
    })
  })

  it("returns busy, success, and failure states from syncNow", async () => {
    const service = createService()

    ;(service as any).isSyncing = true
    await expect(service.syncNow()).resolves.toEqual({
      success: false,
      message: "同步正在进行中，请稍后再试",
    })
    ;(service as any).isSyncing = false
    vi.spyOn(service, "syncWithWebdav").mockResolvedValueOnce(undefined)
    await expect(service.syncNow()).resolves.toEqual({
      success: true,
      message: "同步成功",
    })

    vi.spyOn(service, "syncWithWebdav").mockRejectedValueOnce(
      new Error("manual sync failed"),
    )
    await expect(service.syncNow()).resolves.toEqual({
      success: false,
      message: "manual sync failed",
    })
    expect(service.getStatus()).toMatchObject({
      lastSyncStatus: "error",
      lastSyncError: "manual sync failed",
    })
  })

  it("routes runtime actions through the message handler and reports failures", async () => {
    const setupSpy = vi
      .spyOn(webdavAutoSyncService, "setupAutoSync")
      .mockResolvedValue(undefined)
    const syncNowSpy = vi
      .spyOn(webdavAutoSyncService, "syncNow")
      .mockResolvedValue({ success: true, message: "ok" })
    const stopSpy = vi
      .spyOn(webdavAutoSyncService, "stopAutoSync")
      .mockResolvedValue(undefined)
    const updateSpy = vi
      .spyOn(webdavAutoSyncService, "updateSettings")
      .mockResolvedValue(true)
    vi.spyOn(webdavAutoSyncService, "getStatus").mockReturnValue({
      isRunning: true,
      isInitialized: true,
      isSyncing: false,
      lastSyncTime: 123,
      lastSyncStatus: "success",
      lastSyncError: null,
    })

    const cases = [
      {
        request: { action: RuntimeActionIds.WebdavAutoSyncSetup },
        expected: { success: true },
      },
      {
        request: { action: RuntimeActionIds.WebdavAutoSyncSyncNow },
        expected: { success: true, message: "ok" },
      },
      {
        request: { action: RuntimeActionIds.WebdavAutoSyncStop },
        expected: { success: true },
      },
      {
        request: {
          action: RuntimeActionIds.WebdavAutoSyncUpdateSettings,
          settings: { autoSync: false },
        },
        expected: { success: true },
      },
      {
        request: { action: RuntimeActionIds.WebdavAutoSyncGetStatus },
        expected: {
          success: true,
          data: {
            isRunning: true,
            isInitialized: true,
            isSyncing: false,
            lastSyncTime: 123,
            lastSyncStatus: "success",
            lastSyncError: null,
          },
        },
      },
      {
        request: { action: "webdav:unknown" },
        expected: { success: false, error: "未知的操作" },
      },
    ]

    for (const { request, expected } of cases) {
      const sendResponse = vi.fn()
      await handleWebdavAutoSyncMessage(request, sendResponse)
      expect(sendResponse).toHaveBeenCalledWith(expected)
    }

    expect(setupSpy).toHaveBeenCalledTimes(1)
    expect(syncNowSpy).toHaveBeenCalledTimes(1)
    expect(stopSpy).toHaveBeenCalledTimes(1)
    expect(updateSpy).toHaveBeenCalledWith({ autoSync: false })

    setupSpy.mockRejectedValueOnce(new Error("handler exploded"))
    const sendResponse = vi.fn()
    await handleWebdavAutoSyncMessage(
      { action: RuntimeActionIds.WebdavAutoSyncSetup },
      sendResponse,
    )
    expect(sendResponse).toHaveBeenCalledWith({
      success: false,
      error: "handler exploded",
    })
  })

  it("persists updated settings and re-runs scheduler setup", async () => {
    const service = createService()
    const setupSpy = vi
      .spyOn(service, "setupAutoSync")
      .mockResolvedValue(undefined)

    await service.updateSettings({
      autoSync: true,
      syncInterval: 1800,
      syncStrategy: "merge",
    })

    expect(mocks.savePreferences).toHaveBeenCalledWith({
      webdav: {
        autoSync: true,
        syncInterval: 1800,
        syncStrategy: "merge",
      },
    })
    expect(setupSpy).toHaveBeenCalledTimes(1)
  })

  it("swallows settings persistence failures without re-running scheduler setup", async () => {
    const service = createService()
    const setupSpy = vi
      .spyOn(service, "setupAutoSync")
      .mockResolvedValue(undefined)

    mocks.savePreferences.mockRejectedValueOnce(new Error("save failed"))

    await expect(
      service.updateSettings({ autoSync: false, syncInterval: 900 }),
    ).resolves.toBeUndefined()

    expect(setupSpy).not.toHaveBeenCalled()
  })
})
