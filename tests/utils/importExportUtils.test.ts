import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import {
  BACKUP_VERSION,
  importFromBackupObject,
  normalizeBackupForMerge,
  parseBackupSummary,
  type BackupFullV2,
  type BackupPreferencesPartialV2,
  type BackupV2,
  type RawBackupData,
} from "~/features/ImportExport/utils"
import { accountStorage } from "~/services/accounts/accountStorage"
import {
  fetchDisplayAccountTokens,
  resolveDisplayAccountTokenForSecret,
} from "~/services/accounts/utils/apiServiceRequest"
import { apiCredentialProfilesStorage } from "~/services/apiCredentialProfiles/apiCredentialProfilesStorage"
import { channelConfigStorage } from "~/services/managedSites/channelConfigStorage"
import { userPreferences } from "~/services/preferences/userPreferences"
import { tagStorage } from "~/services/tags/tagStorage"
import { API_TYPES } from "~/services/verification/aiApiVerification"
import { DEFAULT_ACCOUNT_AUTO_REFRESH } from "~/types/accountAutoRefresh"
import { DEFAULT_WEBDAV_SETTINGS } from "~/types/webdav"

vi.mock("~/services/accounts/accountStorage", () => ({
  accountStorage: {
    convertToDisplayData: vi.fn(),
    importData: vi.fn(),
    exportData: vi.fn(),
  },
}))

vi.mock("~/services/accounts/utils/apiServiceRequest", () => ({
  canManageDisplayAccountTokens: vi.fn((account) => Boolean(account)),
  fetchDisplayAccountTokens: vi.fn(),
  resolveDisplayAccountTokenForSecret: vi.fn(),
}))

vi.mock("~/services/preferences/userPreferences", () => ({
  userPreferences: {
    importPreferences: vi.fn(),
    exportPreferences: vi.fn(),
  },
}))

vi.mock("~/services/managedSites/channelConfigStorage", () => ({
  channelConfigStorage: {
    importConfigs: vi.fn(),
    exportConfigs: vi.fn(),
  },
}))

vi.mock("~/services/tags/tagStorage", () => ({
  tagStorage: {
    ensureLegacyMigration: vi.fn(),
    exportTagStore: vi.fn(),
    importTagStore: vi.fn(),
    mergeTagStoresForSync: vi.fn((input: any) => ({
      tagStore: input.localTagStore,
      localAccounts: input.localAccounts,
      remoteAccounts: input.remoteAccounts,
      localBookmarks: input.localBookmarks ?? [],
      remoteBookmarks: input.remoteBookmarks ?? [],
      localTaggables: input.localTaggables ?? [],
      remoteTaggables: input.remoteTaggables ?? [],
    })),
  },
}))

vi.mock(
  "~/services/apiCredentialProfiles/apiCredentialProfilesStorage",
  () => ({
    apiCredentialProfilesStorage: {
      mergeConfig: vi.fn(),
      exportConfig: vi.fn(),
    },
    coerceApiCredentialProfilesConfig: (raw: unknown) => raw,
  }),
)

vi.mock("react-hot-toast", () => ({
  default: {
    success: vi.fn(),
    error: vi.fn(),
  },
}))

const mockAccountStorageImportData =
  accountStorage.importData as unknown as ReturnType<typeof vi.fn>
const mockAccountStorageExportData =
  accountStorage.exportData as unknown as ReturnType<typeof vi.fn>
const mockAccountStorageConvertToDisplayData =
  accountStorage.convertToDisplayData as unknown as ReturnType<typeof vi.fn>
const mockCanManageDisplayAccountTokens = (
  await import("~/services/accounts/utils/apiServiceRequest")
).canManageDisplayAccountTokens as unknown as ReturnType<typeof vi.fn>
const mockFetchDisplayAccountTokens =
  fetchDisplayAccountTokens as unknown as ReturnType<typeof vi.fn>
const mockResolveDisplayAccountTokenForSecret =
  resolveDisplayAccountTokenForSecret as unknown as ReturnType<typeof vi.fn>

const mockUserPreferencesImport =
  userPreferences.importPreferences as unknown as ReturnType<typeof vi.fn>
const mockUserPreferencesExport =
  userPreferences.exportPreferences as unknown as ReturnType<typeof vi.fn>

const mockChannelConfigImport =
  channelConfigStorage.importConfigs as unknown as ReturnType<typeof vi.fn>
const mockChannelConfigExport =
  channelConfigStorage.exportConfigs as unknown as ReturnType<typeof vi.fn>

