import { beforeEach, describe, expect, it, vi } from "vitest"

import { webdavAutoSyncService } from "~/services/webdav/webdavAutoSyncService"
import { normalizeWebdavOrderedEntryIds } from "~/services/webdav/webdavSelectiveSync"

// Basic getErrorMessage passthrough to avoid noisy output
vi.mock("~/utils/core/error", () => ({
  getErrorMessage: (e: unknown) => String(e),
}))

const mockHasAlarmsAPI = vi.fn()
const mockGetAlarm = vi.fn()
const mockCreateAlarm = vi.fn()
const mockClearAlarm = vi.fn()
const mockOnAlarm = vi.fn()

vi.mock(import("~/utils/browser/browserApi"), async (importOriginal) => {
  const actual = await importOriginal()
  return {
    ...actual,
    hasAlarmsAPI: (...args: any[]) => mockHasAlarmsAPI(...args),
    getAlarm: (...args: any[]) => mockGetAlarm(...args),
    createAlarm: (...args: any[]) => mockCreateAlarm(...args),
    clearAlarm: (...args: any[]) => mockClearAlarm(...args),
    onAlarm: (...args: any[]) => mockOnAlarm(...args),
  }
})

const mockGetPreferences = vi.fn()
const mockSavePreferences = vi.fn()
const mockExportPreferences = vi.fn()
const mockImportPreferences = vi.fn()

vi.mock(
  import("~/services/preferences/userPreferences"),
  async (importOriginal) => {
    const actual = await importOriginal()
    Object.assign(actual.userPreferences, {
      getPreferences: (...args: any[]) => mockGetPreferences(...args),
      savePreferences: (...args: any[]) => mockSavePreferences(...args),
      exportPreferences: (...args: any[]) => mockExportPreferences(...args),
      importPreferences: (...args: any[]) => mockImportPreferences(...args),
    })
    return {
      ...actual,
      userPreferences: actual.userPreferences,
    }
  },
)

const mockAccountStorageExportData = vi.fn()
const mockAccountStorageImportData = vi.fn()
vi.mock("~/services/accounts/accountStorage", () => ({
  accountStorage: {
    exportData: (...args: any[]) => mockAccountStorageExportData(...args),
    importData: (...args: any[]) => mockAccountStorageImportData(...args),
  },
}))

const mockChannelConfigExport = vi.fn()
const mockChannelConfigImport = vi.fn()
vi.mock("~/services/managedSites/channelConfigStorage", () => ({
  channelConfigStorage: {
    exportConfigs: (...args: any[]) => mockChannelConfigExport(...args),
    importConfigs: (...args: any[]) => mockChannelConfigImport(...args),
  },
}))

const mockApiCredentialProfilesExport = vi.fn()
const mockApiCredentialProfilesImport = vi.fn()
vi.mock(
  import("~/services/apiCredentialProfiles/apiCredentialProfilesStorage"),
  async (importOriginal) => {
    const actual = await importOriginal()
    Object.assign(actual.apiCredentialProfilesStorage, {
      exportConfig: (...args: any[]) =>
        mockApiCredentialProfilesExport(...args),
      importConfig: (...args: any[]) =>
        mockApiCredentialProfilesImport(...args),
    })
    return {
      ...actual,
      apiCredentialProfilesStorage: actual.apiCredentialProfilesStorage,
    }
  },
)

const mockTagStoreExport = vi.fn()
const mockTagStoreImport = vi.fn()
vi.mock("~/services/tags/tagStorage", () => ({
  tagStorage: {
    // mergeData only needs this pure helper; tests not concerned with tag semantics.
    mergeTagStoresForSync: (input: any) => ({
      tagStore: input.localTagStore,
      localAccounts: input.localAccounts,
      remoteAccounts: input.remoteAccounts,
      localBookmarks: input.localBookmarks ?? [],
      remoteBookmarks: input.remoteBookmarks ?? [],
      localTaggables: input.localTaggables ?? [],
      remoteTaggables: input.remoteTaggables ?? [],
    }),
    exportTagStore: (...args: any[]) => mockTagStoreExport(...args),
    importTagStore: (...args: any[]) => mockTagStoreImport(...args),
  },
}))

// Mock WebDAV network helpers so syncWithWebdav can be tested in isolation if needed
const mockTestConnection = vi.fn()
const mockDownloadBackup = vi.fn()
const mockUploadBackup = vi.fn()

