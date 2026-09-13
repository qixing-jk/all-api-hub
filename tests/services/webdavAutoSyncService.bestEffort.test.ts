import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { BACKUP_VERSION } from "~/constants/importExport"
import { ACCOUNT_STORAGE_KEYS } from "~/services/core/storageKeys"
import { createDefaultTagStore } from "~/services/tags/tagStoreUtils"
import { webdavAutoSyncService } from "~/services/webdav/webdavAutoSyncService"
import { createDeferred } from "~~/tests/test-utils/deferred"

import {
  mockAccountStorageExportData,
  mockAccountStorageImportData,
  mockApiCredentialProfilesExport,
  mockApiCredentialProfilesImport,
  mockChannelConfigExport,
  mockChannelConfigImport,
  mockClearAlarm,
  mockCreateAlarm,
  mockDownloadBackup,
  mockExportPreferences,
  mockGetAlarm,
  mockGetPreferences,
  mockHasAlarmsAPI,
  mockImportPreferences,
  mockOnAlarm,
  mockParseWebdavBackupJson,
  mockSavePreferences,
  mockTagStoreExport,
  mockTagStoreImport,
  mockUploadBackup,
  preferenceWriteSuccess,
} from "./webdavAutoSyncHarness"

// Register shared module mocks before loading the service under test.
await vi.hoisted(() => import("./webdavAutoSyncHarness"))