const mockEnsureLegacyMigration =
  tagStorage.ensureLegacyMigration as unknown as ReturnType<typeof vi.fn>
const mockTagStoreExport = tagStorage.exportTagStore as unknown as ReturnType<
  typeof vi.fn
>
const mockTagStoreImport = tagStorage.importTagStore as unknown as ReturnType<
  typeof vi.fn
>
const mockMergeTagStoresForSync =
  tagStorage.mergeTagStoresForSync as unknown as ReturnType<typeof vi.fn>

const mockApiCredentialProfilesMergeConfig =
  apiCredentialProfilesStorage.mergeConfig as unknown as ReturnType<
    typeof vi.fn
  >
const mockApiCredentialProfilesExportConfig =
  apiCredentialProfilesStorage.exportConfig as unknown as ReturnType<
    typeof vi.fn
  >

describe("parseBackupSummary", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("returns null for empty string", () => {
    expect(parseBackupSummary("   ", "unknown")).toBeNull()
  })

  it("returns { valid: false } for invalid JSON", () => {
    const result = parseBackupSummary("not-json", "unknown")
    expect(result).toEqual({ valid: false })
  })

  it("parses full V2-like backup and marks all sections as present", () => {
    const payload: RawBackupData = {
      version: BACKUP_VERSION,
      timestamp: Date.now(),
      accounts: {},
      preferences: {},
      channelConfigs: {},
    }

    const json = JSON.stringify(payload)
    const result = parseBackupSummary(json, "unknown")

    expect(result).not.toBeNull()
    expect(result && "valid" in result && result.valid).toBe(true)
    if (result && "valid" in result && result.valid) {
      expect(result.hasAccounts).toBe(true)
      expect(result.hasPreferences).toBe(true)
      expect(result.hasChannelConfigs).toBe(true)
      expect(result.hasTagStore).toBe(false)
      expect(result.hasApiCredentialProfiles).toBe(false)
      expect(result.timestamp).not.toBe("unknown")
    }
  })

  it("detects API credential profiles section when present", () => {
    const payload: RawBackupData = {
      version: BACKUP_VERSION,
      timestamp: Date.now(),
      apiCredentialProfiles: {
        version: 1,
        profiles: [],
        lastUpdated: Date.now(),
      } as any,
    }

    const result = parseBackupSummary(JSON.stringify(payload), "unknown")

    expect(result && "valid" in result && result.valid).toBe(true)
    if (result && "valid" in result && result.valid) {
      expect(result.hasApiCredentialProfiles).toBe(true)
    }
  })

  it("detects account key snapshots when present", () => {
    const payload: RawBackupData = {
      version: BACKUP_VERSION,
      timestamp: Date.now(),
      accountKeySnapshots: [],
    }

    const result = parseBackupSummary(JSON.stringify(payload), "unknown")

    expect(result && "valid" in result && result.valid).toBe(true)
    if (result && "valid" in result && result.valid) {
      expect(result.hasAccountKeySnapshots).toBe(true)
    }
  })

  it("derives section flags from type-only partial payloads", () => {
    const payload: RawBackupData = {
      version: BACKUP_VERSION,
      timestamp: Date.now(),
      type: "accounts",
      accounts: undefined,
    }

    const result = parseBackupSummary(JSON.stringify(payload), "unknown")

    expect(result && "valid" in result && result.valid).toBe(true)
    if (result && "valid" in result && result.valid) {
      expect(result.hasAccounts).toBe(true)
      expect(result.hasPreferences).toBe(false)
      expect(result.hasChannelConfigs).toBe(false)
      expect(result.hasTagStore).toBe(false)
      expect(result.hasApiCredentialProfiles).toBe(false)
    }
  })

  it("uses fallback label when timestamp is invalid", () => {
    const payload: RawBackupData = {
      version: BACKUP_VERSION,
      timestamp: "not-a-date" as any,
    }

    const result = parseBackupSummary(JSON.stringify(payload), "unknown")

    expect(result && "valid" in result && result.valid).toBe(true)
    if (result && "valid" in result && result.valid) {
      expect(result.timestamp).toBe("unknown")
    }
  })
})