vi.mock("~/services/webdav/webdavService", () => ({
  testWebdavConnection: (...args: any[]) => mockTestConnection(...args),
  downloadBackup: (...args: any[]) => mockDownloadBackup(...args),
  isWebdavFileNotFoundError: (error: any) =>
    error?.code === "WEBDAV_FILE_NOT_FOUND",
  uploadBackup: (...args: any[]) => mockUploadBackup(...args),
}))

describe("WebdavAutoSyncService.mergeData", () => {
  const callMerge = (local: any, remote: any) =>
    (webdavAutoSyncService as any).mergeData(local, remote) as any

  const emptyApiCredentialProfiles: any = {
    version: 2,
    profiles: [],
    lastUpdated: 0,
  }

  const basePrefsLocal: any = {
    themeMode: "light",
    preferencesVersion: 1,
  } as any

  const basePrefsRemote: any = {
    themeMode: "dark",
    preferencesVersion: 2,
  } as any

  const mkChannelConfig = (id: number, updatedAt: number) => ({
    channelId: id,
    modelFilterSettings: {},
    createdAt: 0,
    updatedAt,
  })

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("merges accounts by id choosing the most recently updated", () => {
    const localAccounts = [
      { id: "a1", site_name: "local-1", updated_at: 10 } as any,
      { id: "a2", site_name: "local-2", updated_at: 5 } as any,
    ]
    const remoteAccounts = [
      { id: "a2", site_name: "remote-2", updated_at: 20 } as any,
      { id: "a3", site_name: "remote-3", updated_at: 1 } as any,
    ]

    const local: any = {
      accounts: localAccounts,
      bookmarks: [],
      accountsTimestamp: 100,
      tagStore: { version: 1, tagsById: {} },
      preferences: basePrefsLocal,
      preferencesTimestamp: 50,
      channelConfigs: {},
      apiCredentialProfiles: emptyApiCredentialProfiles,
    }

    const remote: any = {
      accounts: remoteAccounts,
      bookmarks: [],
      accountsTimestamp: 200,
      tagStore: { version: 1, tagsById: {} },
      preferences: basePrefsRemote,
      preferencesTimestamp: 60,
      channelConfigs: {},
      apiCredentialProfiles: emptyApiCredentialProfiles,
    }

    const result = callMerge(local, remote)

    const ids = result.accounts.map((a: any) => a.id).sort()
    expect(ids).toEqual(["a1", "a2", "a3"])

    const a2 = result.accounts.find((a: any) => a.id === "a2")!
    expect(a2.site_name).toBe("remote-2")
  })

  it("merges bookmarks by id choosing the most recently updated", () => {
    const local: any = {
      accounts: [],
      bookmarks: [
        {
          id: "b1",
          name: "local-1",
          url: "https://local.example.com",
          tagIds: [],
          notes: "",
          created_at: 1,
          updated_at: 10,
        },
        {
          id: "b2",
          name: "local-2",
          url: "https://local2.example.com",
          tagIds: [],
          notes: "",
          created_at: 2,
          updated_at: 5,
        },
      ],
      accountsTimestamp: 0,
      tagStore: { version: 1, tagsById: {} },
      preferences: basePrefsLocal,
      preferencesTimestamp: 0,
      channelConfigs: {},
      apiCredentialProfiles: emptyApiCredentialProfiles,
    }

    const remote: any = {
      accounts: [],
      bookmarks: [
        {
          id: "b1",
          name: "remote-1",
          url: "https://remote.example.com",
          tagIds: [],
          notes: "",
          created_at: 1,
          updated_at: 20,
        },
        {
          id: "b3",
          name: "remote-3",
          url: "https://remote3.example.com",
          tagIds: [],
          notes: "",
          created_at: 3,
          updated_at: 1,
        },
      ],
      accountsTimestamp: 0,
      tagStore: { version: 1, tagsById: {} },
      preferences: basePrefsRemote,
      preferencesTimestamp: 0,
      channelConfigs: {},
      apiCredentialProfiles: emptyApiCredentialProfiles,
    }

    const result = callMerge(local, remote)
    const ids = result.bookmarks.map((b: any) => b.id).sort()
    expect(ids).toEqual(["b1", "b2", "b3"])

    const b1 = result.bookmarks.find((b: any) => b.id === "b1")!
    expect(b1.name).toBe("remote-1")
  })

  it("chooses preferences from the side with newer preferencesTimestamp", () => {
    const local: any = {
      accounts: [],
      bookmarks: [],
      accountsTimestamp: 0,
      tagStore: { version: 1, tagsById: {} },
      preferences: { ...basePrefsLocal, themeMode: "local" },
      preferencesTimestamp: 10,
      channelConfigs: {},
      apiCredentialProfiles: emptyApiCredentialProfiles,
    }

    const remote: any = {
      accounts: [],
      bookmarks: [],
      accountsTimestamp: 0,
      tagStore: { version: 1, tagsById: {} },
      preferences: { ...basePrefsRemote, themeMode: "remote" },
      preferencesTimestamp: 20,
      channelConfigs: {},
      apiCredentialProfiles: emptyApiCredentialProfiles,
    }

    const result = callMerge(local, remote)
    expect(result.preferences.themeMode).toBe("remote")
  })

  it("merges channel configs by numeric id using latest updatedAt", () => {
    const localChannels = {
      1: mkChannelConfig(1, 10),
      2: mkChannelConfig(2, 5),
    }

    const remoteChannels = {
      2: mkChannelConfig(2, 20),
      3: mkChannelConfig(3, 1),
    }

    const local: any = {
      accounts: [],
      bookmarks: [],
      accountsTimestamp: 0,
      tagStore: { version: 1, tagsById: {} },
      preferences: basePrefsLocal,
      preferencesTimestamp: 0,
      channelConfigs: localChannels,
      apiCredentialProfiles: emptyApiCredentialProfiles,
    }

    const remote: any = {
      accounts: [],
      bookmarks: [],
      accountsTimestamp: 0,
      tagStore: { version: 1, tagsById: {} },
      preferences: basePrefsRemote,
      preferencesTimestamp: 0,
      channelConfigs: remoteChannels,
      apiCredentialProfiles: emptyApiCredentialProfiles,
    }

    const result = callMerge(local, remote)

    expect(
      Object.keys(result.channelConfigs)
        .map((k: any) => Number(k))
        .sort(),
    ).toEqual([1, 2, 3])

    // id 2 should come from remote because of newer updatedAt
    expect(result.channelConfigs[2].updatedAt).toBe(20)
  })
})

