import { beforeEach, describe, expect, it, vi } from "vitest"

import { webdavAutoSyncService } from "~/services/webdav/webdavAutoSyncService"

import {
  mockClearAlarm,
  mockCreateAlarm,
  mockGetAlarm,
  mockGetPreferences,
  mockHasAlarmsAPI,
  mockOnAlarm,
  mockSavePreferences,
} from "./webdavAutoSyncHarness"

// Register shared module mocks before loading the service under test.
await vi.hoisted(() => import("./webdavAutoSyncHarness"))

describe("WebdavAutoSyncService scheduling (alarms)", () => {
  const createService = () => new (webdavAutoSyncService as any).constructor()

  const basePreferences: any = {
    webdav: {
      autoSync: true,
      url: "https://example.test/webdav",
      username: "user",
      password: "pass",
      syncInterval: 3600,
      syncStrategy: "merge",
    },
  }

  beforeEach(() => {
    vi.clearAllMocks()

    mockHasAlarmsAPI.mockReturnValue(true)
    mockClearAlarm.mockResolvedValue(true)
    mockCreateAlarm.mockResolvedValue(undefined)
    mockGetAlarm.mockResolvedValue(undefined)
    mockOnAlarm.mockReturnValue(() => {})

    mockGetPreferences.mockResolvedValue(basePreferences)
    mockSavePreferences.mockResolvedValue(undefined)
  })

  it("clears alarm and reports not running when autoSync is disabled", async () => {
    const service = createService()
    ;(service as any).isScheduled = true

    mockGetPreferences.mockResolvedValueOnce({
      ...basePreferences,
      webdav: { ...basePreferences.webdav, autoSync: false },
    })

    await service.setupAutoSync()

    expect(mockClearAlarm).toHaveBeenCalledWith("webdavAutoSync")
    expect(mockCreateAlarm).not.toHaveBeenCalled()
    expect(service.getStatus().isRunning).toBe(false)
  })

  it("clears alarm and reports not running when WebDAV config is incomplete", async () => {
    const service = createService()

    mockGetPreferences.mockResolvedValueOnce({
      ...basePreferences,
      webdav: { ...basePreferences.webdav, url: "" },
    })

    await service.setupAutoSync()

    expect(mockClearAlarm).toHaveBeenCalledWith("webdavAutoSync")
    expect(mockCreateAlarm).not.toHaveBeenCalled()
    expect(service.getStatus().isRunning).toBe(false)
  })

  it("disables scheduling when alarms API is not available", async () => {
    const service = createService()

    mockHasAlarmsAPI.mockReturnValue(false)

    await service.setupAutoSync()

    expect(mockClearAlarm).toHaveBeenCalledWith("webdavAutoSync")
    expect(mockCreateAlarm).not.toHaveBeenCalled()
    expect(service.getStatus().isRunning).toBe(false)
  })

  it("creates an alarm using the configured interval in minutes", async () => {
    const service = createService()

    mockGetAlarm.mockResolvedValueOnce(undefined).mockResolvedValueOnce({
      name: "webdavAutoSync",
      periodInMinutes: 60,
      scheduledTime: Date.now(),
    })

    await service.setupAutoSync()

    expect(mockClearAlarm).toHaveBeenCalledWith("webdavAutoSync")
    expect(mockCreateAlarm).toHaveBeenCalledWith("webdavAutoSync", {
      delayInMinutes: 60,
      periodInMinutes: 60,
    })
    expect(service.getStatus().isRunning).toBe(true)
  })

  it("clears alarm when the WebDAV sync selection is empty", async () => {
    const service = createService()

    mockGetPreferences.mockResolvedValueOnce({
      ...basePreferences,
      webdav: {
        ...basePreferences.webdav,
        syncData: {
          accounts: false,
          bookmarks: false,
          apiCredentialProfiles: false,
          preferences: false,
        },
      },
    })

    await service.setupAutoSync()

    expect(mockClearAlarm).toHaveBeenCalledWith("webdavAutoSync")
    expect(mockCreateAlarm).not.toHaveBeenCalled()
    expect(service.getStatus().isRunning).toBe(false)
  })

  it("preserves an existing alarm when the period matches", async () => {
    const service = createService()

    mockGetAlarm.mockResolvedValueOnce({
      name: "webdavAutoSync",
      periodInMinutes: 60,
      scheduledTime: Date.now(),
    })

    await service.setupAutoSync()

    expect(mockClearAlarm).not.toHaveBeenCalled()
    expect(mockCreateAlarm).not.toHaveBeenCalled()
    expect(service.getStatus().isRunning).toBe(true)
  })

  it("schedules GitHub Gist auto-sync with a five-minute minimum interval", async () => {
    const service = createService()

    mockGetPreferences.mockResolvedValueOnce({
      webdav: {
        ...basePreferences.webdav,
        provider: "github_gist",
        url: "",
        username: "",
        password: "",
        backupEncryptionPassword: "encryption-password",
        githubGist: { token: "token", gistId: "gist-1" },
        syncInterval: 60,
      },
    })
    mockGetAlarm.mockResolvedValueOnce(undefined).mockResolvedValueOnce({
      name: "webdavAutoSync",
      periodInMinutes: 5,
      scheduledTime: Date.now(),
    })

    await service.setupAutoSync()

    expect(mockCreateAlarm).toHaveBeenCalledWith("webdavAutoSync", {
      delayInMinutes: 5,
      periodInMinutes: 5,
    })
    expect(service.getStatus().isRunning).toBe(true)
  })
})