describe("WebdavAutoSyncService best-effort upload helpers", () => {
  const createService = () => new (webdavAutoSyncService as any).constructor()
  const originalBrowser = (globalThis as any).browser
  let addListenerMock: ReturnType<typeof vi.fn>
  let removeListenerMock: ReturnType<typeof vi.fn>

  const basePreferences: any = {
    webdav: {
      autoSync: true,
      url: "https://example.test/webdav",
      username: "user",
      password: "pass",
      syncInterval: 3600,
      syncStrategy: "merge",
      syncData: {
        accounts: true,
        bookmarks: true,
        apiCredentialProfiles: true,
        preferences: true,
      },
    },
  }

  beforeEach(() => {
    vi.clearAllMocks()
    mockParseWebdavBackupJson.mockImplementation((content: string) =>
      JSON.parse(content),
    )

    mockHasAlarmsAPI.mockReturnValue(true)
    mockClearAlarm.mockResolvedValue(true)
    mockCreateAlarm.mockResolvedValue(undefined)
    mockGetAlarm.mockResolvedValue(undefined)
    mockOnAlarm.mockReturnValue(() => {})
    mockGetPreferences.mockResolvedValue(basePreferences)
    mockSavePreferences.mockResolvedValue(undefined)

    addListenerMock = vi.fn()
    removeListenerMock = vi.fn()
    ;(globalThis as any).browser = {
      storage: {
        onChanged: {
          addListener: addListenerMock,
          removeListener: removeListenerMock,
        },
      },
    }
  })

  afterEach(() => {
    ;(globalThis as any).browser = originalBrowser
  })

  it("detects deleted account and bookmark ids and ignores unchanged or invalid payloads", () => {
    const service = createService() as any

    expect(
      service.hasDeletedSharedEntries({
        oldValue: {
          accounts: [{ id: "account-a" }, { id: "account-b" }],
          bookmarks: [{ id: "bookmark-a" }],
        },
        newValue: {
          accounts: [{ id: "account-a" }],
          bookmarks: [{ id: "bookmark-a" }],
        },
      }),
    ).toBe(true)

    expect(
      service.hasDeletedSharedEntries({
        oldValue: {
          accounts: [{ id: "account-a" }],
          bookmarks: [{ id: "bookmark-a" }, { id: "bookmark-b" }],
        },
        newValue: {
          accounts: [{ id: "account-a" }],
          bookmarks: [{ id: "bookmark-a" }],
        },
      }),
    ).toBe(true)

    expect(
      service.hasDeletedSharedEntries({
        oldValue: { accounts: [{ id: "account-a" }] },
        newValue: { accounts: [{ id: "account-a" }, { id: "account-b" }] },
      }),
    ).toBe(false)

    expect(
      service.hasDeletedSharedEntries({
        oldValue: null,
        newValue: { accounts: [{ id: "account-a" }] },
      }),
    ).toBe(false)

    expect(
      service.hasDeletedSharedEntries({
        oldValue: { accounts: [{ foo: "missing-id" }, { id: "" }] },
        newValue: { accounts: [{ foo: "missing-id" }, { id: "" }] },
      }),
    ).toBe(false)
  })

  it("subscribes to local storage deletion changes and supports unsubscribe", async () => {
    const service = createService() as any
    const handleSpy = vi
      .spyOn(service, "handleSharedAccountStorageChanged")
      .mockResolvedValue(undefined)

    const unsubscribe = service.subscribeToAccountStorageChanges()

    expect(addListenerMock).toHaveBeenCalledTimes(1)
    const listener = addListenerMock.mock.calls[0]?.[0]
    expect(listener).toBeTypeOf("function")

    listener?.({}, "sync")
    await Promise.resolve()
    expect(handleSpy).not.toHaveBeenCalled()

    listener?.(
      {
        unrelated: {
          oldValue: { accounts: [{ id: "account-a" }] },
          newValue: { accounts: [] },
        },
      },
      "local",
    )
    await Promise.resolve()
    expect(handleSpy).not.toHaveBeenCalled()

    listener?.(
      {
        [ACCOUNT_STORAGE_KEYS.ACCOUNTS]: {
          oldValue: { accounts: [{ id: "account-a" }] },
          newValue: { accounts: [{ id: "account-a" }] },
        },
      },
      "local",
    )
    await Promise.resolve()
    expect(handleSpy).not.toHaveBeenCalled()

    listener?.(
      {
        [ACCOUNT_STORAGE_KEYS.ACCOUNTS]: {
          oldValue: { accounts: [{ id: "account-a" }] },
          newValue: { accounts: [] },
        },
      },
      "local",
    )
    await Promise.resolve()
    expect(handleSpy).toHaveBeenCalledTimes(1)

    service.suppressAccountStorageChangeHandling = true
    listener?.(
      {
        [ACCOUNT_STORAGE_KEYS.ACCOUNTS]: {
          oldValue: { bookmarks: [{ id: "bookmark-a" }] },
          newValue: { bookmarks: [] },
        },
      },
      "local",
    )
    await Promise.resolve()
    expect(handleSpy).toHaveBeenCalledTimes(1)

    unsubscribe()
    expect(removeListenerMock).toHaveBeenCalledWith(listener)
  })

  it("suppresses deletion-triggered handling while applyLocalSyncResult writes local data", async () => {
    const service = createService() as any
    const handleSpy = vi
      .spyOn(service, "handleSharedAccountStorageChanged")
      .mockResolvedValue(undefined)
    const unsubscribe = service.subscribeToAccountStorageChanges()
    const listener = addListenerMock.mock.calls[0]?.[0]
    const accountDeferred = createDeferred<{ migratedCount: number }>()

    mockAccountStorageImportData.mockImplementation(async () => {
      expect(service.suppressAccountStorageChangeHandling).toBe(true)
      return await accountDeferred.promise
    })
    mockTagStoreImport.mockResolvedValue(undefined)
    mockImportPreferences.mockResolvedValue(preferenceWriteSuccess())
    mockChannelConfigImport.mockResolvedValue(undefined)
    mockApiCredentialProfilesImport.mockResolvedValue(undefined)

    const applyPromise = service.applyLocalSyncResult({
      syncDataSelection: {
        accounts: true,
        bookmarks: false,
        apiCredentialProfiles: false,
        preferences: false,
      },
      accountsToSave: [],
      bookmarksToSave: [],
      pinnedAccountIdsToSave: [],
      orderedAccountIdsToSave: [],
      tagStoreToSave: createDefaultTagStore(),
      preferencesToSave: {} as any,
      channelConfigsToSave: {},
      apiCredentialProfilesToSave: {
        version: 2,
        profiles: [],
        lastUpdated: 0,
      },
      localAccountsConfig: {
        accounts: [{ id: "account-a" } as any],
        bookmarks: [],
        pinnedAccountIds: [],
        orderedAccountIds: [],
      },
      localTagStore: createDefaultTagStore(),
      localPreferences: {} as any,
      localChannelConfigs: {},
      localApiCredentialProfiles: {
        version: 2,
        profiles: [],
        lastUpdated: 0,
      },
    })

    await Promise.resolve()
    expect(service.suppressAccountStorageChangeHandling).toBe(true)

    listener?.(
      {
        [ACCOUNT_STORAGE_KEYS.ACCOUNTS]: {
          oldValue: { accounts: [{ id: "account-a" }] },
          newValue: { accounts: [] },
        },
      },
      "local",
    )
    await Promise.resolve()
    expect(handleSpy).not.toHaveBeenCalled()

    accountDeferred.resolve({ migratedCount: 0 })
    await applyPromise
    expect(service.suppressAccountStorageChangeHandling).toBe(false)

    unsubscribe()
  })

  it("only schedules best-effort uploads when alarms are available and account data can be uploaded", async () => {
    const service = createService() as any

    mockHasAlarmsAPI.mockReturnValue(false)
    await expect(
      service.shouldScheduleBestEffortUploadForAccounts(),
    ).resolves.toBe(false)

    mockHasAlarmsAPI.mockReturnValue(true)
    mockGetPreferences.mockResolvedValueOnce({
      webdav: {
        ...basePreferences.webdav,
        syncStrategy: "download_only",
      },
    })
    await expect(
      service.shouldScheduleBestEffortUploadForAccounts(),
    ).resolves.toBe(false)

    mockGetPreferences.mockResolvedValueOnce({
      webdav: {
        ...basePreferences.webdav,
        syncData: {
          accounts: false,
          bookmarks: false,
          apiCredentialProfiles: true,
          preferences: true,
        },
      },
    })
    await expect(
      service.shouldScheduleBestEffortUploadForAccounts(),
    ).resolves.toBe(false)

    await expect(
      service.shouldScheduleBestEffortUploadForAccounts(),
    ).resolves.toBe(true)
  })

  it("schedules and executes best-effort uploads through the dedicated alarm", async () => {
    const service = createService() as any
    const uploadSpy = vi
      .spyOn(service, "uploadLocalSnapshotToWebdav")
      .mockResolvedValue(undefined)

    await service.scheduleBestEffortUpload("account_storage_changed")

    expect(mockClearAlarm).toHaveBeenCalledWith(
      "webdavAutoSyncBestEffortUpload",
    )
    expect(mockCreateAlarm).toHaveBeenCalledWith(
      "webdavAutoSyncBestEffortUpload",
      { delayInMinutes: 1 },
    )

    await service.performBestEffortUpload()
    expect(uploadSpy).toHaveBeenCalledTimes(1)
  })

  it("uploads selected local data while preserving unselected remote preferences", async () => {
    const service = createService() as any
    mockGetPreferences.mockResolvedValue({
      ...basePreferences,
      webdav: {
        ...basePreferences.webdav,
        syncData: { ...basePreferences.webdav.syncData, preferences: false },
      },
    })

    mockAccountStorageExportData.mockResolvedValue({
      accounts: [{ id: "local-account", updated_at: 10 }],
      bookmarks: [{ id: "local-bookmark", updated_at: 20 }],
      pinnedAccountIds: ["local-account"],
      orderedAccountIds: ["local-account", "local-bookmark"],
    })
    mockTagStoreExport.mockResolvedValue({ version: 1, tagsById: {} })
    mockExportPreferences.mockResolvedValue({ themeMode: "dark" } as any)
    mockChannelConfigExport.mockResolvedValue({ schemaVersion: 1, configs: {} })
    mockApiCredentialProfilesExport.mockResolvedValue({
      version: 2,
      profiles: [],
      lastUpdated: 0,
    })
    mockDownloadBackup.mockResolvedValue(
      JSON.stringify({
        version: BACKUP_VERSION,
        accounts: { accounts: [], bookmarks: [] },
        preferences: { themeMode: "light", lastUpdated: 50 },
      }),
    )

    await service.uploadLocalSnapshotToWebdav()

    expect(mockUploadBackup).toHaveBeenCalledTimes(1)
    expect(JSON.parse(mockUploadBackup.mock.calls[0][0])).toMatchObject({
      version: BACKUP_VERSION,
      preferences: { themeMode: "light", lastUpdated: 50 },
      accounts: {
        accounts: [{ id: "local-account", updated_at: 10 }],
        bookmarks: [{ id: "local-bookmark", updated_at: 20 }],
      },
    })
  })

  it("uses one settings snapshot for the remote read and write", async () => {
    const service = createService() as any
    const initialPreferences = {
      ...basePreferences,
      webdav: {
        ...basePreferences.webdav,
        url: "https://snapshot.example.test/webdav",
      },
    }
    const changedPreferences = {
      ...basePreferences,
      webdav: {
        ...basePreferences.webdav,
        url: "https://changed.example.test/webdav",
      },
    }
    mockGetPreferences
      .mockResolvedValueOnce(initialPreferences)
      .mockResolvedValue(changedPreferences)
    mockAccountStorageExportData.mockResolvedValue({
      accounts: [],
      bookmarks: [],
      pinnedAccountIds: [],
      orderedAccountIds: [],
    })
    mockDownloadBackup.mockResolvedValue(
      JSON.stringify({
        version: BACKUP_VERSION,
        accounts: { accounts: [], bookmarks: [] },
      }),
    )

    await service.uploadLocalSnapshotToWebdav()

    const expectedConfig = {
      url: "https://snapshot.example.test/webdav",
      username: "user",
      password: "pass",
    }
    expect(mockDownloadBackup).toHaveBeenCalledWith(expectedConfig, {
      prepareForWrite: true,
    })
    expect(mockUploadBackup).toHaveBeenCalledWith(
      expect.any(String),
      expectedConfig,
    )
    expect(mockGetPreferences).toHaveBeenCalledTimes(1)
  })

  it("reschedules when a best-effort upload collides with an in-flight sync", async () => {
    const service = createService() as any
    const scheduleSpy = vi
      .spyOn(service, "scheduleBestEffortUpload")
      .mockResolvedValue(undefined)
    const uploadSpy = vi
      .spyOn(service, "uploadLocalSnapshotToWebdav")
      .mockResolvedValue(undefined)

    service.isSyncing = true
    await service.performBestEffortUpload()

    expect(scheduleSpy).toHaveBeenCalledWith("sync_in_progress")
    expect(uploadSpy).not.toHaveBeenCalled()
  })

  it("updates sync state and notifies the frontend for successful and failed best-effort uploads", async () => {
    const service = createService() as any
    const notifySpy = vi
      .spyOn(service, "notifyFrontend")
      .mockImplementation(() => {})

    vi.spyOn(service, "uploadLocalSnapshotToWebdav").mockResolvedValueOnce(
      undefined,
    )

    await service.performBestEffortUpload()

    expect(service.getStatus()).toMatchObject({
      isSyncing: false,
      lastSyncStatus: "success",
      lastSyncError: null,
    })
    expect(service.getStatus().lastSyncTime).toBeGreaterThan(0)
    expect(notifySpy).toHaveBeenCalledWith("sync_completed", {
      timestamp: expect.any(Number),
    })

    notifySpy.mockClear()
    vi.spyOn(service, "uploadLocalSnapshotToWebdav").mockRejectedValueOnce(
      new Error("best-effort failed"),
    )

    await service.performBestEffortUpload()

    expect(service.getStatus().lastSyncStatus).toBe("error")
    expect(service.getStatus().lastSyncError).toContain("best-effort failed")
    expect(notifySpy).toHaveBeenCalledWith("sync_error", {
      error: expect.stringContaining("best-effort failed"),
    })
  })
})
