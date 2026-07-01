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
import { apiCredentialProfilesStorage } from "~/services/apiCredentialProfiles/apiCredentialProfilesStorage"
import { channelConfigStorage } from "~/services/managedSites/channelConfigStorage"
import { userPreferences } from "~/services/preferences/userPreferences"
import { tagStorage } from "~/services/tags/tagStorage"
import { API_TYPES } from "~/services/verification/aiApiVerification"
import { DEFAULT_ACCOUNT_AUTO_REFRESH } from "~/types/accountAutoRefresh"
import { DEFAULT_WEBDAV_SETTINGS } from "~/types/webdav"

vi.mock("~/services/accounts/accountStorage", () => ({
  accountStorage: {
    importData: vi.fn(),
    exportData: vi.fn(),
  },
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
      importConfig: vi.fn(),
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
const mockApiCredentialProfilesImportConfig =
  apiCredentialProfilesStorage.importConfig as unknown as ReturnType<
    typeof vi.fn
  >

const preferenceWriteSuccess = () => ({
  ok: true,
  preferences: {},
})

const preferenceWriteFailure = () => ({
  ok: false,
  reason: { type: "storage-error", error: new Error("import failed") },
})
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
    mockUserPreferencesImport.mockResolvedValue(preferenceWriteSuccess())
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

  it("merges V2 account backups without importing preferences when merge mode is selected", async () => {
    mockAccountStorageExportData.mockResolvedValue({
      accounts: [
        {
          id: "local-account",
          site_name: "Local Account",
          updated_at: 10,
        },
      ],
      bookmarks: [
        {
          id: "local-bookmark",
          name: "Local Bookmark",
          updated_at: 10,
        },
      ],
      pinnedAccountIds: ["local-account"],
      orderedAccountIds: ["local-account", "local-bookmark"],
      deletedEntryRecords: {},
      last_updated: 10,
    })
    mockTagStoreExport.mockResolvedValue({ version: 1, tagsById: {} })
    mockChannelConfigExport.mockResolvedValue({
      1: { channelId: 1, updatedAt: 10 },
    })
    mockMergeTagStoresForSync.mockReturnValue({
      tagStore: { version: 1, tagsById: {} },
      localAccounts: [
        {
          id: "local-account",
          site_name: "Local Account",
          updated_at: 10,
        },
      ],
      remoteAccounts: [
        {
          id: "remote-account",
          site_name: "Remote Account",
          updated_at: 20,
        },
      ],
      localBookmarks: [
        {
          id: "local-bookmark",
          name: "Local Bookmark",
          updated_at: 10,
        },
      ],
      remoteBookmarks: [
        {
          id: "remote-bookmark",
          name: "Remote Bookmark",
          updated_at: 20,
        },
      ],
      localTaggables: [],
      remoteTaggables: [],
    })

    const backup: BackupFullV2 = {
      version: BACKUP_VERSION,
      timestamp: Date.now(),
      accounts: {
        accounts: [
          {
            id: "remote-account",
            site_name: "Remote Account",
            updated_at: 20,
          } as any,
        ],
        bookmarks: [
          {
            id: "remote-bookmark",
            name: "Remote Bookmark",
            updated_at: 20,
          } as any,
        ],
        pinnedAccountIds: ["remote-account"],
        orderedAccountIds: ["remote-account", "remote-bookmark"],
        last_updated: 20,
      } as any,
      tagStore: { version: 1, tagsById: {} },
      preferences: { themeMode: "dark" } as any,
      channelConfigs: {
        2: { channelId: 2, updatedAt: 20 },
      } as any,
      apiCredentialProfiles: {
        version: 1,
        profiles: [],
        lastUpdated: 20,
      } as any,
    }

    const result = await importFromBackupObject(backup as BackupV2, {
      mode: "merge",
    })

    expect(mockAccountStorageImportData).toHaveBeenCalledWith({
      accounts: [
        expect.objectContaining({ id: "local-account" }),
        expect.objectContaining({ id: "remote-account" }),
      ],
      bookmarks: [
        expect.objectContaining({ id: "local-bookmark" }),
        expect.objectContaining({ id: "remote-bookmark" }),
      ],
      pinnedAccountIds: ["local-account", "remote-account"],
      orderedAccountIds: [
        "local-account",
        "local-bookmark",
        "remote-account",
        "remote-bookmark",
      ],
      deletedEntryRecords: {},
    })
    expect(mockTagStoreImport).toHaveBeenCalledWith({
      version: 1,
      tagsById: {},
    })
    expect(mockUserPreferencesImport).not.toHaveBeenCalled()
    expect(mockChannelConfigImport).toHaveBeenCalledWith({
      1: { channelId: 1, updatedAt: 10 },
      2: { channelId: 2, updatedAt: 20 },
    })
    expect(mockApiCredentialProfilesMergeConfig).toHaveBeenCalledWith(
      backup.apiCredentialProfiles,
    )
    expect(result).toEqual({
      allImported: false,
      sections: {
        accounts: true,
        preferences: false,
        channelConfigs: true,
        apiCredentialProfiles: true,
      },
    })
  })

  it("applies a section import plan with mixed merge, replace, and skip actions", async () => {
    mockAccountStorageExportData.mockResolvedValue({
      accounts: [
        {
          id: "local-account",
          site_name: "Local Account",
          updated_at: 10,
        },
      ],
      bookmarks: [],
      pinnedAccountIds: ["local-account"],
      orderedAccountIds: ["local-account"],
      deletedEntryRecords: {},
      last_updated: 10,
    })
    mockTagStoreExport.mockResolvedValue({ version: 1, tagsById: {} })
    mockMergeTagStoresForSync.mockReturnValue({
      tagStore: { version: 1, tagsById: {} },
      localAccounts: [
        {
          id: "local-account",
          site_name: "Local Account",
          updated_at: 10,
        },
      ],
      remoteAccounts: [
        {
          id: "remote-account",
          site_name: "Remote Account",
          updated_at: 20,
        },
      ],
      localBookmarks: [],
      remoteBookmarks: [],
      localTaggables: [],
      remoteTaggables: [{ id: "backup-profile" }],
    })

    const backup: BackupFullV2 = {
      version: BACKUP_VERSION,
      timestamp: Date.now(),
      accounts: {
        accounts: [
          {
            id: "remote-account",
            site_name: "Remote Account",
            updated_at: 20,
          } as any,
        ],
        pinnedAccountIds: ["remote-account"],
        orderedAccountIds: ["remote-account"],
        last_updated: 20,
      } as any,
      preferences: { themeMode: "dark" } as any,
      channelConfigs: {
        5: { channelId: 5, updatedAt: 20 },
      } as any,
      apiCredentialProfiles: {
        version: 1,
        profiles: [{ id: "backup-profile" }],
        lastUpdated: 20,
      } as any,
    }

    const result = await importFromBackupObject(backup as BackupV2, {
      plan: {
        accounts: "merge",
        preferences: "skip",
        channelConfigs: "replace",
        apiCredentialProfiles: "replace",
      },
    })

    expect(mockAccountStorageImportData).toHaveBeenCalledWith(
      expect.objectContaining({
        accounts: [
          expect.objectContaining({ id: "local-account" }),
          expect.objectContaining({ id: "remote-account" }),
        ],
        pinnedAccountIds: ["local-account", "remote-account"],
        orderedAccountIds: ["local-account", "remote-account"],
      }),
    )
    expect(mockUserPreferencesImport).not.toHaveBeenCalled()
    expect(mockChannelConfigExport).not.toHaveBeenCalled()
    expect(mockChannelConfigImport).toHaveBeenCalledWith(backup.channelConfigs)
    expect(mockApiCredentialProfilesMergeConfig).not.toHaveBeenCalled()
    expect(mockApiCredentialProfilesImportConfig).toHaveBeenCalledWith(
      backup.apiCredentialProfiles,
    )
    expect(result).toEqual({
      allImported: false,
      sections: {
        accounts: true,
        preferences: false,
        channelConfigs: true,
        apiCredentialProfiles: true,
      },
    })
  })

  it("remaps API credential profile tags when account merge reconciles the backup tag store", async () => {
    mockAccountStorageExportData.mockResolvedValue({
      accounts: [],
      bookmarks: [],
      pinnedAccountIds: [],
      orderedAccountIds: [],
      deletedEntryRecords: {},
      last_updated: 10,
    })
    mockTagStoreExport.mockResolvedValue({
      version: 1,
      tagsById: {
        local: { id: "local", name: "Shared", createdAt: 1, updatedAt: 1 },
      },
    })
    mockMergeTagStoresForSync.mockReturnValue({
      tagStore: {
        version: 2,
        tagsById: {
          local: { id: "local", name: "Shared", createdAt: 1, updatedAt: 2 },
        },
      },
      localAccounts: [],
      remoteAccounts: [],
      localBookmarks: [],
      remoteBookmarks: [],
      localTaggables: [],
      remoteTaggables: [
        {
          id: "backup-profile",
          tagIds: ["local"],
        },
      ],
    })

    const backup = {
      version: BACKUP_VERSION,
      timestamp: Date.now(),
      accounts: {
        accounts: [],
        last_updated: 20,
      } as any,
      tagStore: {
        version: 1,
        tagsById: {
          remote: { id: "remote", name: "Shared", createdAt: 2, updatedAt: 2 },
        },
      },
      apiCredentialProfiles: {
        version: 1,
        profiles: [
          {
            id: "backup-profile",
            tagIds: ["remote"],
          },
        ],
        lastUpdated: 20,
      } as any,
    } satisfies RawBackupData

    await importFromBackupObject(backup, {
      plan: {
        accounts: "merge",
        apiCredentialProfiles: "merge",
      },
    })

    expect(mockMergeTagStoresForSync).toHaveBeenCalledWith(
      expect.objectContaining({
        remoteTagStore: backup.tagStore,
        remoteTaggables: backup.apiCredentialProfiles?.profiles,
      }),
    )
    expect(mockTagStoreImport).toHaveBeenCalledWith({
      version: 2,
      tagsById: {
        local: { id: "local", name: "Shared", createdAt: 1, updatedAt: 2 },
      },
    })
    expect(mockApiCredentialProfilesMergeConfig).toHaveBeenCalledWith({
      ...backup.apiCredentialProfiles,
      profiles: [
        {
          id: "backup-profile",
          tagIds: ["local"],
        },
      ],
    })
  })

  it("applies planned preference replacement and reports a selected import", async () => {
    const backup = {
      version: BACKUP_VERSION,
      timestamp: Date.now(),
      preferences: { themeMode: "dark" } as any,
    } satisfies RawBackupData

    const result = await importFromBackupObject(backup, {
      plan: {
        preferences: "replace",
      },
      preserveWebdav: true,
    })

    expect(mockUserPreferencesImport).toHaveBeenCalledWith(
      { themeMode: "dark" },
      { preserveWebdav: true },
    )
    expect(result).toEqual({
      allImported: true,
      sections: {
        accounts: false,
        preferences: true,
        channelConfigs: false,
        apiCredentialProfiles: false,
      },
    })
  })

  it("reconciles profile-only tag stores before replacing API credential profiles", async () => {
    mockTagStoreExport.mockResolvedValue({
      version: 1,
      tagsById: {
        local: { id: "local", name: "Shared", createdAt: 1, updatedAt: 1 },
      },
    })
    mockMergeTagStoresForSync.mockReturnValue({
      tagStore: {
        version: 2,
        tagsById: {
          local: { id: "local", name: "Shared", createdAt: 1, updatedAt: 2 },
        },
      },
      localAccounts: [],
      remoteAccounts: [],
      localBookmarks: [],
      remoteBookmarks: [],
      localTaggables: [],
      remoteTaggables: [
        {
          id: "backup-profile",
          tagIds: ["local"],
        },
      ],
    })

    const backup = {
      version: BACKUP_VERSION,
      timestamp: Date.now(),
      tagStore: {
        version: 1,
        tagsById: {
          remote: { id: "remote", name: "Shared", createdAt: 2, updatedAt: 2 },
        },
      },
      apiCredentialProfiles: {
        version: 1,
        profiles: [
          {
            id: "backup-profile",
            tagIds: ["remote"],
          },
        ],
        lastUpdated: 20,
      } as any,
    } satisfies RawBackupData

    await importFromBackupObject(backup, {
      plan: {
        apiCredentialProfiles: "replace",
      },
    })

    expect(mockMergeTagStoresForSync).toHaveBeenCalledWith({
      localTagStore: {
        version: 1,
        tagsById: {
          local: { id: "local", name: "Shared", createdAt: 1, updatedAt: 1 },
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
        local: { id: "local", name: "Shared", createdAt: 1, updatedAt: 2 },
      },
    })
    expect(mockApiCredentialProfilesImportConfig).toHaveBeenCalledWith({
      ...backup.apiCredentialProfiles,
      profiles: [
        {
          id: "backup-profile",
          tagIds: ["local"],
        },
      ],
    })
  })

  it("applies replace accounts with merged channel configs and profile merge fallback", async () => {
    mockChannelConfigExport.mockResolvedValue({
      1: { channelId: 1, updatedAt: 10 },
      2: { channelId: 2, updatedAt: 30 },
    })

    const backup = {
      version: BACKUP_VERSION,
      timestamp: Date.now(),
      accounts: {
        accounts: [{ id: "backup-account" } as any],
        bookmarks: [{ id: "backup-bookmark" } as any],
        pinnedAccountIds: ["backup-account"],
        orderedAccountIds: ["backup-account", "backup-bookmark"],
        deletedEntryRecords: {
          removed: {
            kind: "account",
            deletedAt: 30,
            entryUpdatedAt: 20,
          },
        },
        last_updated: 20,
      } as any,
      channelConfigs: {
        2: { channelId: 2, updatedAt: 20 },
        3: { channelId: 3, updatedAt: 40 },
      } as any,
      apiCredentialProfiles: {
        version: 1,
        profiles: [{ id: "backup-profile" }],
        lastUpdated: 20,
      } as any,
    } satisfies RawBackupData

    const result = await importFromBackupObject(backup, {
      plan: {
        accounts: "replace",
        channelConfigs: "merge",
        apiCredentialProfiles: "merge",
      },
    })

    expect(mockAccountStorageImportData).toHaveBeenCalledWith({
      accounts: [{ id: "backup-account" }],
      bookmarks: [{ id: "backup-bookmark" }],
      pinnedAccountIds: ["backup-account"],
      orderedAccountIds: ["backup-account", "backup-bookmark"],
      deletedEntryRecords: backup.accounts.deletedEntryRecords,
    })
    expect(mockChannelConfigImport).toHaveBeenCalledWith({
      1: { channelId: 1, updatedAt: 10 },
      2: { channelId: 2, updatedAt: 30 },
      3: { channelId: 3, updatedAt: 40 },
    })
    expect(mockApiCredentialProfilesMergeConfig).toHaveBeenCalledWith(
      backup.apiCredentialProfiles,
    )
    expect(result).toEqual({
      allImported: true,
      sections: {
        accounts: true,
        preferences: false,
        channelConfigs: true,
        apiCredentialProfiles: true,
      },
    })
  })

  it("throws when a plan skips every section present in the backup", async () => {
    const backup: BackupFullV2 = {
      version: BACKUP_VERSION,
      timestamp: Date.now(),
      accounts: { accounts: [] } as any,
      preferences: { themeMode: "dark" } as any,
      channelConfigs: { 1: { channelId: 1 } } as any,
      apiCredentialProfiles: {
        version: 1,
        profiles: [],
        lastUpdated: 1,
      } as any,
    }

    await expect(
      importFromBackupObject(backup as BackupV2, {
        plan: {
          accounts: "skip",
          preferences: "skip",
          channelConfigs: "skip",
          apiCredentialProfiles: "skip",
        },
      }),
    ).rejects.toThrow("importExport:import.noImportableData")

    expect(mockAccountStorageImportData).not.toHaveBeenCalled()
    expect(mockUserPreferencesImport).not.toHaveBeenCalled()
    expect(mockChannelConfigImport).not.toHaveBeenCalled()
    expect(mockApiCredentialProfilesMergeConfig).not.toHaveBeenCalled()
    expect(mockApiCredentialProfilesImportConfig).not.toHaveBeenCalled()
  })

  it("imports legacy V2 account arrays without deletion marker metadata", async () => {
    const backup: RawBackupData = {
      version: BACKUP_VERSION,
      timestamp: Date.now(),
      accounts: [{ id: "legacy-a" } as any] as any,
    }

    const result = await importFromBackupObject(backup as BackupV2)

    expect(mockAccountStorageImportData).toHaveBeenCalledWith({
      accounts: [{ id: "legacy-a" }],
      bookmarks: [],
      pinnedAccountIds: [],
      orderedAccountIds: [],
      deletedEntryRecords: undefined,
    })
    expect(mockEnsureLegacyMigration).toHaveBeenCalled()
    expect(result.sections.accounts).toBe(true)
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

  it("respects section plan skips for legacy V1 backups", async () => {
    const payload: RawBackupData = {
      version: "1.0",
      timestamp: Date.now(),
      accounts: [{ id: "legacy-account" }],
      preferences: { themeMode: "dark" },
      channelConfigs: {
        1: { channelId: 1, updatedAt: 10 },
      },
    }

    const result = await importFromBackupObject(payload, {
      plan: {
        accounts: "replace",
        preferences: "skip",
        channelConfigs: "skip",
      },
    })

    expect(mockAccountStorageImportData).toHaveBeenCalledWith({
      accounts: [{ id: "legacy-account" }],
    })
    expect(mockUserPreferencesImport).not.toHaveBeenCalled()
    expect(mockChannelConfigImport).not.toHaveBeenCalled()
    expect(result).toEqual({
      allImported: false,
      sections: {
        accounts: true,
        preferences: false,
        channelConfigs: false,
        apiCredentialProfiles: false,
      },
    })
  })

  it("respects section plan skips for unknown-version fallback imports", async () => {
    const payload: RawBackupData = {
      version: "3.0",
      timestamp: Date.now(),
      accounts: { accounts: [{ id: "future-account" }] },
      preferences: { themeMode: "dark" },
      channelConfigs: {
        2: { channelId: 2, updatedAt: 20 },
      },
    }

    const result = await importFromBackupObject(payload, {
      plan: {
        accounts: "merge",
        preferences: "skip",
        channelConfigs: "skip",
      },
    })

    expect(mockAccountStorageImportData).toHaveBeenCalledWith({
      accounts: [{ id: "future-account" }],
    })
    expect(mockUserPreferencesImport).not.toHaveBeenCalled()
    expect(mockChannelConfigImport).not.toHaveBeenCalled()
    expect(result.allImported).toBe(false)
    expect(result.sections.preferences).toBe(false)
    expect(result.sections.channelConfigs).toBe(false)
  })

  it("throws when legacy preference import cannot be persisted", async () => {
    mockUserPreferencesImport.mockResolvedValue(preferenceWriteFailure())
    const payload: RawBackupData = {
      version: "3.0",
      timestamp: Date.now(),
      preferences: {
        themeMode: "dark",
      },
    }

    await expect(importFromBackupObject(payload)).rejects.toThrow(
      "importExport:import.importFailed",
    )
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
    mockUserPreferencesImport.mockResolvedValue(preferenceWriteFailure())

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
      deletedEntryRecords: {},
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
        bookmarks: [],
        pinnedAccountIds: [],
        orderedAccountIds: [],
        deletedEntryRecords: {
          deleted: {
            kind: "account",
            deletedAt: 200,
            entryUpdatedAt: 100,
          },
        },
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
    expect(result.deletedEntryRecords).toEqual({
      deleted: {
        kind: "account",
        deletedAt: 200,
        entryUpdatedAt: 100,
      },
    })
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
      accounts: {
        deletedEntryRecords: {
          deleted: {
            kind: "bookmark",
            deletedAt: 300,
            entryUpdatedAt: 200,
          },
        },
      } as any,
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
    expect(result.deletedEntryRecords).toEqual({
      deleted: {
        kind: "bookmark",
        deletedAt: 300,
        entryUpdatedAt: 200,
      },
    })
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
  const createElement = originalCreateElement as unknown as (
    tagName: string,
  ) => HTMLElement

  beforeEach(() => {
    vi.clearAllMocks()

    // Mock URL helpers
    URL.createObjectURL = vi.fn(() => "blob:mock-url") as any
    URL.revokeObjectURL = vi.fn() as any

    document.createElement = vi.fn((tagName: string) => {
      const element =
        tagName.toLowerCase() === "a"
          ? createElement.call(document, "a")
          : createElement.call(document, "div")
      if (tagName.toLowerCase() === "a") {
        vi.spyOn(element, "click").mockImplementation(() => {})
      }
      return element
    }) as any

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

    await expect(handleExportAll(setIsExporting)).rejects.toThrow("boom")
  })
})