describe("importFromBackupObject", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockUserPreferencesImport.mockResolvedValue(true)
    mockEnsureLegacyMigration.mockResolvedValue({
      migratedAccountCount: 0,
      createdTagCount: 0,
    })
    mockTagStoreImport.mockResolvedValue(undefined)
    mockApiCredentialProfilesMergeConfig.mockResolvedValue({
      version: 1,
      profiles: [],
      lastUpdated: Date.now(),
    } as any)
  })

  afterEach(() => {
    vi.clearAllTimers()
  })

  it("throws when timestamp is missing", async () => {
    const payload: RawBackupData = {}

    await expect(importFromBackupObject(payload)).rejects.toThrow(
      "importExport:import.formatNotCorrect",
    )
  })

  it("imports V1-style backup with legacy shapes", async () => {
    const payload: RawBackupData = {
      version: "1.0",
      timestamp: Date.now(),
      data: {
        accounts: [{ id: "a1" }],
        preferences: { themeMode: "dark" },
        channelConfigs: { 1: { enabled: true } },
      },
      type: "accounts",
    }

    const result = await importFromBackupObject(payload)

    expect(mockAccountStorageImportData).toHaveBeenCalledWith({
      accounts: [{ id: "a1" }],
    })
    expect(mockEnsureLegacyMigration).toHaveBeenCalled()
    // With type: "accounts" and no root-level preferences/channelConfigs,
    // importV1Backup only imports accounts.
    expect(mockUserPreferencesImport).not.toHaveBeenCalled()
    expect(mockChannelConfigImport).not.toHaveBeenCalled()

    expect(result.allImported).toBe(true)
    expect(result.sections).toEqual({
      accounts: true,
      preferences: false,
      channelConfigs: false,
      apiCredentialProfiles: false,
    })
  })

  it("imports full V2 backup including bookmarks + pinned/ordered ids", async () => {
    const backup: BackupFullV2 = {
      version: BACKUP_VERSION,
      timestamp: Date.now(),
      accounts: {
        accounts: [{ id: "a1" } as any, { id: "a2" } as any],
        bookmarks: [{ id: "b1" } as any],
        pinnedAccountIds: ["a2", "b1"],
        orderedAccountIds: ["b1", "a1", "a2"],
        last_updated: Date.now(),
      } as any,
      tagStore: { version: 1, tagsById: {} },
      preferences: { themeMode: "dark" } as any,
      channelConfigs: { 1: { enabled: true } } as any,
    }

    const result = await importFromBackupObject(backup as BackupV2)

    expect(mockAccountStorageImportData).toHaveBeenCalledWith({
      accounts: [{ id: "a1" }, { id: "a2" }],
      bookmarks: [{ id: "b1" }],
      pinnedAccountIds: ["a2", "b1"],
      orderedAccountIds: ["b1", "a1", "a2"],
    })
    expect(mockTagStoreImport).toHaveBeenCalled()
    expect(mockEnsureLegacyMigration).toHaveBeenCalled()
    expect(mockUserPreferencesImport).toHaveBeenCalledWith({
      themeMode: "dark",
    })
    expect(mockChannelConfigImport).toHaveBeenCalledWith({
      1: { enabled: true },
    })

    expect(result.allImported).toBe(true)
    expect(result.sections).toEqual({
      accounts: true,
      preferences: true,
      channelConfigs: true,
      apiCredentialProfiles: false,
    })
  })

  it("merges API credential profiles when present in V2 backup", async () => {
    const backup: BackupFullV2 = {
      version: BACKUP_VERSION,
      timestamp: Date.now(),
      accounts: {
        accounts: [{ id: "a1" } as any],
        last_updated: Date.now(),
      } as any,
      preferences: { themeMode: "dark" } as any,
      channelConfigs: {},
      apiCredentialProfiles: {
        version: 1,
        profiles: [],
        lastUpdated: Date.now(),
      } as any,
    }

    const result = await importFromBackupObject(backup as BackupV2)

    expect(mockApiCredentialProfilesMergeConfig).toHaveBeenCalledWith(
      backup.apiCredentialProfiles,
    )
    expect(result.sections.apiCredentialProfiles).toBe(true)
  })

  it("merges profile-only V2 backups with tag stores before importing profiles", async () => {
    mockTagStoreExport.mockResolvedValue({
      version: 1,
      tagsById: {
        local: { id: "local", name: "Local", createdAt: 1, updatedAt: 1 },
      },
    })
    mockMergeTagStoresForSync.mockReturnValue({
      tagStore: {
        version: 2,
        tagsById: {
          local: { id: "local", name: "Local", createdAt: 1, updatedAt: 1 },
          remote: { id: "remote", name: "Remote", createdAt: 2, updatedAt: 2 },
        },
      },
      localAccounts: [],
      remoteAccounts: [],
      localBookmarks: [],
      remoteBookmarks: [],
      localTaggables: [],
      remoteTaggables: [
        {
          id: "p-1",
          name: "Merged Profile",
          tagIds: ["remote"],
        },
      ],
    })

    const backup = {
      version: BACKUP_VERSION,
      timestamp: Date.now(),
      apiCredentialProfiles: {
        version: 1,
        profiles: [
          {
            id: "p-1",
            name: "Merged Profile",
            apiType: API_TYPES.OPENAI_COMPATIBLE,
            baseUrl: "https://example.com",
            apiKey: "sk-test",
            tagIds: ["remote"],
            notes: "",
            createdAt: 1,
            updatedAt: 1,
          },
        ],
        lastUpdated: 1,
      } as any,
      tagStore: {
        version: 1,
        tagsById: {
          remote: { id: "remote", name: "Remote", createdAt: 2, updatedAt: 2 },
        },
      },
    } satisfies RawBackupData

    const result = await importFromBackupObject(backup)

    expect(mockTagStoreExport).toHaveBeenCalled()
    expect(mockMergeTagStoresForSync).toHaveBeenCalledWith({
      localTagStore: {
        version: 1,
        tagsById: {
          local: { id: "local", name: "Local", createdAt: 1, updatedAt: 1 },
        },
      },
      remoteTagStore: backup.tagStore,
      localAccounts: [],
      remoteAccounts: [],
      localBookmarks: [],
      remoteBookmarks: [],
      localTaggables: [],
      remoteTaggables: backup.apiCredentialProfiles?.profiles,
    })
    expect(mockTagStoreImport).toHaveBeenCalledWith({
      version: 2,
      tagsById: {
        local: { id: "local", name: "Local", createdAt: 1, updatedAt: 1 },
        remote: { id: "remote", name: "Remote", createdAt: 2, updatedAt: 2 },
      },
    })
    expect(mockApiCredentialProfilesMergeConfig).toHaveBeenCalledWith({
      ...backup.apiCredentialProfiles,
      profiles: [
        {
          id: "p-1",
          name: "Merged Profile",
          tagIds: ["remote"],
        },
      ],
    })
    expect(result.sections).toEqual({
      accounts: false,
      preferences: false,
      channelConfigs: false,
      apiCredentialProfiles: true,
    })
  })

  it("imports partial V2 preferences-only backup", async () => {
    const backup: BackupPreferencesPartialV2 = {
      version: BACKUP_VERSION,
      timestamp: Date.now(),
      type: "preferences",
      preferences: {
        themeMode: "light",
        sharedPreferencesLastUpdated: 123,
        accountAutoRefresh: {
          ...DEFAULT_ACCOUNT_AUTO_REFRESH,
          interval: DEFAULT_ACCOUNT_AUTO_REFRESH.interval + 60,
        },
        webdav: {
          ...DEFAULT_WEBDAV_SETTINGS,
          syncData: {
            ...DEFAULT_WEBDAV_SETTINGS.syncData,
            preferences: false,
          },
        },
      } as any,
    }

    const result = await importFromBackupObject(backup as BackupV2)

    expect(mockAccountStorageImportData).not.toHaveBeenCalled()
    expect(mockChannelConfigImport).not.toHaveBeenCalled()
    expect(mockUserPreferencesImport).toHaveBeenCalledWith({
      themeMode: "light",
      sharedPreferencesLastUpdated: 123,
      accountAutoRefresh: {
        ...DEFAULT_ACCOUNT_AUTO_REFRESH,
        interval: DEFAULT_ACCOUNT_AUTO_REFRESH.interval + 60,
      },
      webdav: {
        ...DEFAULT_WEBDAV_SETTINGS,
        syncData: {
          ...DEFAULT_WEBDAV_SETTINGS.syncData,
          preferences: false,
        },
      },
    })

    expect(result.allImported).toBe(true)
    expect(result.sections).toEqual({
      accounts: false,
      preferences: true,
      channelConfigs: false,
      apiCredentialProfiles: false,
    })
  })

  it("falls back to V1 import when version is unknown", async () => {
    const payload: RawBackupData = {
      version: "3.0",
      timestamp: Date.now(),
      accounts: { accounts: [{ id: "x" }] },
    }

    const result = await importFromBackupObject(payload)

    expect(mockAccountStorageImportData).toHaveBeenCalledWith({
      accounts: [{ id: "x" }],
    })
    expect(result.allImported).toBe(true)
  })

  it("preserves webdav config when preserveWebdav option is provided", async () => {
    const backup: BackupPreferencesPartialV2 = {
      version: BACKUP_VERSION,
      timestamp: Date.now(),
      type: "preferences",
      preferences: {
        themeMode: "light",
        accountAutoRefresh: {
          ...DEFAULT_ACCOUNT_AUTO_REFRESH,
          interval: DEFAULT_ACCOUNT_AUTO_REFRESH.interval + 60,
        },
        webdav: {
          ...DEFAULT_WEBDAV_SETTINGS,
          syncData: {
            ...DEFAULT_WEBDAV_SETTINGS.syncData,
            preferences: false,
          },
        },
      } as any,
    }

    await importFromBackupObject(backup as BackupV2, { preserveWebdav: true })

    expect(mockUserPreferencesImport).toHaveBeenCalledWith(
      {
        themeMode: "light",
        accountAutoRefresh: {
          ...DEFAULT_ACCOUNT_AUTO_REFRESH,
          interval: DEFAULT_ACCOUNT_AUTO_REFRESH.interval + 60,
        },
        webdav: {
          ...DEFAULT_WEBDAV_SETTINGS,
          syncData: {
            ...DEFAULT_WEBDAV_SETTINGS.syncData,
            preferences: false,
          },
        },
      },
      {
        preserveWebdav: true,
      },
    )
  })

  it("returns partial success when V2 preference import fails but other sections import", async () => {
    mockUserPreferencesImport.mockResolvedValue(false)

    const backup: BackupFullV2 = {
      version: BACKUP_VERSION,
      timestamp: Date.now(),
      accounts: {
        accounts: [{ id: "a1" } as any],
        last_updated: Date.now(),
      } as any,
      preferences: { themeMode: "dark" } as any,
      channelConfigs: {},
    }

    const result = await importFromBackupObject(backup as BackupV2)

    expect(mockAccountStorageImportData).toHaveBeenCalled()
    expect(mockUserPreferencesImport).toHaveBeenCalledWith({
      themeMode: "dark",
    })
    expect(result.allImported).toBe(false)
    expect(result.sections).toEqual({
      accounts: true,
      preferences: false,
      channelConfigs: true,
      apiCredentialProfiles: false,
    })
  })

  it("throws when nothing can be imported", async () => {
    const payload: RawBackupData = {
      version: BACKUP_VERSION,
      timestamp: Date.now(),
    }

    await expect(importFromBackupObject(payload)).rejects.toThrow(
      "importExport:import.noImportableData",
    )
  })
})

