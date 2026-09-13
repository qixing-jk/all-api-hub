import { beforeEach, describe, expect, it, vi } from "vitest"

import { createDefaultTagStore } from "~/services/tags/tagStoreUtils"
import { webdavAutoSyncService } from "~/services/webdav/webdavAutoSyncService"
import { DEFAULT_ACCOUNT_AUTO_REFRESH } from "~/types/accountAutoRefresh"
import { DEFAULT_WEBDAV_SETTINGS } from "~/types/webdav"
import { channelConfigSnapshot } from "~~/tests/test-utils/channelConfigSnapshot"
import { createDeferred } from "~~/tests/test-utils/deferred"

import {
  mockAccountStorageExportData,
  mockAccountStorageImportData,
  mockApiCredentialProfilesExport,
  mockApiCredentialProfilesImport,
  mockChannelConfigExport,
  mockChannelConfigImport,
  mockChannelConfigMerge,
  mockDownloadBackup,
  mockExportPreferences,
  mockFeatureGuidanceTransaction,
  mockGetPreferences,
  mockImportPreferences,
  mockParseWebdavBackupJson,
  mockTagStoreExport,
  mockTagStoreImport,
  mockTestConnection,
  mockUploadBackup,
  preferenceWriteFailure,
  preferenceWriteSuccess,
} from "./webdavAutoSyncHarness"

// Register shared module mocks before loading the service under test.
await vi.hoisted(() => import("./webdavAutoSyncHarness"))

