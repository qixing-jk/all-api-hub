import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { ACCOUNT_STORAGE_KEYS } from "~/services/core/storageKeys"
import { createDefaultTagStore } from "~/services/tags/tagStoreUtils"
import { webdavAutoSyncService } from "~/services/webdav/webdavAutoSyncService"
import { normalizeWebdavOrderedEntryIds } from "~/services/webdav/webdavSelectiveSync"
import { DEFAULT_ACCOUNT_AUTO_REFRESH } from "~/types/accountAutoRefresh"
import { DEFAULT_WEBDAV_SETTINGS } from "~/types/webdav"

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

/**
 * Creates a deferred promise helper for tests.
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

  it("keeps local-only selections and ignores invalid remote channel config ids", () => {
    const local: any = {
      accounts: [{ id: "a1", site_name: "local-1" }],
      bookmarks: [
        {
          id: "b1",
          name: "local-bookmark",
          url: "https://local.example.com",
        },
      ],
      accountsTimestamp: 0,
      tagStore: undefined,
      preferences: { ...basePrefsLocal, themeMode: "local-only" },
      preferencesTimestamp: 10,
      channelConfigs: {
        2: { ...mkChannelConfig(2, 30), label: "local-channel" },
      },
      apiCredentialProfiles: {
        version: 2,
        profiles: [{ id: "local-profile" }],
        lastUpdated: 10,
      },
    }

    const remote: any = {
      accounts: [
        { id: "a1", site_name: "remote-1", updated_at: 999 },
        { id: "a2", site_name: "remote-2", updated_at: 999 },
      ],
      bookmarks: [
        {
          id: "b1",
          name: "remote-bookmark",
          url: "https://remote.example.com",
          updated_at: 999,
        },
        {
          id: "b2",
          name: "remote-bookmark-2",
          url: "https://remote2.example.com",
          updated_at: 999,
        },
      ],
      accountsTimestamp: 20,
      tagStore: undefined,
      preferences: { ...basePrefsRemote, themeMode: "remote-should-not-win" },
      preferencesTimestamp: 20,
      channelConfigs: {
        0: mkChannelConfig(0, 100),
        "-1": mkChannelConfig(-1, 100),
        abc: mkChannelConfig(5, 100),
        2: { ...mkChannelConfig(2, 1), label: "remote-older" },
      },
      apiCredentialProfiles: {
        version: 2,
        profiles: [{ id: "remote-profile" }],
        lastUpdated: 20,
      },
    }

    const result = (webdavAutoSyncService as any).mergeData(local, remote, {
      accounts: false,
      bookmarks: false,
      apiCredentialProfiles: false,
      preferences: false,
    })

    expect(result.accounts).toEqual(local.accounts)
    expect(result.bookmarks).toEqual(local.bookmarks)
    expect(result.preferences).toEqual(local.preferences)
    expect(result.tagStore).toEqual(createDefaultTagStore())
    expect(result.apiCredentialProfiles).toEqual(local.apiCredentialProfiles)
    expect(result.channelConfigs).toEqual({
      2: { ...mkChannelConfig(2, 30), label: "local-channel" },
    })
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
    expect(mockDownloadBackup).toHaveBeenCalledWith(undefined, {
      prepareForWrite: true,
    })

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
})

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
    mockImportPreferences.mockResolvedValue(true)
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

  it("schedules and flushes best-effort uploads through the dedicated alarm", async () => {
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

    mockClearAlarm.mockClear()
    mockGetAlarm.mockResolvedValueOnce(undefined)
    await service.flushPendingBestEffortUpload()
    expect(mockClearAlarm).not.toHaveBeenCalled()
    expect(uploadSpy).not.toHaveBeenCalled()

    mockGetAlarm.mockResolvedValueOnce({
      name: "webdavAutoSyncBestEffortUpload",
    })
    await service.flushPendingBestEffortUpload()
    expect(mockClearAlarm).toHaveBeenCalledWith(
      "webdavAutoSyncBestEffortUpload",
    )
    expect(uploadSpy).toHaveBeenCalledTimes(1)
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

describe("WebdavAutoSyncService local apply phase", () => {
  const createService = () => new (webdavAutoSyncService as any).constructor()

  beforeEach(() => {
    vi.clearAllMocks()

    mockTestConnection.mockResolvedValue(true)
    mockUploadBackup.mockResolvedValue(true)

    mockChannelConfigImport.mockResolvedValue(undefined)
    mockApiCredentialProfilesImport.mockResolvedValue(undefined)
    mockTagStoreImport.mockResolvedValue(undefined)
    mockImportPreferences.mockResolvedValue(true)

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
    mockChannelConfigExport.mockResolvedValue({ 1: { enabled: true } })
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
        version: "2.0",
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
        channelConfigs: { 2: { enabled: false } },
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
      return true
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
      "channel",
      "api",
    ])
  })

  it("rolls back earlier writes when a later local import fails", async () => {
    const service = createService()

    mockAccountStorageImportData.mockResolvedValue({ migratedCount: 0 })
    mockTagStoreImport.mockResolvedValue(undefined)
    mockImportPreferences.mockResolvedValue(true)
    mockChannelConfigImport.mockRejectedValueOnce(new Error("channel failed"))

    await expect(service.syncWithWebdav()).rejects.toThrow("channel failed")

    expect(mockAccountStorageImportData).toHaveBeenNthCalledWith(1, {
      accounts: [{ id: "remote-account", created_at: 3, updated_at: 30 }],
      pinnedAccountIds: ["remote-account"],
      orderedAccountIds: ["remote-account", "remote-bookmark"],
      bookmarks: [{ id: "remote-bookmark", created_at: 4, updated_at: 40 }],
    })
    expect(mockTagStoreImport).toHaveBeenCalledTimes(2)
    expect(mockImportPreferences).toHaveBeenCalledTimes(2)
    expect(mockAccountStorageImportData).toHaveBeenNthCalledWith(2, {
      accounts: [{ id: "local-account", created_at: 1, updated_at: 10 }],
      bookmarks: [{ id: "local-bookmark", created_at: 2, updated_at: 20 }],
      pinnedAccountIds: ["local-account"],
      orderedAccountIds: ["local-account", "local-bookmark"],
    })
    expect(mockApiCredentialProfilesImport).not.toHaveBeenCalled()
    expect(mockUploadBackup).not.toHaveBeenCalled()
  })

  it("rolls back channel configs when api credential profile import fails", async () => {
    const service = createService()

    mockAccountStorageImportData.mockResolvedValue({ migratedCount: 0 })
    mockTagStoreImport.mockResolvedValue(undefined)
    mockImportPreferences.mockResolvedValue(true)
    mockChannelConfigImport.mockResolvedValue(undefined)
    mockApiCredentialProfilesImport.mockRejectedValueOnce(
      new Error("profile import failed"),
    )

    await expect(service.syncWithWebdav()).rejects.toThrow(
      "profile import failed",
    )

    expect(mockChannelConfigImport).toHaveBeenNthCalledWith(1, {
      2: { enabled: false },
    })
    expect(mockChannelConfigImport).toHaveBeenNthCalledWith(2, {
      1: { enabled: true },
    })
    expect(mockImportPreferences).toHaveBeenCalledTimes(2)
    expect(mockUploadBackup).not.toHaveBeenCalled()
  })

  it("throws when importing synced preferences fails and rolls account metadata back to empty defaults", async () => {
    const service = createService()
    mockImportPreferences.mockResolvedValue(false)

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