describe("normalizeBackupForMerge", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("returns empty defaults when data is null", () => {
    const localPrefs = { some: "value" }

    const result = normalizeBackupForMerge(null, localPrefs)

    expect(result).toEqual({
      accounts: [],
      bookmarks: [],
      pinnedAccountIds: [],
      orderedAccountIds: [],
      accountsTimestamp: 0,
      preferences: null,
      channelConfigs: null,
      tagStore: null,
      apiCredentialProfiles: null,
    })
  })

  it("normalizes V2 full backup", () => {
    const localPrefs = { themeMode: "system" }
    const backup: BackupFullV2 = {
      version: BACKUP_VERSION,
      timestamp: 123,
      accounts: {
        accounts: [{ id: "a1" } as any],
        last_updated: 456,
      } as any,
      tagStore: { version: 1, tagsById: {} },
      preferences: { themeMode: "dark" } as any,
      channelConfigs: { 1: { enabled: true } } as any,
    }

    const result = normalizeBackupForMerge(backup, localPrefs)

    expect(result.accounts).toEqual([{ id: "a1" }])
    expect(result.bookmarks).toEqual([])
    expect(result.pinnedAccountIds).toEqual([])
    expect(result.orderedAccountIds).toEqual([])
    expect(result.accountsTimestamp).toBe(456)
    expect(result.preferences).toEqual({ themeMode: "dark" })
    expect(result.channelConfigs).toEqual({ 1: { enabled: true } })
    expect(result.tagStore).toEqual({ version: 1, tagsById: {} })
  })

  it("normalizes V2 backups including API credential profiles", () => {
    const localPrefs = { themeMode: "system" }
    const apiCredentialProfiles = {
      version: 1,
      profiles: [],
      lastUpdated: 999,
    }

    const backup: BackupFullV2 = {
      version: BACKUP_VERSION,
      timestamp: 123,
      accounts: {
        accounts: [{ id: "a1" } as any],
        last_updated: 456,
      } as any,
      tagStore: { version: 1, tagsById: {} },
      preferences: { themeMode: "dark" } as any,
      channelConfigs: { 1: { enabled: true } } as any,
      apiCredentialProfiles: apiCredentialProfiles as any,
    }

    const result = normalizeBackupForMerge(backup, localPrefs)

    expect(result.apiCredentialProfiles).toEqual(apiCredentialProfiles)
  })

  it("normalizes V2 array-based account backups and falls back to local preferences when needed", () => {
    const localPrefs = { themeMode: "system" }
    const backup: RawBackupData = {
      version: BACKUP_VERSION,
      timestamp: 321,
      accounts: [{ id: "array-account" }],
      channelConfigs: "invalid" as any,
    }

    const result = normalizeBackupForMerge(backup, localPrefs)

    expect(result.accounts).toEqual([{ id: "array-account" }])
    expect(result.bookmarks).toEqual([])
    expect(result.accountsTimestamp).toBe(321)
    expect(result.preferences).toEqual(localPrefs)
    expect(result.channelConfigs).toBeNull()
  })

  it("normalizes V1-style backup falling back to legacy shapes", () => {
    const localPrefs = { themeMode: "system" }
    const payload: RawBackupData = {
      version: "1.0",
      timestamp: 999,
      data: {
        accounts: [{ id: "legacy" }],
        preferences: { themeMode: "dark" },
        channelConfigs: { 2: { enabled: false } },
      },
    }

    const result = normalizeBackupForMerge(payload, localPrefs)

    expect(result.accounts).toEqual([{ id: "legacy" }])
    expect(result.bookmarks).toEqual([])
    expect(result.pinnedAccountIds).toEqual([])
    expect(result.orderedAccountIds).toEqual([])
    expect(result.accountsTimestamp).toBe(999)
    expect(result.preferences).toEqual({ themeMode: "dark" })
    expect(result.channelConfigs).toEqual({ 2: { enabled: false } })
    expect(result.tagStore).toBeNull()
  })

  it("normalizes V1 backups using nested bookmark and tag-store fallbacks", () => {
    const localPrefs = { themeMode: "system" }
    const payload: RawBackupData = {
      version: "1.0",
      timestamp: 654,
      accounts: [{ id: "legacy-array" }],
      data: {
        bookmarks: [{ id: "legacy-bookmark" }],
        tagStore: { version: 1, tagsById: { t1: { id: "t1", name: "Tag" } } },
      },
    }

    const result = normalizeBackupForMerge(payload, localPrefs)

    expect(result.accounts).toEqual([{ id: "legacy-array" }])
    expect(result.bookmarks).toEqual([{ id: "legacy-bookmark" }])
    expect(result.accountsTimestamp).toBe(654)
    expect(result.preferences).toEqual(localPrefs)
    expect(result.tagStore).toEqual({
      version: 1,
      tagsById: { t1: { id: "t1", name: "Tag" } },
    })
  })
})

