import { beforeEach, describe, expect, it, vi } from "vitest"

import { Storage } from "@plasmohq/storage"

import { BACKUP_VERSION } from "~/constants/importExport"
import { USER_PREFERENCES_STORAGE_KEYS } from "~/services/core/storageKeys"
import { CURRENT_PREFERENCES_VERSION } from "~/services/preferences/migrations/preferencesMigration"
import {
  DEFAULT_PREFERENCES,
  userPreferences,
} from "~/services/preferences/userPreferences"
import { webdavAutoSyncService } from "~/services/webdav/webdavAutoSyncService"
import { DEFAULT_ACCOUNT_AUTO_REFRESH } from "~/types/accountAutoRefresh"
import { DEFAULT_WEBDAV_SETTINGS } from "~/types/webdav"
import { channelConfigSnapshot } from "~~/tests/test-utils/channelConfigSnapshot"

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
  mockExportPreferencesForBackup,
  mockFeatureGuidanceGetStateStrict,
  mockGetPreferences,
  mockImportPreferences,
  mockParseWebdavBackupJson,
  mockTagStoreExport,
  mockTagStoreImport,
  mockTestConnection,
  mockUploadBackup,
  preferenceWriteSuccess,
} from "./webdavAutoSyncHarness"

// Register shared module mocks before loading the service under test.
await vi.hoisted(() => import("./webdavAutoSyncHarness"))