describe("WebdavAutoSyncService local apply phase", () => {
  const createService = () => new (webdavAutoSyncService as any).constructor()
  const localChannelConfigs = channelConfigSnapshot([
    { resourceId: "1", channelId: 1, updatedAt: 100 },
  ])
  const remoteChannelConfigs = channelConfigSnapshot([
    { resourceId: "2", channelId: 2, updatedAt: 200 },
  ])

  beforeEach(() => {
    vi.clearAllMocks()

    mockTestConnection.mockResolvedValue(true)
    mockUploadBackup.mockResolvedValue(true)
    mockParseWebdavBackupJson.mockImplementation((content: string) =>
      JSON.parse(content),
    )

    mockAccountStorageImportData.mockResolvedValue({ migratedCount: 0 })
    mockChannelConfigImport.mockResolvedValue(undefined)
    mockChannelConfigMerge.mockImplementation(async (snapshot) => snapshot)
    mockApiCredentialProfilesImport.mockResolvedValue(undefined)
    mockTagStoreImport.mockResolvedValue(undefined)
    mockImportPreferences.mockResolvedValue(preferenceWriteSuccess())

    mockAccountStorageExportData.mockResolvedValue({
      accounts: [{ id: "local-account", created_at: 1, updated_at: 10 }],
      bookmarks: [{ id: "local-bookmark", created_at: 2, updated_at: 20 }],
      pinnedAccountIds: ["local-account"],
      orderedAccountIds: ["local-account", "local-bookmark"],
      last_updated: 100,
    })
    mockTagStoreExport.mockResolvedValue({
      version: 1,
      tagsById: { local: { id: "local-tag" } },
    })
    mockExportPreferences.mockResolvedValue({
      lastUpdated: 100,
      sharedPreferencesLastUpdated: 100,
      themeMode: "dark",
      accountAutoRefresh: {
        ...DEFAULT_ACCOUNT_AUTO_REFRESH,
        interval: DEFAULT_ACCOUNT_AUTO_REFRESH.interval + 60,
      },
      webdav: {
        ...DEFAULT_WEBDAV_SETTINGS,
        syncData: {
          ...DEFAULT_WEBDAV_SETTINGS.syncData,
          accounts: false,
        },
      },
    } as any)
    mockChannelConfigExport.mockResolvedValue(localChannelConfigs)
    mockApiCredentialProfilesExport.mockResolvedValue({
      version: 2,
      profiles: [
        {
          id: "local-profile",
          name: "Local Profile",
          apiType: "openai",
          baseUrl: "https://local.example.com",
          apiKey: "local-key",
          tagIds: ["local-tag"],
          notes: "",
          createdAt: 100,
          updatedAt: 100,
        },
      ],
      lastUpdated: 100,
    })

    mockGetPreferences.mockResolvedValue({
      webdav: {
        syncStrategy: "download_only",
        syncData: {
          accounts: true,
          bookmarks: true,
          apiCredentialProfiles: true,
          preferences: true,
        },
      },
    } as any)

    mockDownloadBackup.mockResolvedValue(
      JSON.stringify({
        version: "3.0",
        timestamp: 200,
        accounts: {
          accounts: [{ id: "remote-account", created_at: 3, updated_at: 30 }],
          bookmarks: [{ id: "remote-bookmark", created_at: 4, updated_at: 40 }],
          pinnedAccountIds: ["remote-account"],
          orderedAccountIds: ["remote-account", "remote-bookmark"],
          last_updated: 200,
        },
        tagStore: { version: 1, tagsById: { remote: { id: "remote-tag" } } },
        preferences: { lastUpdated: 200, themeMode: "light" },
        channelConfigs: remoteChannelConfigs,
        apiCredentialProfiles: {
          version: 2,
          profiles: [
            {
              id: "remote-profile",
              name: "Remote Profile",
              apiType: "openai",
              baseUrl: "https://remote.example.com",
              apiKey: "remote-key",
              tagIds: ["remote-tag"],
              notes: "",
              createdAt: 200,
              updatedAt: 200,
            },
          ],
          lastUpdated: 200,
        },
      }),
    )
  })

  it("atomically merges channel configs and returns the applied snapshot", async () => {
    const service = createService() as any
    const applied = channelConfigSnapshot([
      { resourceId: "1", channelId: 1, updatedAt: 100 },
      { resourceId: "2", channelId: 2, updatedAt: 200 },
    ])
    mockChannelConfigMerge.mockResolvedValueOnce(applied)

    const result = await service.applyLocalSyncResult({
      syncDataSelection: {
        accounts: false,
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
      channelConfigsToSave: remoteChannelConfigs,
      mergeChannelConfigsOnApply: true,
      apiCredentialProfilesToSave: {
        version: 2,
        profiles: [],
        lastUpdated: 0,
      },
      localAccountsConfig: { accounts: [] },
      localTagStore: createDefaultTagStore(),
      localPreferences: {} as any,
      localApiCredentialProfiles: {
        version: 2,
        profiles: [],
        lastUpdated: 0,
      },
    })

    expect(mockChannelConfigMerge).toHaveBeenCalledWith(remoteChannelConfigs)
    expect(mockChannelConfigImport).not.toHaveBeenCalled()
    expect(result).toEqual(applied)
  })

  it("passes only the remote channel snapshot into atomic merge", async () => {
    const service = createService()
    mockGetPreferences.mockResolvedValue({
      webdav: {
        syncStrategy: "merge",
        syncData: {
          accounts: true,
          bookmarks: true,
          apiCredentialProfiles: true,
          preferences: true,
        },
      },
    } as any)

    await service.syncWithWebdav()

    expect(mockChannelConfigMerge).toHaveBeenCalledWith(remoteChannelConfigs)
  })

  it("migrates a remote-newer V6 account before local persistence and V4 upload", async () => {
    mockGetPreferences.mockResolvedValue({
      webdav: {
        syncStrategy: "merge",
        syncData: {
          accounts: true,
          bookmarks: false,
          apiCredentialProfiles: false,
          preferences: false,
        },
      },
    } as any)
    mockAccountStorageExportData.mockResolvedValue({
      accounts: [
        {
          id: "same-account",
          site_name: "local",
          updated_at: 10,
          configVersion: 7,
          checkIn: {
            automaticExecutionEnabled: true,
            methodKnowledge: { methods: {} },
            selection: { mode: "automatic" as const },
          },
        },
      ],
      bookmarks: [],
      pinnedAccountIds: [],
      orderedAccountIds: [],
      last_updated: 100,
    })
    mockDownloadBackup.mockResolvedValue(
      JSON.stringify({
        version: "3.0",
        timestamp: 200,
        accounts: {
          accounts: [
            {
              id: "same-account",
              site_name: "remote-newer",
              site_type: "new-api",
              updated_at: 20,
              configVersion: 6,
              checkIn: {
                enableDetection: true,
                autoCheckInEnabled: false,
                siteStatus: { isCheckedInToday: true },
              },
            },
          ],
          last_updated: 200,
        },
        channelConfigs: remoteChannelConfigs,
      }),
    )

    await createService().syncWithWebdav()

    const importedAccount = mockAccountStorageImportData.mock.calls[0][0]
      .accounts[0] as any
    expect(importedAccount).toMatchObject({
      site_name: "remote-newer",
      configVersion: 7,
      checkIn: {
        automaticExecutionEnabled: false,
        selection: { methodId: "new-api:daily-checkin" },
      },
    })
    expect(importedAccount.checkIn).not.toHaveProperty("enableDetection")

    const uploaded = JSON.parse(mockUploadBackup.mock.calls[0][0])
    expect(uploaded.version).toBe("4.0")
    expect(uploaded.accounts.accounts[0]).toMatchObject({
      site_name: "remote-newer",
      configVersion: 7,
    })
  })

  it("keeps a local-newer V7 account without losing its check-in data", async () => {
    const localCheckIn = {
      automaticExecutionEnabled: true,
      methodKnowledge: {
        methods: {
          "new-api:daily-checkin": {
            detection: {
              outcome: "matched",
              evidence: { source: "compatibility_registration" },
            },
            status: {
              outcome: "known",
              today: "checked",
              evidence: { source: "probe", observedAt: 30 },
            },
          },
        },
      },
      selection: {
        mode: "manual",
        methodId: "new-api:daily-checkin",
      },
    }
    mockGetPreferences.mockResolvedValue({
      webdav: {
        syncStrategy: "merge",
        syncData: {
          accounts: true,
          bookmarks: false,
          apiCredentialProfiles: false,
          preferences: false,
        },
      },
    } as any)
    mockAccountStorageExportData.mockResolvedValue({
      accounts: [
        {
          id: "same-account",
          site_name: "local-newer",
          updated_at: 30,
          configVersion: 7,
          checkIn: localCheckIn,
        },
      ],
      bookmarks: [],
      pinnedAccountIds: [],
      orderedAccountIds: [],
      last_updated: 300,
    })
    mockDownloadBackup.mockResolvedValue(
      JSON.stringify({
        version: "3.0",
        timestamp: 200,
        accounts: {
          accounts: [
            {
              id: "same-account",
              site_name: "remote-older",
              site_type: "new-api",
              updated_at: 20,
              configVersion: 6,
              checkIn: {
                enableDetection: true,
                autoCheckInEnabled: false,
              },
            },
          ],
          last_updated: 200,
        },
        channelConfigs: remoteChannelConfigs,
      }),
    )

    await createService().syncWithWebdav()

    const importedAccount = mockAccountStorageImportData.mock.calls[0][0]
      .accounts[0] as any
    expect(importedAccount.site_name).toBe("local-newer")
    expect(importedAccount.checkIn).toEqual(localCheckIn)

    const uploaded = JSON.parse(mockUploadBackup.mock.calls[0][0])
    expect(uploaded.version).toBe("4.0")
    expect(uploaded.accounts.accounts[0].checkIn).toEqual(localCheckIn)
  })

  it("starts each local import only after the previous one completes", async () => {
    const service = createService()
    const accountDeferred = createDeferred<{ migratedCount: number }>()
    const callOrder: string[] = []

    mockAccountStorageImportData.mockImplementation(async () => {
      callOrder.push("account:start")
      const result = await accountDeferred.promise
      callOrder.push("account:done")
      return result
    })
    mockTagStoreImport.mockImplementation(async () => {
      callOrder.push("tag")
    })
    mockImportPreferences.mockImplementation(async () => {
      callOrder.push("preferences")
      return preferenceWriteSuccess()
    })
    mockChannelConfigImport.mockImplementation(async () => {
      callOrder.push("channel")
    })
    mockApiCredentialProfilesImport.mockImplementation(async () => {
      callOrder.push("api")
      return { version: 2, profiles: [], lastUpdated: 0 }
    })

    const syncPromise = service.syncWithWebdav()

    await vi.waitFor(() => {
      expect(mockAccountStorageImportData).toHaveBeenCalledTimes(1)
    })

    expect(mockTagStoreImport).not.toHaveBeenCalled()
    expect(mockImportPreferences).not.toHaveBeenCalled()
    expect(mockChannelConfigImport).not.toHaveBeenCalled()
    expect(mockApiCredentialProfilesImport).not.toHaveBeenCalled()

    accountDeferred.resolve({ migratedCount: 0 })

    await syncPromise

    expect(callOrder).toEqual([
      "account:start",
      "account:done",
      "tag",
      "preferences",
      "api",
      "channel",
    ])
  })

  it("rolls back earlier writes when a later local import fails", async () => {
    const service = createService()
    const deletedEntryRecords = {
      deleted: { kind: "account", deletedAt: 200, entryUpdatedAt: 100 },
    }
    const localSnapshot = await mockAccountStorageExportData()
    mockAccountStorageExportData.mockResolvedValue({
      ...localSnapshot,
      deletedEntryRecords,
    })

    mockAccountStorageImportData.mockResolvedValue({ migratedCount: 0 })
    mockTagStoreImport.mockResolvedValue(undefined)
    mockImportPreferences.mockResolvedValue(preferenceWriteSuccess())
    mockChannelConfigImport.mockRejectedValueOnce(new Error("channel failed"))

    await expect(service.syncWithWebdav()).rejects.toThrow("channel failed")

    expect(mockAccountStorageImportData).toHaveBeenNthCalledWith(1, {
      deletedEntryRecords,
      accounts: [{ id: "remote-account", created_at: 3, updated_at: 30 }],
      pinnedAccountIds: ["remote-account"],
      orderedAccountIds: ["remote-account", "remote-bookmark"],
      bookmarks: [{ id: "remote-bookmark", created_at: 4, updated_at: 40 }],
    })
    expect(mockTagStoreImport).toHaveBeenCalledTimes(2)
    expect(mockImportPreferences).toHaveBeenCalledTimes(2)
    expect(mockAccountStorageImportData).toHaveBeenNthCalledWith(2, {
      deletedEntryRecords,
      accounts: [{ id: "local-account", created_at: 1, updated_at: 10 }],
      bookmarks: [{ id: "local-bookmark", created_at: 2, updated_at: 20 }],
      pinnedAccountIds: ["local-account"],
      orderedAccountIds: ["local-account", "local-bookmark"],
    })
    expect(mockApiCredentialProfilesImport).toHaveBeenCalledTimes(2)
    expect(mockFeatureGuidanceTransaction).toHaveBeenCalledTimes(1)
    expect(mockUploadBackup).not.toHaveBeenCalled()
  })

  it("continues rolling back other domains when restoring preferences fails", async () => {
    mockChannelConfigImport.mockRejectedValueOnce(new Error("channel failed"))
    mockImportPreferences
      .mockResolvedValueOnce(preferenceWriteSuccess())
      .mockRejectedValueOnce(new Error("preference rollback failed"))

    await expect(createService().syncWithWebdav()).rejects.toThrow(
      "channel failed",
    )

    expect(mockTagStoreImport).toHaveBeenCalledTimes(2)
    expect(mockAccountStorageImportData).toHaveBeenCalledTimes(2)
    expect(mockAccountStorageImportData).toHaveBeenLastCalledWith(
      expect.objectContaining({
        accounts: [{ id: "local-account", created_at: 1, updated_at: 10 }],
      }),
    )
    expect(mockUploadBackup).not.toHaveBeenCalled()
  })

  it("rolls preferences back when feature guidance cannot be committed", async () => {
    const service = createService()
    const remoteFeatureGuidance = {
      schemaVersion: 1,
      productTour: {},
      gatewayGuidance: {
        onboardingCompletedAt: 200,
        dismissedAtBySurface: {},
      },
    }
    mockFeatureGuidanceTransaction.mockRejectedValueOnce(
      new Error("guidance failed"),
    )

    await expect(
      service.applyLocalSyncResult({
        syncDataSelection: {
          accounts: false,
          bookmarks: false,
          apiCredentialProfiles: false,
          preferences: true,
        },
        accountsToSave: [],
        bookmarksToSave: [],
        pinnedAccountIdsToSave: [],
        orderedAccountIdsToSave: [],
        tagStoreToSave: createDefaultTagStore(),
        preferencesToSave: { themeMode: "light" },
        featureGuidanceToSave: remoteFeatureGuidance,
        channelConfigsToSave: remoteChannelConfigs,
        mergeChannelConfigsOnApply: false,
        apiCredentialProfilesToSave: {
          version: 2,
          profiles: [],
          lastUpdated: 0,
        },
        localAccountsConfig: { accounts: [] },
        localTagStore: createDefaultTagStore(),
        localPreferences: { themeMode: "dark" },
        localApiCredentialProfiles: {
          version: 2,
          profiles: [],
          lastUpdated: 0,
        },
      }),
    ).rejects.toThrow("guidance failed")

    expect(mockImportPreferences).toHaveBeenNthCalledWith(
      1,
      { themeMode: "light" },
      { preserveWebdav: true },
    )
    expect(mockFeatureGuidanceTransaction).toHaveBeenCalledWith(
      remoteFeatureGuidance,
      expect.any(Function),
    )
    expect(mockImportPreferences).toHaveBeenNthCalledWith(
      2,
      { themeMode: "dark" },
      { preserveWebdav: true },
    )
    expect(mockChannelConfigImport).not.toHaveBeenCalled()
    expect(mockUploadBackup).not.toHaveBeenCalled()
  })

  it("does not write channel configs when api credential profile import fails", async () => {
    const service = createService()

    mockAccountStorageImportData.mockResolvedValue({ migratedCount: 0 })
    mockTagStoreImport.mockResolvedValue(undefined)
    mockImportPreferences.mockResolvedValue(preferenceWriteSuccess())
    mockChannelConfigImport.mockResolvedValue(undefined)
    mockApiCredentialProfilesImport.mockRejectedValueOnce(
      new Error("profile import failed"),
    )

    await expect(service.syncWithWebdav()).rejects.toThrow(
      "profile import failed",
    )

    expect(mockChannelConfigImport).not.toHaveBeenCalled()
    expect(mockChannelConfigMerge).not.toHaveBeenCalled()
    expect(mockImportPreferences).toHaveBeenCalledTimes(2)
    expect(mockUploadBackup).not.toHaveBeenCalled()
  })

  it("throws when importing synced preferences fails and rolls account metadata back to empty defaults", async () => {
    const service = createService()
    mockImportPreferences.mockResolvedValue(preferenceWriteFailure())

    await expect(
      (service as any).applyLocalSyncResult({
        syncDataSelection: {
          accounts: true,
          bookmarks: true,
          apiCredentialProfiles: false,
          preferences: true,
        },
        accountsToSave: [
          { id: "remote-account", created_at: 3, updated_at: 30 },
        ],
        bookmarksToSave: [
          { id: "remote-bookmark", created_at: 4, updated_at: 40 },
        ],
        pinnedAccountIdsToSave: ["remote-account"],
        orderedAccountIdsToSave: ["remote-account", "remote-bookmark"],
        tagStoreToSave: { version: 1, tagsById: {} },
        preferencesToSave: { themeMode: "light" },
        featureGuidanceToSave: {
          schemaVersion: 1,
          productTour: {},
          gatewayGuidance: { dismissedAtBySurface: {} },
        },
        channelConfigsToSave: { 2: { enabled: false } },
        apiCredentialProfilesToSave: {
          version: 2,
          profiles: [],
          lastUpdated: 0,
        },
        localAccountsConfig: {
          accounts: [{ id: "local-account", created_at: 1, updated_at: 10 }],
        },
        localTagStore: { version: 1, tagsById: {} },
        localPreferences: { themeMode: "dark" },
        localChannelConfigs: { 1: { enabled: true } },
        localApiCredentialProfiles: {
          version: 2,
          profiles: [],
          lastUpdated: 0,
        },
      }),
    ).rejects.toThrow("Failed to import WebDAV preferences")

    expect(mockAccountStorageImportData).toHaveBeenNthCalledWith(1, {
      accounts: [{ id: "remote-account", created_at: 3, updated_at: 30 }],
      pinnedAccountIds: ["remote-account"],
      orderedAccountIds: ["remote-account", "remote-bookmark"],
      bookmarks: [{ id: "remote-bookmark", created_at: 4, updated_at: 40 }],
    })
    expect(mockAccountStorageImportData).toHaveBeenNthCalledWith(2, {
      accounts: [{ id: "local-account", created_at: 1, updated_at: 10 }],
      bookmarks: [],
      pinnedAccountIds: [],
      orderedAccountIds: [],
    })
    expect(mockTagStoreImport).toHaveBeenCalledTimes(2)
  })
})