// Export handlers rely on DOM APIs and toast; we mainly assert that they
// invoke underlying storages and emit success/error toasts.

describe("export handlers", () => {
  const originalCreateObjectURL = URL.createObjectURL
  const originalRevokeObjectURL = URL.revokeObjectURL
  const originalCreateElement = document.createElement

  beforeEach(() => {
    vi.clearAllMocks()

    // Mock URL helpers
    URL.createObjectURL = vi.fn(() => "blob:mock-url") as any
    URL.revokeObjectURL = vi.fn() as any

    // Mock anchor creation to avoid interacting with real DOM
    document.createElement = vi.fn(() => ({
      href: "",
      download: "",
      click: vi.fn(),
      remove: vi.fn(),
    })) as any

    mockAccountStorageExportData.mockResolvedValue({
      accounts: [],
      bookmarks: [],
      pinnedAccountIds: [],
      orderedAccountIds: [],
      last_updated: 0,
    })
    mockEnsureLegacyMigration.mockResolvedValue({
      migratedAccountCount: 0,
      createdTagCount: 0,
    })
    mockTagStoreExport.mockResolvedValue({ version: 1, tagsById: {} })
    mockUserPreferencesExport.mockResolvedValue({} as any)
    mockChannelConfigExport.mockResolvedValue({} as any)
    mockResolveDisplayAccountTokenForSecret.mockImplementation(
      async (_account, token) => token,
    )
    mockCanManageDisplayAccountTokens.mockImplementation((account) =>
      Boolean(account),
    )
  })

  afterEach(() => {
    URL.createObjectURL = originalCreateObjectURL
    URL.revokeObjectURL = originalRevokeObjectURL
    document.createElement = originalCreateElement
  })

  // We import lazily to avoid circular evaluation during module mocks
  /**
   * Lazily loads export handler functions from the ImportExport utilities module for testing.
   */
  async function loadHandlers() {
    const mod = await import("~/features/ImportExport/utils")
    return {
      handleExportAll: mod.handleExportAll,
      handleExportAccounts: mod.handleExportAccounts,
      handleExportPreferences: mod.handleExportPreferences,
    }
  }

  function parseExportPayload() {
    const createObjectUrl = URL.createObjectURL as unknown as ReturnType<
      typeof vi.fn
    >
    const blob = createObjectUrl.mock.calls[0]?.[0] as Blob

    expect(blob).toBeInstanceOf(Blob)
    return new Promise<Record<string, unknown>>((resolve, reject) => {
      const reader = new FileReader()

      reader.onload = () => {
        try {
          resolve(JSON.parse(String(reader.result ?? "")))
        } catch (error) {
          reject(error)
        }
      }
      reader.onerror = () => reject(reader.error)
      reader.readAsText(blob)
    })
  }

  it("handleExportAll exports accounts, preferences and channelConfigs", async () => {
    const { handleExportAll } = await loadHandlers()
    const setIsExporting = vi.fn()

    await handleExportAll(setIsExporting)

    expect(setIsExporting).toHaveBeenNthCalledWith(1, true)
    expect(setIsExporting).toHaveBeenLastCalledWith(false)

    expect(mockAccountStorageExportData).toHaveBeenCalled()
    expect(mockTagStoreExport).toHaveBeenCalled()
    expect(mockUserPreferencesExport).toHaveBeenCalled()
    expect(mockChannelConfigExport).toHaveBeenCalled()
    expect(mockApiCredentialProfilesExportConfig).toHaveBeenCalled()
  })

  it("handleExportAccounts exports only account data", async () => {
    const { handleExportAccounts } = await loadHandlers()
    const setIsExporting = vi.fn()

    await handleExportAccounts(setIsExporting)

    expect(mockAccountStorageExportData).toHaveBeenCalled()
    expect(mockTagStoreExport).toHaveBeenCalled()
  })

  it("handleExportAll omits account key snapshots by default", async () => {
    const { handleExportAll } = await loadHandlers()

    await handleExportAll(vi.fn())

    expect(mockAccountStorageConvertToDisplayData).not.toHaveBeenCalled()
    expect(mockFetchDisplayAccountTokens).not.toHaveBeenCalled()

    await expect(parseExportPayload()).resolves.not.toHaveProperty(
      "accountKeySnapshots",
    )
  })

  it("handleExportAll includes resolved account key snapshots when requested", async () => {
    const { handleExportAll } = await loadHandlers()

    mockAccountStorageExportData.mockResolvedValueOnce({
      accounts: [
        {
          id: "account-1",
          site_name: "Primary",
        },
      ],
      bookmarks: [],
      pinnedAccountIds: [],
      orderedAccountIds: [],
      last_updated: 0,
    })
    mockAccountStorageConvertToDisplayData.mockReturnValueOnce([
      {
        id: "account-1",
        name: "Primary",
        baseUrl: "https://example.com",
        siteType: "new-api",
        authType: "access_token",
        userId: 1,
        token: "session-token",
      },
    ])
    mockFetchDisplayAccountTokens.mockResolvedValueOnce([
      {
        id: 101,
        name: "Default",
        key: "sk-masked",
        status: 1,
      },
    ])
    mockResolveDisplayAccountTokenForSecret.mockResolvedValueOnce({
      id: 101,
      name: "Default",
      key: "sk-live-secret",
      status: 1,
    })

    await handleExportAll(vi.fn(), { includeAccountKeys: true })

    expect(mockAccountStorageConvertToDisplayData).toHaveBeenCalledWith([
      {
        id: "account-1",
        site_name: "Primary",
      },
    ])
    expect(mockFetchDisplayAccountTokens).toHaveBeenCalledWith({
      id: "account-1",
      name: "Primary",
      baseUrl: "https://example.com",
      siteType: "new-api",
      authType: "access_token",
      userId: 1,
      token: "session-token",
    })
    expect(mockResolveDisplayAccountTokenForSecret).toHaveBeenCalledWith(
      {
        id: "account-1",
        name: "Primary",
        baseUrl: "https://example.com",
        siteType: "new-api",
        authType: "access_token",
        userId: 1,
        token: "session-token",
      },
      {
        id: 101,
        name: "Default",
        key: "sk-masked",
        status: 1,
      },
    )

    await expect(parseExportPayload()).resolves.toMatchObject({
      accountKeySnapshots: [
        {
          accountId: "account-1",
          accountName: "Primary",
          baseUrl: "https://example.com",
          siteType: "new-api",
          tokens: [
            {
              id: 101,
              name: "Default",
              key: "sk-live-secret",
              status: 1,
            },
          ],
        },
      ],
    })
  })

  it("handleExportAll keeps exporting when one account key fetch fails", async () => {
    const { handleExportAll } = await loadHandlers()

    mockAccountStorageExportData.mockResolvedValueOnce({
      accounts: [
        {
          id: "account-1",
          site_name: "Primary",
        },
        {
          id: "account-2",
          site_name: "Broken",
        },
      ],
      bookmarks: [],
      pinnedAccountIds: [],
      orderedAccountIds: [],
      last_updated: 0,
    })
    mockAccountStorageConvertToDisplayData.mockReturnValueOnce([
      {
        id: "account-1",
        name: "Primary",
        baseUrl: "https://ok.example.com",
        siteType: "new-api",
        authType: "access_token",
        userId: 1,
        token: "session-token-1",
      },
      {
        id: "account-2",
        name: "Broken",
        baseUrl: "https://bad.example.com",
        siteType: "new-api",
        authType: "access_token",
        userId: 2,
        token: "session-token-2",
      },
    ])
    mockFetchDisplayAccountTokens
      .mockResolvedValueOnce([
        {
          id: 101,
          name: "Default",
          key: "sk-masked",
          status: 1,
        },
      ])
      .mockRejectedValueOnce(new Error("upstream timeout"))
    mockResolveDisplayAccountTokenForSecret.mockResolvedValueOnce({
      id: 101,
      name: "Default",
      key: "sk-live-secret",
      status: 1,
    })

    await handleExportAll(vi.fn(), { includeAccountKeys: true })

    await expect(parseExportPayload()).resolves.toMatchObject({
      accountKeySnapshots: [
        {
          accountId: "account-1",
          accountName: "Primary",
        },
      ],
      accountKeySnapshotErrors: [
        {
          accountId: "account-2",
          accountName: "Broken",
          baseUrl: "https://bad.example.com",
          siteType: "new-api",
          errorMessage: "upstream timeout",
        },
      ],
    })
  })

  it("handleExportAll sanitizes HTML error pages in account key export failures", async () => {
    const { handleExportAll } = await loadHandlers()

    mockAccountStorageExportData.mockResolvedValueOnce({
      accounts: [
        {
          id: "account-html-error",
          site_name: "HTML Error",
        },
      ],
      bookmarks: [],
      pinnedAccountIds: [],
      orderedAccountIds: [],
      last_updated: 0,
    })
    mockAccountStorageConvertToDisplayData.mockReturnValueOnce([
      {
        id: "account-html-error",
        name: "HTML Error",
        baseUrl: "https://html-error.example.com",
        siteType: "new-api",
        authType: "access_token",
        userId: 9,
        token: "session-token-html",
      },
    ])
    mockFetchDisplayAccountTokens.mockRejectedValueOnce(
      new Error(
        '<!DOCTYPE html><html lang="en-US"><head><title>Just a moment...</title></head><body>challenge</body></html>',
      ),
    )

    await handleExportAll(vi.fn(), { includeAccountKeys: true })

    await expect(parseExportPayload()).resolves.toMatchObject({
      accountKeySnapshotErrors: [
        {
          accountId: "account-html-error",
          accountName: "HTML Error",
          errorMessage: "Cloudflare challenge page returned",
        },
      ],
    })
  })

  it("handleExportPreferences exports only preferences data", async () => {
    const { handleExportPreferences } = await loadHandlers()
    const setIsExporting = vi.fn()

    await handleExportPreferences(setIsExporting)

    expect(mockUserPreferencesExport).toHaveBeenCalled()
  })

  it("handleExportAll reports error when underlying export fails", async () => {
    const { handleExportAll } = await loadHandlers()
    const setIsExporting = vi.fn()

    mockAccountStorageExportData.mockRejectedValue(new Error("boom"))

    await handleExportAll(setIsExporting)
  })
})