describe("WebdavAutoSyncService.syncWithWebdav (selective sync)", () => {
  const createService = () => new (webdavAutoSyncService as any).constructor()

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

    mockTagStoreExport.mockResolvedValue({ version: 1, tagsById: {} })
    mockExportPreferences.mockResolvedValue({ lastUpdated: 1 } as any)
    mockExportPreferencesForBackup.mockImplementation(() =>
      mockExportPreferences(),
    )
    mockChannelConfigExport.mockResolvedValue({ schemaVersion: 1, configs: {} })
    mockApiCredentialProfilesExport.mockResolvedValue({
      version: 2,
      profiles: [],
      lastUpdated: 0,
    })
  })

  it("rejects when no syncData domains are enabled", async () => {
    const service = createService()

    mockGetPreferences.mockResolvedValue({
      webdav: {
        syncStrategy: "merge",
        syncData: {
          accounts: false,
          bookmarks: false,
          apiCredentialProfiles: false,
          preferences: false,
        },
      },
    } as any)

    await expect(service.syncWithWebdav()).rejects.toThrow()
  })

  it("stops before WebDAV IO when the guidance snapshot cannot be read", async () => {
    const service = createService()
    mockGetPreferences.mockResolvedValue({
      webdav: {
        syncStrategy: "merge",
        syncData: {
          accounts: false,
          bookmarks: false,
          apiCredentialProfiles: false,
          preferences: true,
        },
      },
    } as any)
    mockFeatureGuidanceGetStateStrict.mockRejectedValueOnce(
      new Error("guidance storage unavailable"),
    )

    await expect(service.syncWithWebdav()).rejects.toThrow(
      "guidance storage unavailable",
    )

    expect(mockTestConnection).not.toHaveBeenCalled()
    expect(mockImportPreferences).not.toHaveBeenCalled()
    expect(mockUploadBackup).not.toHaveBeenCalled()
  })

  it("rethrows the provider error for a GitHub Gist connection failure", async () => {
    const service = createService()
    mockGetPreferences.mockResolvedValue({
      webdav: {
        provider: "github_gist",
        githubGist: { token: "token", gistId: "gist-1" },
        syncData: {
          accounts: true,
          bookmarks: false,
          apiCredentialProfiles: false,
          preferences: false,
        },
      },
    } as any)
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")))

    await expect(service.syncWithWebdav()).rejects.toMatchObject({
      code: "CLOUD_SYNC_NETWORK",
    })
    expect(mockUploadBackup).not.toHaveBeenCalled()
  })

  it("treats a missing remote backup as first upload", async () => {
    const service = createService()

    mockGetPreferences.mockResolvedValue({
      webdav: {
        syncStrategy: "upload_only",
        syncData: {
          accounts: true,
          bookmarks: false,
          apiCredentialProfiles: false,
          preferences: false,
        },
      },
    } as any)

    mockAccountStorageExportData.mockResolvedValue({
      accounts: [{ id: "a1", created_at: 1, updated_at: 1 }],
      bookmarks: [{ id: "b1", created_at: 2, updated_at: 2 }],
      pinnedAccountIds: ["a1"],
      orderedAccountIds: ["a1", "b1"],
      last_updated: 100,
    })

    mockDownloadBackup.mockRejectedValue({
      code: "WEBDAV_FILE_NOT_FOUND",
      message: "messages:webdav.fileNotFound",
    })

    await expect(service.syncWithWebdav()).resolves.toBeUndefined()
    expect(mockDownloadBackup).toHaveBeenCalledWith(undefined, {
      prepareForWrite: true,
    })

    const uploaded = JSON.parse(mockUploadBackup.mock.calls[0][0])
    expect(
      uploaded.accounts.accounts.map((account: any) => account.id),
    ).toEqual(["a1"])
    expect(uploaded.preferences).toBeUndefined()
  })

  it("surfaces safe commit failure during upload-only first upload", async () => {
    const service = createService()

    mockGetPreferences.mockResolvedValue({
      webdav: {
        syncStrategy: "upload_only",
        syncData: {
          accounts: true,
          bookmarks: false,
          apiCredentialProfiles: false,
          preferences: false,
        },
      },
    } as any)

    mockAccountStorageExportData.mockResolvedValue({
      accounts: [{ id: "local-account", created_at: 1, updated_at: 10 }],
      bookmarks: [],
      pinnedAccountIds: ["local-account"],
      orderedAccountIds: ["local-account"],
      last_updated: 100,
    })
    mockDownloadBackup.mockRejectedValue({
      code: "WEBDAV_FILE_NOT_FOUND",
      message: "messages:webdav.fileNotFound",
    })
    mockUploadBackup.mockRejectedValueOnce(
      new Error("messages:webdav.safeCommitFailed"),
    )

    await expect(service.syncWithWebdav()).rejects.toThrow(
      "messages:webdav.safeCommitFailed",
    )

    expect(mockAccountStorageImportData).not.toHaveBeenCalled()
    expect(mockUploadBackup).toHaveBeenCalledTimes(1)
  })

  it("rejects malformed remote backup JSON with a stable WebDAV backup error", async () => {
    const service = createService()

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
      accounts: [{ id: "a1", created_at: 1, updated_at: 1 }],
      bookmarks: [],
      pinnedAccountIds: ["a1"],
      orderedAccountIds: ["a1"],
      last_updated: 100,
    })
    mockDownloadBackup.mockResolvedValue('{"version":"2.0","accounts":"')
    mockParseWebdavBackupJson.mockImplementationOnce(() => {
      throw new Error("messages:webdav.invalidBackupJson")
    })

    await expect(service.syncWithWebdav()).rejects.toThrow(
      "messages:webdav.invalidBackupJson",
    )

    expect(mockAccountStorageImportData).not.toHaveBeenCalled()
    expect(mockUploadBackup).not.toHaveBeenCalled()
  })

  it("keeps independent local and remote additions during Smart Merge", async () => {
    const service = createService()

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
        { id: "base", created_at: 1, updated_at: 100 },
        { id: "local-only", created_at: 2, updated_at: 200 },
      ],
      bookmarks: [],
      pinnedAccountIds: [],
      orderedAccountIds: ["base", "local-only"],
      last_updated: 200,
    })
    mockDownloadBackup.mockResolvedValue(
      JSON.stringify({
        version: BACKUP_VERSION,
        timestamp: 300,
        accounts: {
          accounts: [
            { id: "base", created_at: 1, updated_at: 100 },
            { id: "remote-only", created_at: 3, updated_at: 300 },
          ],
          pinnedAccountIds: [],
          orderedAccountIds: ["base", "remote-only"],
          last_updated: 300,
        },
        tagStore: { version: 1, tagsById: {} },
        channelConfigs: { schemaVersion: 1, configs: {} },
      }),
    )

    await service.syncWithWebdav()

    const importedAccounts = mockAccountStorageImportData.mock.calls[0][0]
      .accounts as Array<{ id: string }>
    expect(importedAccounts.map((account) => account.id).sort()).toEqual([
      "base",
      "local-only",
      "remote-only",
    ])

    const uploaded = JSON.parse(mockUploadBackup.mock.calls[0][0])
    expect(
      uploaded.accounts.accounts
        .map((account: { id: string }) => account.id)
        .sort(),
    ).toEqual(["base", "local-only", "remote-only"])
  })

  it("download_only preserves local accounts when remote omits the accounts section", async () => {
    const service = createService()

    mockGetPreferences.mockResolvedValue({
      webdav: {
        syncStrategy: "download_only",
        syncData: {
          accounts: true,
          bookmarks: false,
          apiCredentialProfiles: false,
          preferences: false,
        },
      },
    } as any)

    mockAccountStorageExportData.mockResolvedValue({
      accounts: [{ id: "a1", created_at: 1, updated_at: 1 }],
      bookmarks: [{ id: "b1", created_at: 2, updated_at: 2 }],
      pinnedAccountIds: ["b1"],
      orderedAccountIds: ["b1", "a1"],
      last_updated: 100,
    })

    mockDownloadBackup.mockResolvedValue(
      JSON.stringify({
        version: "2.0",
        timestamp: 200,
        channelConfigs: {},
      }),
    )

    await service.syncWithWebdav()

    const importArgs = mockAccountStorageImportData.mock.calls[0][0]
    expect(importArgs.accounts.map((a: any) => a.id)).toEqual(["a1"])
    expect(importArgs.bookmarks.map((b: any) => b.id)).toEqual(["b1"])

    const uploaded = JSON.parse(mockUploadBackup.mock.calls[0][0])
    expect(uploaded.accounts.accounts.map((a: any) => a.id)).toEqual(["a1"])
    expect(uploaded.accounts.bookmarks).toBeUndefined()
  })

  it("download_only preserves local channel configs when the remote section is missing", async () => {
    const service = createService()
    const localChannelConfigs = {
      schemaVersion: 1,
      configs: {
        local: { enabled: true },
      },
    }

    mockGetPreferences.mockResolvedValue({
      webdav: {
        syncStrategy: "download_only",
        syncData: {
          accounts: true,
          bookmarks: false,
          apiCredentialProfiles: false,
          preferences: false,
        },
      },
    } as any)
    mockAccountStorageExportData.mockResolvedValue({
      accounts: [{ id: "a1", created_at: 1, updated_at: 1 }],
      bookmarks: [],
      pinnedAccountIds: ["a1"],
      orderedAccountIds: ["a1"],
      last_updated: 100,
    })
    mockChannelConfigExport.mockResolvedValue(localChannelConfigs)
    mockChannelConfigMerge.mockResolvedValue(localChannelConfigs)
    mockDownloadBackup.mockResolvedValue(
      JSON.stringify({
        version: "2.0",
        timestamp: 200,
        accounts: {
          accounts: [{ id: "remote", created_at: 2, updated_at: 2 }],
          pinnedAccountIds: ["remote"],
          orderedAccountIds: ["remote"],
          last_updated: 200,
        },
      }),
    )

    await service.syncWithWebdav()

    expect(mockChannelConfigMerge).toHaveBeenCalledWith({
      schemaVersion: 1,
      configs: {},
    })
    const uploaded = JSON.parse(mockUploadBackup.mock.calls[0][0])
    expect(uploaded.channelConfigs).toEqual(localChannelConfigs)
  })

  it.each(["merge", "download_only"])(
    "%s preserves channel edits made while downloading a backup without channel configs",
    async (syncStrategy) => {
      const { channelConfigStorage: storage } = await vi.importActual<
        typeof import("~/services/managedSites/channelConfigStorage")
      >("~/services/managedSites/channelConfigStorage")
      const oldSnapshot = channelConfigSnapshot([
        { resourceId: "removed", updatedAt: 100 },
      ])
      const latestSnapshot = channelConfigSnapshot([
        { resourceId: "new", updatedAt: 200 },
      ])
      await storage.importConfigs(oldSnapshot)
      mockChannelConfigExport.mockImplementation(() => storage.exportConfigs())
      mockChannelConfigMerge.mockImplementation((incoming) =>
        storage.mergeConfigs(incoming),
      )
      mockGetPreferences.mockResolvedValue({
        webdav: {
          syncStrategy,
          syncData: {
            accounts: true,
            bookmarks: false,
            apiCredentialProfiles: false,
            preferences: false,
          },
        },
      })
      mockAccountStorageExportData.mockResolvedValue({
        accounts: [],
        bookmarks: [],
        pinnedAccountIds: [],
        orderedAccountIds: [],
        last_updated: 100,
      })
      mockDownloadBackup.mockImplementation(async () => {
        // A local replacement finishes after the sync captured its snapshot.
        await storage.importConfigs(latestSnapshot)
        return JSON.stringify({
          version: BACKUP_VERSION,
          accounts: { accounts: [], last_updated: 200 },
        })
      })

      await createService().syncWithWebdav()

      expect(await storage.exportConfigs()).toEqual(latestSnapshot)
      expect(
        JSON.parse(mockUploadBackup.mock.calls[0][0]).channelConfigs,
      ).toEqual(latestSnapshot)
    },
  )

  it("aborts download-only before any writes when remote credentials are malformed", async () => {
    const { parseWebdavBackupJson } = await vi.importActual<
      typeof import("~/services/webdav/webdavService")
    >("~/services/webdav/webdavService")
    mockParseWebdavBackupJson.mockImplementation(parseWebdavBackupJson)
    mockGetPreferences.mockResolvedValue({
      webdav: {
        syncStrategy: "download_only",
        syncData: {
          accounts: false,
          bookmarks: false,
          apiCredentialProfiles: true,
          preferences: false,
        },
      },
    })
    mockAccountStorageExportData.mockResolvedValue({
      accounts: [],
      last_updated: 100,
    })
    mockDownloadBackup.mockResolvedValue(
      JSON.stringify({
        version: BACKUP_VERSION,
        apiCredentialProfiles: { profiles: "broken" },
      }),
    )

    await expect(createService().syncWithWebdav()).rejects.toThrow()

    expect(mockApiCredentialProfilesImport).not.toHaveBeenCalled()
    expect(mockAccountStorageImportData).not.toHaveBeenCalled()
    expect(mockImportPreferences).not.toHaveBeenCalled()
    expect(mockChannelConfigMerge).not.toHaveBeenCalled()
    expect(mockUploadBackup).not.toHaveBeenCalled()
  })

  it("bookmarks-only import preserves local accounts", async () => {
    const service = createService()

    mockGetPreferences.mockResolvedValue({
      webdav: {
        syncStrategy: "download_only",
        syncData: {
          accounts: false,
          bookmarks: true,
          apiCredentialProfiles: false,
          preferences: false,
        },
      },
    } as any)

    mockAccountStorageExportData.mockResolvedValue({
      accounts: [{ id: "a1", created_at: 1, updated_at: 1 }],
      bookmarks: [{ id: "b-local", created_at: 2, updated_at: 2 }],
      pinnedAccountIds: ["a1"],
      orderedAccountIds: ["a1", "b-local"],
      last_updated: 100,
    })

    mockDownloadBackup.mockResolvedValue(
      JSON.stringify({
        version: "2.0",
        timestamp: 200,
        accounts: {
          bookmarks: [{ id: "b-remote", created_at: 3, updated_at: 3 }],
          pinnedAccountIds: ["b-remote"],
          orderedAccountIds: ["b-remote"],
          last_updated: 200,
        },
        channelConfigs: {},
      }),
    )

    await service.syncWithWebdav()

    const importArgs = mockAccountStorageImportData.mock.calls[0][0]
    expect(importArgs.accounts.map((a: any) => a.id)).toEqual(["a1"])
    expect(importArgs.bookmarks.map((b: any) => b.id)).toEqual(["b-remote"])

    const uploaded = JSON.parse(mockUploadBackup.mock.calls[0][0])
    expect(uploaded.accounts.accounts).toBeUndefined()
    expect(uploaded.accounts.bookmarks.map((b: any) => b.id)).toEqual([
      "b-remote",
    ])
  })

  it("preferences-only sync preserves remote accounts in uploaded backup", async () => {
    const service = createService()

    mockGetPreferences.mockResolvedValue({
      webdav: {
        syncStrategy: "merge",
        syncData: {
          accounts: false,
          bookmarks: false,
          apiCredentialProfiles: false,
          preferences: true,
        },
      },
    } as any)

    mockAccountStorageExportData.mockResolvedValue({
      accounts: [{ id: "local-account", created_at: 1, updated_at: 1 }],
      bookmarks: [],
      pinnedAccountIds: ["local-account"],
      orderedAccountIds: ["local-account"],
      last_updated: 300,
    })

    mockExportPreferences.mockResolvedValue({
      lastUpdated: 300,
      themeMode: "dark",
    } as any)

    mockDownloadBackup.mockResolvedValue(
      JSON.stringify({
        version: "2.0",
        timestamp: 200,
        accounts: {
          accounts: [{ id: "remote-account", created_at: 2, updated_at: 2 }],
          bookmarks: [{ id: "remote-bookmark", created_at: 3, updated_at: 3 }],
          pinnedAccountIds: ["remote-bookmark"],
          orderedAccountIds: ["remote-bookmark", "remote-account"],
          last_updated: 200,
        },
        preferences: {
          lastUpdated: 100,
          themeMode: "light",
        },
        tagStore: { version: 1, tagsById: {} },
        channelConfigs: {},
      }),
    )

    await service.syncWithWebdav()

    expect(mockAccountStorageImportData).not.toHaveBeenCalled()

    const uploaded = JSON.parse(mockUploadBackup.mock.calls[0][0])
    expect(
      uploaded.accounts.accounts.map((account: any) => account.id),
    ).toEqual(["remote-account"])
    expect(
      uploaded.accounts.bookmarks.map((bookmark: any) => bookmark.id),
    ).toEqual(["remote-bookmark"])
    expect(uploaded.preferences).toMatchObject({
      lastUpdated: 300,
      themeMode: "dark",
    })
  })

  it("ignores local-only edits when choosing newer shared remote preferences", async () => {
    const service = createService()

    mockGetPreferences.mockResolvedValue({
      webdav: {
        syncStrategy: "merge",
        syncData: {
          accounts: false,
          bookmarks: false,
          apiCredentialProfiles: false,
          preferences: true,
        },
      },
    } as any)

    mockAccountStorageExportData.mockResolvedValue({
      accounts: [],
      bookmarks: [],
      pinnedAccountIds: [],
      orderedAccountIds: [],
      last_updated: 400,
    })

    mockExportPreferences.mockResolvedValue({
      lastUpdated: 400,
      sharedPreferencesLastUpdated: 100,
      themeMode: "local-theme",
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

    mockDownloadBackup.mockResolvedValue(
      JSON.stringify({
        version: "2.0",
        timestamp: 200,
        preferences: {
          lastUpdated: 200,
          sharedPreferencesLastUpdated: 300,
          themeMode: "remote-theme",
          accountAutoRefresh: {
            ...DEFAULT_ACCOUNT_AUTO_REFRESH,
            interval: DEFAULT_ACCOUNT_AUTO_REFRESH.interval + 300,
          },
          webdav: {
            ...DEFAULT_WEBDAV_SETTINGS,
            syncData: {
              ...DEFAULT_WEBDAV_SETTINGS.syncData,
              accounts: true,
              preferences: false,
            },
          },
        },
        channelConfigs: {},
      }),
    )

    await service.syncWithWebdav()

    expect(mockImportPreferences).toHaveBeenCalledWith(
      expect.objectContaining({
        lastUpdated: 200,
        sharedPreferencesLastUpdated: 300,
        themeMode: "remote-theme",
        accountAutoRefresh: expect.objectContaining({
          interval: DEFAULT_ACCOUNT_AUTO_REFRESH.interval + 60,
        }),
        webdav: expect.objectContaining({
          syncData: expect.objectContaining({
            accounts: false,
          }),
        }),
      }),
      {
        preserveWebdav: true,
      },
    )

    const uploaded = JSON.parse(mockUploadBackup.mock.calls[0][0])
    expect(uploaded.preferences).toMatchObject({
      lastUpdated: 300,
      sharedPreferencesLastUpdated: 300,
      themeMode: "remote-theme",
    })
    expect(uploaded.preferences.accountAutoRefresh).toBeUndefined()
    expect(uploaded.preferences.webdav).toBeUndefined()
  })

  it("converges legacy WebDAV preferences to the current canonical snapshot before the next upload", async () => {
    const storage = new Storage({ area: "local" })
    const service = createService()
    const userPreferencesPrototype = Object.getPrototypeOf(userPreferences)

    await storage.set(USER_PREFERENCES_STORAGE_KEYS.USER_PREFERENCES, {
      ...DEFAULT_PREFERENCES,
      lastUpdated: 100,
      sharedPreferencesLastUpdated: 100,
    })
    mockGetPreferences.mockResolvedValue({
      webdav: {
        syncStrategy: "merge",
        syncData: {
          accounts: false,
          bookmarks: false,
          apiCredentialProfiles: false,
          preferences: true,
        },
      },
    } as any)
    mockExportPreferences.mockImplementation(() =>
      userPreferencesPrototype.getPreferences.call(userPreferences),
    )
    mockImportPreferences.mockImplementation((...args) =>
      userPreferencesPrototype.importPreferences.call(userPreferences, ...args),
    )
    mockDownloadBackup.mockResolvedValue(
      JSON.stringify({
        version: "2.0",
        timestamp: 200,
        preferences: {
          ...DEFAULT_PREFERENCES,
          preferencesVersion: 26,
          lastUpdated: 200,
          sharedPreferencesLastUpdated: 200,
          tempWindowFallback: {
            enabled: true,
            useForAutoRefresh: false,
            tempContextMode: "composite",
          },
        },
        channelConfigs: {},
      }),
    )

    try {
      await service.syncWithWebdav()

      const storedAfterImport = (await storage.get(
        USER_PREFERENCES_STORAGE_KEYS.USER_PREFERENCES,
      )) as any
      expect(storedAfterImport.preferencesVersion).toBe(
        CURRENT_PREFERENCES_VERSION,
      )
      expect(storedAfterImport.tempWindowFallback).toMatchObject({
        automaticFeatureBypass: { account_refresh: false },
      })
      expect(storedAfterImport.tempWindowFallback).not.toHaveProperty(
        "useForAutoRefresh",
      )

      mockUploadBackup.mockClear()
      mockGetPreferences.mockResolvedValue({
        webdav: {
          syncStrategy: "upload_only",
          syncData: {
            accounts: false,
            bookmarks: false,
            apiCredentialProfiles: false,
            preferences: true,
          },
        },
      } as any)
      mockDownloadBackup.mockRejectedValue({
        code: "WEBDAV_FILE_NOT_FOUND",
        message: "messages:webdav.fileNotFound",
      })

      await service.syncWithWebdav()

      const uploaded = JSON.parse(mockUploadBackup.mock.calls[0][0])
      expect(uploaded.preferences.preferencesVersion).toBe(
        CURRENT_PREFERENCES_VERSION,
      )
      expect(uploaded.preferences.tempWindowFallback).toMatchObject({
        automaticFeatureBypass: { account_refresh: false },
      })
      expect(uploaded.preferences.tempWindowFallback).not.toHaveProperty(
        "useForAutoRefresh",
      )
    } finally {
      await storage.remove(USER_PREFERENCES_STORAGE_KEYS.USER_PREFERENCES)
    }
  })

  it("accounts-only sync preserves remote bookmarks metadata in uploaded backup", async () => {
    const service = createService()

    mockGetPreferences.mockResolvedValue({
      webdav: {
        syncStrategy: "upload_only",
        syncData: {
          accounts: true,
          bookmarks: false,
          apiCredentialProfiles: false,
          preferences: false,
        },
      },
    } as any)

    mockAccountStorageExportData.mockResolvedValue({
      accounts: [{ id: "local-account", created_at: 1, updated_at: 10 }],
      bookmarks: [{ id: "local-bookmark", created_at: 2, updated_at: 20 }],
      pinnedAccountIds: ["local-account"],
      orderedAccountIds: ["local-account"],
      last_updated: 300,
    })

    mockDownloadBackup.mockResolvedValue(
      JSON.stringify({
        version: "2.0",
        timestamp: 200,
        accounts: {
          accounts: [{ id: "remote-account", created_at: 2, updated_at: 2 }],
          bookmarks: [{ id: "remote-bookmark", created_at: 3, updated_at: 3 }],
          pinnedAccountIds: ["remote-bookmark", "remote-account"],
          orderedAccountIds: ["remote-bookmark", "remote-account"],
          last_updated: 200,
        },
        channelConfigs: {},
      }),
    )

    await service.syncWithWebdav()

    expect(mockAccountStorageImportData).not.toHaveBeenCalled()

    const uploaded = JSON.parse(mockUploadBackup.mock.calls[0][0])
    expect(
      uploaded.accounts.accounts.map((account: any) => account.id),
    ).toEqual(["local-account"])
    expect(
      uploaded.accounts.bookmarks.map((bookmark: any) => bookmark.id),
    ).toEqual(["remote-bookmark"])
    expect(uploaded.accounts.pinnedAccountIds).toEqual([
      "local-account",
      "remote-bookmark",
    ])
    expect(uploaded.accounts.orderedAccountIds).toEqual([
      "local-account",
      "remote-bookmark",
    ])
  })

  it("apiCredentialProfiles-only sync preserves remote accounts in uploaded backup", async () => {
    const service = createService()

    mockGetPreferences.mockResolvedValue({
      webdav: {
        syncStrategy: "upload_only",
        syncData: {
          accounts: false,
          bookmarks: false,
          apiCredentialProfiles: true,
          preferences: false,
        },
      },
    } as any)

    mockAccountStorageExportData.mockResolvedValue({
      accounts: [{ id: "local-account", created_at: 1, updated_at: 10 }],
      bookmarks: [{ id: "local-bookmark", created_at: 2, updated_at: 20 }],
      pinnedAccountIds: ["local-account", "local-bookmark"],
      orderedAccountIds: ["local-account", "local-bookmark"],
      last_updated: 300,
    })

    mockTagStoreExport.mockResolvedValue({
      version: 1,
      tagsById: { local: { id: "local-tag" } },
    })
    mockApiCredentialProfilesExport.mockResolvedValue({
      version: 2,
      profiles: [{ id: "local-profile" }],
      lastUpdated: 300,
    })

    mockDownloadBackup.mockResolvedValue(
      JSON.stringify({
        version: "2.0",
        timestamp: 200,
        accounts: {
          accounts: [{ id: "remote-account", created_at: 2, updated_at: 2 }],
          bookmarks: [{ id: "remote-bookmark", created_at: 3, updated_at: 3 }],
          pinnedAccountIds: ["remote-account", "remote-bookmark"],
          orderedAccountIds: ["remote-bookmark", "remote-account"],
          last_updated: 200,
        },
        tagStore: {
          version: 1,
          tagsById: { remote: { id: "remote-tag" } },
        },
        apiCredentialProfiles: {
          version: 2,
          profiles: [{ id: "remote-profile" }],
          lastUpdated: 200,
        },
        preferences: {
          lastUpdated: 100,
          themeMode: "light",
        },
        channelConfigs: {},
      }),
    )

    await service.syncWithWebdav()

    expect(mockAccountStorageImportData).not.toHaveBeenCalled()

    const uploaded = JSON.parse(mockUploadBackup.mock.calls[0][0])
    expect(
      uploaded.accounts.accounts.map((account: any) => account.id),
    ).toEqual(["remote-account"])
    expect(
      uploaded.accounts.bookmarks.map((bookmark: any) => bookmark.id),
    ).toEqual(["remote-bookmark"])
    expect(uploaded.apiCredentialProfiles.profiles).toEqual([
      { id: "local-profile" },
    ])
    expect(uploaded.tagStore).toEqual({
      version: 1,
      tagsById: { local: { id: "local-tag" } },
    })
  })

  it("rejects a future nested profile config before local writes or upload", async () => {
    const service = createService()
    mockGetPreferences.mockResolvedValue({
      webdav: {
        syncStrategy: "merge",
        syncData: {
          accounts: false,
          bookmarks: false,
          apiCredentialProfiles: true,
          preferences: false,
        },
      },
    } as any)
    mockAccountStorageExportData.mockResolvedValue({
      accounts: [],
      bookmarks: [],
      pinnedAccountIds: [],
      orderedAccountIds: [],
      last_updated: 1,
    })
    mockDownloadBackup.mockResolvedValue(
      JSON.stringify({
        version: BACKUP_VERSION,
        timestamp: 2,
        apiCredentialProfiles: {
          version: 999,
          profiles: [],
          futureField: { preserve: true },
        },
      }),
    )

    await expect(service.syncWithWebdav()).rejects.toThrow(
      "Unsupported API credential profiles config version",
    )
    expect(mockAccountStorageImportData).not.toHaveBeenCalled()
    expect(mockApiCredentialProfilesImport).not.toHaveBeenCalled()
    expect(mockUploadBackup).not.toHaveBeenCalled()
  })
})