describe("normalizeWebdavOrderedEntryIds", () => {
  it("filters invalid ids, de-dupes, and appends missing entries stably", () => {
    const accounts = [
      { id: "a1", created_at: 10 } as any,
      { id: "a2", created_at: 20 } as any,
    ]
    const bookmarks = [
      { id: "b1", created_at: 30 } as any,
      { id: "b2", created_at: 40 } as any,
    ]

    const entryIdSet = new Set(["a1", "a2", "b1", "b2"])

    const ordered = normalizeWebdavOrderedEntryIds({
      baseOrderedIds: ["b2", "b2", "missing", "a2"],
      entryIdSet,
      accounts,
      bookmarks,
    })

    expect(ordered).toEqual(["b2", "a2", "a1", "b1"])
  })
})

describe("WebdavAutoSyncService.syncWithWebdav (selective sync)", () => {
  const createService = () => new (webdavAutoSyncService as any).constructor()

  beforeEach(() => {
    vi.clearAllMocks()

    mockTestConnection.mockResolvedValue(true)
    mockUploadBackup.mockResolvedValue(true)

    mockAccountStorageImportData.mockResolvedValue({ migratedCount: 0 })
    mockChannelConfigImport.mockResolvedValue(undefined)
    mockApiCredentialProfilesImport.mockResolvedValue(undefined)
    mockTagStoreImport.mockResolvedValue(undefined)
    mockImportPreferences.mockResolvedValue(true)

    mockTagStoreExport.mockResolvedValue({ version: 1, tagsById: {} })
    mockExportPreferences.mockResolvedValue({ lastUpdated: 1 } as any)
    mockChannelConfigExport.mockResolvedValue({})
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

    const uploaded = JSON.parse(mockUploadBackup.mock.calls[0][0])
    expect(
      uploaded.accounts.accounts.map((account: any) => account.id),
    ).toEqual(["a1"])
    expect(uploaded.preferences).toBeUndefined()
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
})

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
})
