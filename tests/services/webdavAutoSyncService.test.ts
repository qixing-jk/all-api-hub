import { beforeEach, describe, expect, it, vi } from "vitest"

import { webdavAutoSyncService } from "~/services/webdav/webdavAutoSyncService"

// Basic getErrorMessage passthrough to avoid noisy output
vi.mock("~/utils/error", () => ({
  getErrorMessage: (e: unknown) => String(e),
}))

const mockHasAlarmsAPI = vi.fn()
const mockGetAlarm = vi.fn()
const mockCreateAlarm = vi.fn()
const mockClearAlarm = vi.fn()
const mockOnAlarm = vi.fn()

vi.mock(import("~/utils/browserApi"), async (importOriginal) => {
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

vi.mock(import("~/services/userPreferences"), async (importOriginal) => {
  const actual = await importOriginal()
  Object.assign(actual.userPreferences, {
    getPreferences: (...args: any[]) => mockGetPreferences(...args),
    savePreferences: (...args: any[]) => mockSavePreferences(...args),
  })
  return {
    ...actual,
    userPreferences: actual.userPreferences,
  }
})

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
    exportTagStore: vi.fn(),
    importTagStore: vi.fn(),
  },
}))

// Mock WebDAV network helpers so syncWithWebdav can be tested in isolation if needed
const mockTestConnection = vi.fn()
const mockDownloadBackup = vi.fn()
const mockUploadBackup = vi.fn()

vi.mock("~/services/webdav/webdavService", () => ({
  testWebdavConnection: (...args: any[]) => mockTestConnection(...args),
  downloadBackup: (...args: any[]) => mockDownloadBackup(...args),
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

describe("WebdavAutoSyncService.normalizeOrderedEntryIds", () => {
  const normalize = (input: any) =>
    (webdavAutoSyncService as any).constructor.normalizeOrderedEntryIds(input)

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

    const ordered = normalize({
      baseOrderedIds: ["b2", "b2", "missing", "a2"],
      entryIdSet,
      accounts,
      bookmarks,
    })

    expect(ordered).toEqual(["b2", "a2", "a1", "b1"])
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
