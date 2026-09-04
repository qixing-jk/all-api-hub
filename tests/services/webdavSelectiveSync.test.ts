import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { Storage } from "@plasmohq/storage"

import { BACKUP_VERSION } from "~/constants/importExport"
import { accountDataTransfer } from "~/services/accounts/accountStorage/accountDataTransfer"
import { USER_PREFERENCES_STORAGE_KEYS } from "~/services/core/storageKeys"
import {
  createEmptyFeatureGuidanceState,
  PRODUCT_TOUR_OUTCOMES,
} from "~/services/featureGuidance/featureGuidanceState"
import { readBackupFeatureGuidance } from "~/services/importExport/importExportService"
import { ensureLegacyChannelConfigMigrationReady } from "~/services/managedSites/legacyChannelConfigMigration"
import {
  DEFAULT_PREFERENCES,
  userPreferences,
} from "~/services/preferences/userPreferences"
import {
  buildWebdavImportPayloadBySelection,
  createWebdavImportPayloadBySelection,
  filterWebdavBackupPayloadBySelection,
  mergeWebdavBackupPayloadBySelection,
} from "~/services/webdav/webdavSelectiveSync"
import { DEFAULT_ACCOUNT_AUTO_REFRESH } from "~/types/accountAutoRefresh"
import { API_CREDENTIAL_PROFILES_CONFIG_VERSION } from "~/types/apiCredentialProfiles"
import { DEFAULT_WEBDAV_SETTINGS } from "~/types/webdav"

vi.mock("~/services/managedSites/legacyChannelConfigMigration", () => ({
  ensureLegacyChannelConfigMigrationReady: vi.fn().mockResolvedValue(undefined),
}))

const ensureLegacyChannelConfigMigrationReadyMock =
  ensureLegacyChannelConfigMigrationReady as unknown as ReturnType<typeof vi.fn>

describe("readBackupFeatureGuidance", () => {
  it("migrates released gateway progress but ignores the draft product tour preference", () => {
    const guidance = readBackupFeatureGuidance({
      version: BACKUP_VERSION,
      timestamp: 1,
      preferences: {
        gatewayGuidance: { onboardingCompletedAt: 123 },
        productTour: { completedVersion: 99, completedAt: 456 },
      },
    })

    expect(guidance?.gatewayGuidance.onboardingCompletedAt).toBe(123)
    expect(guidance?.productTour).toEqual({})
  })
})

describe("filterWebdavBackupPayloadBySelection", () => {
  const baseBackup: any = {
    version: "2.0",
    timestamp: 123,
    accounts: {
      accounts: [{ id: "a1" }, { id: "a2" }],
      bookmarks: [{ id: "b1" }],
      pinnedAccountIds: ["b1", "a2"],
      orderedAccountIds: ["b1", "a1", "a2"],
      deletedEntryRecords: {
        "a-deleted": {
          kind: "account",
          deletedAt: 200,
          entryUpdatedAt: 100,
        },
        "b-deleted": {
          kind: "bookmark",
          deletedAt: 210,
          entryUpdatedAt: 110,
        },
      },
      last_updated: 456,
    },
    tagStore: { version: 1, tagsById: {} },
    preferences: {
      lastUpdated: 1,
      sharedPreferencesLastUpdated: 1,
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
    },
    featureGuidance: {
      ...createEmptyFeatureGuidanceState(),
      productTour: {
        expanded: {
          handledVersion: 2,
          outcome: PRODUCT_TOUR_OUTCOMES.Completed,
          handledAt: 200,
        },
      },
    },
    channelConfigs: { 1: { enabled: true } },
    apiCredentialProfiles: { version: 1, profiles: [], lastUpdated: 0 },
  }

  it("omits unselected sections and filters accounts-only payload", () => {
    const payload = filterWebdavBackupPayloadBySelection({
      backup: baseBackup,
      selection: {
        accounts: true,
        bookmarks: false,
        apiCredentialProfiles: false,
        preferences: false,
      },
    })

    expect(payload.preferences).toBeUndefined()
    expect(payload.featureGuidance).toBeUndefined()
    expect(payload.apiCredentialProfiles).toBeUndefined()
    expect(payload.tagStore).toBeDefined()

    expect(payload.accounts).toBeDefined()
    expect((payload.accounts as any).accounts).toEqual([
      { id: "a1" },
      { id: "a2" },
    ])
    expect((payload.accounts as any).bookmarks).toBeUndefined()
    expect((payload.accounts as any).pinnedAccountIds).toEqual(["a2"])
    expect((payload.accounts as any).orderedAccountIds).toEqual(["a1", "a2"])
    expect((payload.accounts as any).deletedEntryRecords).toEqual({
      "a-deleted": {
        kind: "account",
        deletedAt: 200,
        entryUpdatedAt: 100,
      },
    })
  })

  it("omits unselected sections and filters bookmarks-only payload", () => {
    const payload = filterWebdavBackupPayloadBySelection({
      backup: baseBackup,
      selection: {
        accounts: false,
        bookmarks: true,
        apiCredentialProfiles: false,
        preferences: false,
      },
    })

    expect(payload.preferences).toBeUndefined()
    expect(payload.featureGuidance).toBeUndefined()
    expect(payload.apiCredentialProfiles).toBeUndefined()
    expect(payload.tagStore).toBeDefined()

    expect(payload.accounts).toBeDefined()
    expect((payload.accounts as any).accounts).toBeUndefined()
    expect((payload.accounts as any).bookmarks).toEqual([{ id: "b1" }])
    expect((payload.accounts as any).pinnedAccountIds).toEqual(["b1"])
    expect((payload.accounts as any).orderedAccountIds).toEqual(["b1"])
    expect((payload.accounts as any).deletedEntryRecords).toEqual({
      "b-deleted": {
        kind: "bookmark",
        deletedAt: 210,
        entryUpdatedAt: 110,
      },
    })
  })

  it("omits taggable sections when only preferences are selected", () => {
    const payload = filterWebdavBackupPayloadBySelection({
      backup: baseBackup,
      selection: {
        accounts: false,
        bookmarks: false,
        apiCredentialProfiles: false,
        preferences: true,
      },
    })

    expect(payload.accounts).toBeUndefined()
    expect(payload.tagStore).toBeUndefined()
    expect(payload.apiCredentialProfiles).toBeUndefined()
    expect(payload.preferences).toEqual({
      lastUpdated: 1,
      sharedPreferencesLastUpdated: 1,
      themeMode: "dark",
    })
    expect(payload.featureGuidance).toEqual(baseBackup.featureGuidance)
    expect(payload.channelConfigs).toEqual(baseBackup.channelConfigs)
  })
})

describe("mergeWebdavBackupPayloadBySelection", () => {
  it("monotonically merges guidance when preferences are selected", () => {
    const localGuidance = {
      ...createEmptyFeatureGuidanceState(),
      productTour: {
        expanded: {
          handledVersion: 1,
          outcome: PRODUCT_TOUR_OUTCOMES.Completed,
          handledAt: 100,
        },
      },
    }
    const remoteGuidance = {
      ...createEmptyFeatureGuidanceState(),
      productTour: {
        expanded: {
          handledVersion: 2,
          outcome: PRODUCT_TOUR_OUTCOMES.Dismissed,
          handledAt: 200,
        },
      },
    }
    const payload = mergeWebdavBackupPayloadBySelection({
      backup: {
        version: BACKUP_VERSION,
        timestamp: 2,
        accounts: {
          accounts: [],
          bookmarks: [],
          pinnedAccountIds: [],
          orderedAccountIds: [],
          last_updated: 2,
        },
        preferences: DEFAULT_PREFERENCES,
        featureGuidance: localGuidance,
        channelConfigs: { schemaVersion: 1, configs: {} },
      },
      selection: {
        accounts: false,
        bookmarks: false,
        apiCredentialProfiles: false,
        preferences: true,
      },
      remoteBackup: {
        version: BACKUP_VERSION,
        timestamp: 1,
        preferences: DEFAULT_PREFERENCES,
        featureGuidance: remoteGuidance,
      },
    })

    expect((payload.featureGuidance as any).productTour.expanded).toEqual(
      remoteGuidance.productTour.expanded,
    )
  })

  it("preserves remote guidance when preferences are not selected", () => {
    const remoteGuidance = {
      ...createEmptyFeatureGuidanceState(),
      gatewayGuidance: {
        onboardingCompletedAt: 123,
        dismissedAtBySurface: {},
      },
    }
    const payload = mergeWebdavBackupPayloadBySelection({
      backup: {
        version: BACKUP_VERSION,
        timestamp: 2,
        accounts: {
          accounts: [],
          bookmarks: [],
          pinnedAccountIds: [],
          orderedAccountIds: [],
          last_updated: 2,
        },
        preferences: DEFAULT_PREFERENCES,
        featureGuidance: createEmptyFeatureGuidanceState(),
        channelConfigs: { schemaVersion: 1, configs: {} },
      },
      selection: {
        accounts: true,
        bookmarks: false,
        apiCredentialProfiles: false,
        preferences: false,
      },
      remoteBackup: {
        version: BACKUP_VERSION,
        timestamp: 1,
        preferences: DEFAULT_PREFERENCES,
        featureGuidance: remoteGuidance,
      },
    })

    expect(payload.featureGuidance).toEqual(remoteGuidance)
  })

  it("rejects future nested profile configs before replacing the remote backup", () => {
    expect(() =>
      mergeWebdavBackupPayloadBySelection({
        backup: {
          version: BACKUP_VERSION,
          timestamp: 2,
          accounts: { accounts: [], bookmarks: [], last_updated: 2 },
          preferences: DEFAULT_PREFERENCES,
          channelConfigs: { schemaVersion: 1, configs: {} },
          apiCredentialProfiles: {
            version: API_CREDENTIAL_PROFILES_CONFIG_VERSION,
            profiles: [],
            links: [],
            linkTombstones: [],
            lastUpdated: 2,
          },
        } as any,
        selection: {
          accounts: false,
          bookmarks: false,
          apiCredentialProfiles: true,
          preferences: false,
        },
        remoteBackup: {
          version: BACKUP_VERSION,
          timestamp: 1,
          apiCredentialProfiles: {
            version: 999,
            profiles: [],
            futureField: { preserve: true },
          },
        } as any,
      }),
    ).toThrow("Unsupported API credential profiles config version")
  })

  it("omits unselected domains when no remote backup exists", () => {
    const backup: any = {
      version: "2.0",
      timestamp: 456,
      accounts: {
        accounts: [{ id: "local-account" }],
        bookmarks: [{ id: "local-bookmark" }],
        pinnedAccountIds: ["local-account", "local-bookmark"],
        orderedAccountIds: ["local-account", "local-bookmark"],
        last_updated: 456,
      },
      tagStore: { version: 1, tagsById: { local: { id: "local" } } },
      preferences: {
        lastUpdated: 456,
        sharedPreferencesLastUpdated: 456,
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
      },
      channelConfigs: { 1: { enabled: true } },
      apiCredentialProfiles: {
        version: 1,
        profiles: [{ id: "local-profile" }],
        lastUpdated: 456,
      },
    }

    const payload = mergeWebdavBackupPayloadBySelection({
      backup,
      selection: {
        accounts: true,
        bookmarks: false,
        apiCredentialProfiles: false,
        preferences: false,
      },
      remoteBackup: undefined,
    })

    expect((payload.accounts as any).accounts).toEqual([
      { id: "local-account" },
    ])
    expect(payload.preferences).toBeUndefined()
    expect(payload.apiCredentialProfiles).toBeUndefined()
  })

  it("preserves remote accounts when only preferences are selected", () => {
    const backup: any = {
      version: "2.0",
      timestamp: 456,
      accounts: {
        accounts: [{ id: "local-account" }],
        bookmarks: [{ id: "local-bookmark" }],
        pinnedAccountIds: ["local-account", "local-bookmark"],
        orderedAccountIds: ["local-bookmark", "local-account"],
        last_updated: 456,
      },
      tagStore: { version: 1, tagsById: { local: { id: "local" } } },
      preferences: {
        lastUpdated: 456,
        sharedPreferencesLastUpdated: 456,
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
      },
      channelConfigs: { 1: { enabled: true } },
      apiCredentialProfiles: { version: 1, profiles: [], lastUpdated: 0 },
    }

    const remoteBackup: any = {
      version: "2.0",
      timestamp: 123,
      accounts: {
        accounts: [{ id: "remote-account" }],
        bookmarks: [{ id: "remote-bookmark" }],
        pinnedAccountIds: ["remote-bookmark"],
        orderedAccountIds: ["remote-bookmark", "remote-account"],
        last_updated: 123,
      },
      tagStore: { version: 1, tagsById: { remote: { id: "remote" } } },
      preferences: { lastUpdated: 123, themeMode: "light" },
      channelConfigs: { 1: { enabled: false } },
      apiCredentialProfiles: {
        version: 1,
        profiles: [{ id: "remote-profile" }],
        lastUpdated: 123,
      },
    }

    const payload = mergeWebdavBackupPayloadBySelection({
      backup,
      selection: {
        accounts: false,
        bookmarks: false,
        apiCredentialProfiles: false,
        preferences: true,
      },
      remoteBackup,
    })

    expect((payload.accounts as any).accounts).toEqual([
      { id: "remote-account" },
    ])
    expect((payload.accounts as any).bookmarks).toEqual([
      { id: "remote-bookmark" },
    ])
    expect((payload.accounts as any).pinnedAccountIds).toEqual([
      "remote-bookmark",
    ])
    expect((payload.accounts as any).orderedAccountIds).toEqual([
      "remote-bookmark",
      "remote-account",
    ])
    expect(payload.preferences).toEqual({
      lastUpdated: 456,
      sharedPreferencesLastUpdated: 456,
      themeMode: "dark",
    })
    expect(payload.tagStore).toEqual(remoteBackup.tagStore)
    expect(payload.apiCredentialProfiles).toEqual(
      remoteBackup.apiCredentialProfiles,
    )
  })

  it("preserves an unselected remote account after canonicalizing V6 check-in data", () => {
    const backup: any = {
      version: "4.0",
      timestamp: 456,
      accounts: { accounts: [], last_updated: 456 },
      preferences: { lastUpdated: 456 },
      channelConfigs: { schemaVersion: 1, configs: {} },
    }
    const remoteBackup: any = {
      version: "3.0",
      timestamp: 123,
      accounts: {
        accounts: [
          {
            id: "remote-account",
            site_type: "new-api",
            configVersion: 6,
            checkIn: {
              enableDetection: true,
              autoCheckInEnabled: true,
              siteStatus: { isCheckedInToday: false },
            },
          },
        ],
        last_updated: 123,
      },
      preferences: { lastUpdated: 123 },
      channelConfigs: { schemaVersion: 1, configs: {} },
    }

    const payload = mergeWebdavBackupPayloadBySelection({
      backup,
      selection: {
        accounts: false,
        bookmarks: false,
        apiCredentialProfiles: false,
        preferences: true,
      },
      remoteBackup,
    })

    expect(payload.version).toBe("4.0")
    expect((payload.accounts as any).accounts[0]).toMatchObject({
      id: "remote-account",
      configVersion: 7,
      checkIn: {
        automaticExecutionEnabled: true,
        selection: { methodId: "new-api:daily-checkin" },
      },
    })
    expect((payload.accounts as any).accounts[0]).not.toHaveProperty(
      "checkIn.enableDetection",
    )
  })

  it("preserves remote bookmarks and ordering metadata when only accounts are selected", () => {
    const backup: any = {
      version: "2.0",
      timestamp: 456,
      accounts: {
        accounts: [{ id: "local-account" }],
        bookmarks: [{ id: "local-bookmark" }],
        pinnedAccountIds: ["local-account"],
        orderedAccountIds: ["local-account"],
        deletedEntryRecords: {
          "local-deleted-account": {
            kind: "account",
            deletedAt: 456,
            entryUpdatedAt: 123,
          },
        },
        last_updated: 456,
      },
      tagStore: { version: 1, tagsById: {} },
      preferences: { lastUpdated: 456, themeMode: "dark" },
      channelConfigs: { 1: { enabled: true } },
    }

    const remoteBackup: any = {
      version: "2.0",
      timestamp: 123,
      accounts: {
        accounts: [{ id: "remote-account" }],
        bookmarks: [{ id: "remote-bookmark" }],
        pinnedAccountIds: ["remote-bookmark", "remote-account"],
        orderedAccountIds: ["remote-bookmark", "remote-account"],
        deletedEntryRecords: {
          "remote-deleted-bookmark": {
            kind: "bookmark",
            deletedAt: 123,
            entryUpdatedAt: 12,
          },
        },
        last_updated: 123,
      },
      tagStore: { version: 1, tagsById: {} },
      preferences: { lastUpdated: 123, themeMode: "light" },
      channelConfigs: { 1: { enabled: false } },
    }

    const payload = mergeWebdavBackupPayloadBySelection({
      backup,
      selection: {
        accounts: true,
        bookmarks: false,
        apiCredentialProfiles: false,
        preferences: false,
      },
      remoteBackup,
    })

    expect((payload.accounts as any).accounts).toEqual([
      { id: "local-account" },
    ])
    expect((payload.accounts as any).bookmarks).toEqual([
      { id: "remote-bookmark" },
    ])
    expect((payload.accounts as any).pinnedAccountIds).toEqual([
      "local-account",
      "remote-bookmark",
    ])
    expect((payload.accounts as any).orderedAccountIds).toEqual([
      "local-account",
      "remote-bookmark",
    ])
    expect((payload.accounts as any).deletedEntryRecords).toEqual({
      "remote-deleted-bookmark": {
        kind: "bookmark",
        deletedAt: 123,
        entryUpdatedAt: 12,
      },
      "local-deleted-account": {
        kind: "account",
        deletedAt: 456,
        entryUpdatedAt: 123,
      },
    })
  })

  it("does not upload local tombstones for unselected account domains", () => {
    const backup: any = {
      version: "2.0",
      timestamp: 456,
      accounts: {
        accounts: [{ id: "local-account" }],
        bookmarks: [{ id: "local-bookmark" }],
        pinnedAccountIds: ["local-bookmark"],
        orderedAccountIds: ["local-bookmark"],
        deletedEntryRecords: {
          "local-deleted-account": {
            kind: "account",
            deletedAt: 456,
            entryUpdatedAt: 123,
          },
          "local-deleted-bookmark": {
            kind: "bookmark",
            deletedAt: 455,
            entryUpdatedAt: 122,
          },
        },
        last_updated: 456,
      },
      tagStore: { version: 1, tagsById: {} },
      preferences: { lastUpdated: 456, themeMode: "dark" },
      channelConfigs: { 1: { enabled: true } },
    }

    const remoteBackup: any = {
      version: "2.0",
      timestamp: 123,
      accounts: {
        accounts: [{ id: "remote-account" }],
        bookmarks: [{ id: "remote-bookmark" }],
        pinnedAccountIds: ["remote-account"],
        orderedAccountIds: ["remote-account"],
        deletedEntryRecords: {
          "remote-deleted-account": {
            kind: "account",
            deletedAt: 123,
            entryUpdatedAt: 12,
          },
        },
        last_updated: 123,
      },
      tagStore: { version: 1, tagsById: {} },
      preferences: { lastUpdated: 123, themeMode: "light" },
      channelConfigs: { 1: { enabled: false } },
    }

    const payload = mergeWebdavBackupPayloadBySelection({
      backup,
      selection: {
        accounts: false,
        bookmarks: true,
        apiCredentialProfiles: false,
        preferences: false,
      },
      remoteBackup,
    })

    expect((payload.accounts as any).deletedEntryRecords).toEqual({
      "remote-deleted-account": {
        kind: "account",
        deletedAt: 123,
        entryUpdatedAt: 12,
      },
      "local-deleted-bookmark": {
        kind: "bookmark",
        deletedAt: 455,
        entryUpdatedAt: 122,
      },
    })
  })

  it("preserves legacy remote api credential profiles when they are unselected", () => {
    const backup: any = {
      version: "2.0",
      timestamp: 456,
      accounts: {
        accounts: [{ id: "local-account" }],
        bookmarks: [],
        pinnedAccountIds: ["local-account"],
        orderedAccountIds: ["local-account"],
        last_updated: 456,
      },
      tagStore: { version: 1, tagsById: {} },
      preferences: { lastUpdated: 456, themeMode: "dark" },
      channelConfigs: { 1: { enabled: true } },
      apiCredentialProfiles: { version: 1, profiles: [], lastUpdated: 0 },
    }

    const remoteBackup: any = {
      version: "1.0",
      timestamp: 123,
      data: {
        apiCredentialProfiles: {
          version: 1,
          profiles: [{ id: "legacy-remote-profile" }],
          lastUpdated: 123,
        },
      },
    }

    const payload = mergeWebdavBackupPayloadBySelection({
      backup,
      selection: {
        accounts: false,
        bookmarks: false,
        apiCredentialProfiles: false,
        preferences: true,
      },
      remoteBackup,
    })

    expect(payload.apiCredentialProfiles).toEqual(
      remoteBackup.data.apiCredentialProfiles,
    )
  })

  it("preserves remote api credential profiles when selected local backup omits them", () => {
    const backup: any = {
      version: "2.0",
      timestamp: 456,
      accounts: {
        accounts: [{ id: "local-account" }],
        bookmarks: [],
        pinnedAccountIds: ["local-account"],
        orderedAccountIds: ["local-account"],
        last_updated: 456,
      },
      tagStore: { version: 1, tagsById: {} },
      preferences: { lastUpdated: 456, themeMode: "dark" },
      channelConfigs: { 1: { enabled: true } },
    }

    const remoteBackup: any = {
      version: "2.0",
      timestamp: 123,
      apiCredentialProfiles: {
        version: 1,
        profiles: [{ id: "remote-profile" }],
        lastUpdated: 123,
      },
    }

    const payload = mergeWebdavBackupPayloadBySelection({
      backup,
      selection: {
        accounts: false,
        bookmarks: false,
        apiCredentialProfiles: true,
        preferences: false,
      },
      remoteBackup,
    })

    expect(payload.apiCredentialProfiles).toEqual(
      remoteBackup.apiCredentialProfiles,
    )
  })

  it("preserves legacy remote preferences when they are unselected", () => {
    const backup: any = {
      version: "2.0",
      timestamp: 456,
      accounts: {
        accounts: [{ id: "local-account" }],
        bookmarks: [],
        pinnedAccountIds: ["local-account"],
        orderedAccountIds: ["local-account"],
        last_updated: 456,
      },
      tagStore: { version: 1, tagsById: {} },
      preferences: { lastUpdated: 456, themeMode: "dark" },
      channelConfigs: { 1: { enabled: true } },
      apiCredentialProfiles: { version: 1, profiles: [], lastUpdated: 0 },
    }

    const remoteBackup: any = {
      version: "1.0",
      timestamp: 123,
      data: {
        preferences: {
          lastUpdated: 123,
          themeMode: "legacy-remote",
        },
      },
    }

    const payload = mergeWebdavBackupPayloadBySelection({
      backup,
      selection: {
        accounts: false,
        bookmarks: false,
        apiCredentialProfiles: false,
        preferences: false,
      },
      remoteBackup,
    })

    expect(payload.preferences).toEqual(remoteBackup.data.preferences)
  })

  it("preserves legacy remote tagStore when taggable sections are unselected", () => {
    const backup: any = {
      version: "2.0",
      timestamp: 456,
      accounts: {
        accounts: [{ id: "local-account" }],
        bookmarks: [],
        pinnedAccountIds: ["local-account"],
        orderedAccountIds: ["local-account"],
        last_updated: 456,
      },
      tagStore: { version: 1, tagsById: { local: { id: "local-tag" } } },
      preferences: { lastUpdated: 456, themeMode: "dark" },
      channelConfigs: { 1: { enabled: true } },
      apiCredentialProfiles: { version: 1, profiles: [], lastUpdated: 0 },
    }

    const remoteBackup: any = {
      version: "1.0",
      timestamp: 123,
      data: {
        tagStore: {
          version: 1,
          tagsById: { legacy: { id: "legacy-tag" } },
        },
      },
    }

    const payload = mergeWebdavBackupPayloadBySelection({
      backup,
      selection: {
        accounts: false,
        bookmarks: false,
        apiCredentialProfiles: false,
        preferences: true,
      },
      remoteBackup,
    })

    expect(payload.tagStore).toEqual(remoteBackup.data.tagStore)
  })

  it("preserves explicit null remote preferences when they are unselected", () => {
    const backup: any = {
      version: "2.0",
      timestamp: 456,
      accounts: {
        accounts: [{ id: "local-account" }],
        bookmarks: [],
        pinnedAccountIds: ["local-account"],
        orderedAccountIds: ["local-account"],
        last_updated: 456,
      },
      tagStore: { version: 1, tagsById: {} },
      preferences: { lastUpdated: 456, themeMode: "dark" },
      channelConfigs: { 1: { enabled: true } },
      apiCredentialProfiles: { version: 1, profiles: [], lastUpdated: 0 },
    }

    const remoteBackup: any = {
      version: "2.0",
      timestamp: 123,
      preferences: null,
    }

    const payload = mergeWebdavBackupPayloadBySelection({
      backup,
      selection: {
        accounts: false,
        bookmarks: false,
        apiCredentialProfiles: false,
        preferences: false,
      },
      remoteBackup,
    })

    expect(payload).toHaveProperty("preferences", null)
  })

  it("preserves explicit null remote tagStore when taggable sections are unselected", () => {
    const backup: any = {
      version: "2.0",
      timestamp: 456,
      accounts: {
        accounts: [{ id: "local-account" }],
        bookmarks: [],
        pinnedAccountIds: ["local-account"],
        orderedAccountIds: ["local-account"],
        last_updated: 456,
      },
      tagStore: { version: 1, tagsById: { local: { id: "local-tag" } } },
      preferences: { lastUpdated: 456, themeMode: "dark" },
      channelConfigs: { 1: { enabled: true } },
      apiCredentialProfiles: { version: 1, profiles: [], lastUpdated: 0 },
    }

    const remoteBackup: any = {
      version: "2.0",
      timestamp: 123,
      tagStore: null,
    }

    const payload = mergeWebdavBackupPayloadBySelection({
      backup,
      selection: {
        accounts: false,
        bookmarks: false,
        apiCredentialProfiles: false,
        preferences: true,
      },
      remoteBackup,
    })

    expect(payload).toHaveProperty("tagStore", null)
  })

  it("preserves remote accounts when only api credential profiles are selected", () => {
    const backup: any = {
      version: "2.0",
      timestamp: 456,
      accounts: {
        accounts: [{ id: "local-account" }],
        bookmarks: [{ id: "local-bookmark" }],
        pinnedAccountIds: ["local-account", "local-bookmark"],
        orderedAccountIds: ["local-bookmark", "local-account"],
        last_updated: 456,
      },
      tagStore: { version: 1, tagsById: { local: { id: "local-tag" } } },
      preferences: { lastUpdated: 456, themeMode: "dark" },
      channelConfigs: { 1: { enabled: true } },
      apiCredentialProfiles: {
        version: 1,
        profiles: [{ id: "local-profile" }],
        lastUpdated: 456,
      },
    }

    const remoteBackup: any = {
      version: "2.0",
      timestamp: 123,
      accounts: {
        accounts: [{ id: "remote-account" }],
        bookmarks: [{ id: "remote-bookmark" }],
        pinnedAccountIds: ["remote-account", "remote-bookmark"],
        orderedAccountIds: ["remote-bookmark", "remote-account"],
        last_updated: 123,
      },
      tagStore: { version: 1, tagsById: { remote: { id: "remote-tag" } } },
      preferences: { lastUpdated: 123, themeMode: "light" },
      channelConfigs: { 1: { enabled: false } },
      apiCredentialProfiles: {
        version: 1,
        profiles: [{ id: "remote-profile" }],
        lastUpdated: 123,
      },
    }

    const payload = mergeWebdavBackupPayloadBySelection({
      backup,
      selection: {
        accounts: false,
        bookmarks: false,
        apiCredentialProfiles: true,
        preferences: false,
      },
      remoteBackup,
    })

    expect((payload.accounts as any).accounts).toEqual([
      { id: "remote-account" },
    ])
    expect((payload.accounts as any).bookmarks).toEqual([
      { id: "remote-bookmark" },
    ])
    expect(payload.preferences).toEqual(remoteBackup.preferences)
    expect(payload.apiCredentialProfiles).toEqual(backup.apiCredentialProfiles)
    expect(payload.tagStore).toEqual(backup.tagStore)
  })
})

describe("createWebdavImportPayloadBySelection", () => {
  const baseLocalState: any = {
    accountsConfig: {
      accounts: [],
      bookmarks: [],
      pinnedAccountIds: [],
      orderedAccountIds: [],
      last_updated: 50,
    },
    tagStore: {
      version: 1,
      tagsById: {
        "local-vip": {
          id: "local-vip",
          name: "VIP",
          createdAt: 1,
          updatedAt: 1,
        },
      },
    },
    preferences: {
      lastUpdated: 10,
      sharedPreferencesLastUpdated: 10,
      themeMode: "dark",
      accountAutoRefresh: {
        ...DEFAULT_ACCOUNT_AUTO_REFRESH,
        interval: DEFAULT_ACCOUNT_AUTO_REFRESH.interval + 120,
      },
      webdav: {
        ...DEFAULT_WEBDAV_SETTINGS,
        syncData: {
          ...DEFAULT_WEBDAV_SETTINGS.syncData,
          accounts: false,
          bookmarks: false,
        },
      },
    },
    channelConfigs: {},
    apiCredentialProfiles: {
      version: 2,
      profiles: [
        {
          id: "local-profile",
          name: "Local",
          apiType: "openai",
          baseUrl: "https://local.example.com",
          apiKey: "local-key",
          tagIds: ["local-vip"],
          notes: "",
          createdAt: 1,
          updatedAt: 1,
        },
      ],
      lastUpdated: 10,
    },
  }

  it("rejects future nested profile configs before building an import payload", () => {
    expect(() =>
      createWebdavImportPayloadBySelection({
        rawBackup: {
          version: BACKUP_VERSION,
          timestamp: 200,
          apiCredentialProfiles: {
            version: 999,
            profiles: [],
            futureField: { preserve: true },
          },
        } as any,
        selection: {
          accounts: false,
          bookmarks: false,
          apiCredentialProfiles: true,
          preferences: false,
        },
        localState: baseLocalState,
      }),
    ).toThrow("Unsupported API credential profiles config version")
  })

  it("merges remote account tags with the local tag store during selective import", () => {
    const payload = createWebdavImportPayloadBySelection({
      rawBackup: {
        version: "2.0",
        timestamp: 200,
        accounts: {
          accounts: [
            {
              id: "remote-account",
              tagIds: ["remote-vip"],
              created_at: 1,
              updated_at: 2,
            },
          ],
          bookmarks: [],
          pinnedAccountIds: ["remote-account"],
          orderedAccountIds: ["remote-account"],
          last_updated: 200,
        },
        tagStore: {
          version: 1,
          tagsById: {
            "remote-vip": {
              id: "remote-vip",
              name: "VIP",
              createdAt: 2,
              updatedAt: 2,
            },
          },
        },
        channelConfigs: { schemaVersion: 1, configs: {} },
      } as any,
      selection: {
        accounts: true,
        bookmarks: false,
        apiCredentialProfiles: false,
        preferences: false,
      },
      localState: baseLocalState,
    })

    expect((payload.tagStore as any).tagsById).toEqual({
      "local-vip": expect.objectContaining({ id: "local-vip", name: "VIP" }),
    })
    expect((payload.accounts as any).accounts[0].tagIds).toEqual(["local-vip"])
    expect(payload.apiCredentialProfiles).toBeUndefined()
  })

  it("remaps imported API credential profiles onto the merged tag store", () => {
    const payload = createWebdavImportPayloadBySelection({
      rawBackup: {
        version: "2.0",
        timestamp: 200,
        tagStore: {
          version: 1,
          tagsById: {
            "remote-vip": {
              id: "remote-vip",
              name: "VIP",
              createdAt: 2,
              updatedAt: 2,
            },
          },
        },
        apiCredentialProfiles: {
          version: 2,
          profiles: [
            {
              id: "remote-profile",
              name: "Remote",
              apiType: "openai",
              baseUrl: "https://remote.example.com",
              apiKey: "remote-key",
              tagIds: ["remote-vip"],
              notes: "",
              createdAt: 2,
              updatedAt: 2,
            },
          ],
          lastUpdated: 20,
        },
        channelConfigs: { schemaVersion: 1, configs: {} },
      } as any,
      selection: {
        accounts: false,
        bookmarks: false,
        apiCredentialProfiles: true,
        preferences: false,
      },
      localState: baseLocalState,
    })

    expect((payload.tagStore as any).tagsById).toEqual({
      "local-vip": expect.objectContaining({ id: "local-vip", name: "VIP" }),
    })
    expect((payload.apiCredentialProfiles as any).profiles[0].tagIds).toEqual([
      "local-vip",
    ])
  })

  it("restores local-only preference fields during WebDAV preference import", () => {
    const payload = createWebdavImportPayloadBySelection({
      rawBackup: {
        version: "2.0",
        timestamp: 200,
        preferences: {
          lastUpdated: 200,
          themeMode: "light",
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
        channelConfigs: { schemaVersion: 1, configs: {} },
      } as any,
      selection: {
        accounts: false,
        bookmarks: false,
        apiCredentialProfiles: false,
        preferences: true,
      },
      localState: baseLocalState,
    })

    expect(payload.preferences).toMatchObject({
      lastUpdated: 200,
      sharedPreferencesLastUpdated: 200,
      themeMode: "light",
      accountAutoRefresh: baseLocalState.preferences.accountAutoRefresh,
      webdav: baseLocalState.preferences.webdav,
    })
  })

  it("always emits a canonical V4 payload even for legacy WebDAV backups", () => {
    const payload = createWebdavImportPayloadBySelection({
      rawBackup: {
        timestamp: 200,
        data: {
          apiCredentialProfiles: {
            version: 2,
            profiles: [
              {
                id: "remote-profile",
                name: "Remote",
                apiType: "openai",
                baseUrl: "https://remote.example.com",
                apiKey: "remote-key",
                tagIds: [],
                notes: "",
                createdAt: 2,
                updatedAt: 2,
              },
            ],
            lastUpdated: 20,
          },
        },
        channelConfigs: { schemaVersion: 1, configs: {} },
      } as any,
      selection: {
        accounts: false,
        bookmarks: false,
        apiCredentialProfiles: true,
        preferences: false,
      },
      localState: baseLocalState,
    })

    expect(payload.version).toBe("4.0")
    expect(payload.apiCredentialProfiles).toBeUndefined()
  })
})

describe("buildWebdavImportPayloadBySelection", () => {
  it("propagates migration deferral before reading local backup state", async () => {
    const exportAccounts = vi.spyOn(accountDataTransfer, "exportData")
    ensureLegacyChannelConfigMigrationReadyMock.mockRejectedValueOnce(
      new Error("migration deferred"),
    )

    await expect(
      buildWebdavImportPayloadBySelection({
        rawBackup: { version: "3.0", timestamp: 200 },
        selection: {
          accounts: true,
          bookmarks: true,
          apiCredentialProfiles: true,
          preferences: true,
        },
      }),
    ).rejects.toThrow("migration deferred")
    expect(exportAccounts).not.toHaveBeenCalled()
    exportAccounts.mockRestore()
  })
})

describe("WebDAV preference convergence", () => {
  const storage = new Storage({ area: "local" })

  beforeEach(async () => {
    await storage.remove(USER_PREFERENCES_STORAGE_KEYS.USER_PREFERENCES)
  })

  afterEach(async () => {
    await storage.remove(USER_PREFERENCES_STORAGE_KEYS.USER_PREFERENCES)
  })

  it("imports a legacy v26 preference selection as canonical v27 and re-exports it canonically", async () => {
    await storage.set(USER_PREFERENCES_STORAGE_KEYS.USER_PREFERENCES, {
      ...DEFAULT_PREFERENCES,
      lastUpdated: 100,
      sharedPreferencesLastUpdated: 100,
    })
    const imported = createWebdavImportPayloadBySelection({
      rawBackup: {
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
        channelConfigs: { schemaVersion: 1, configs: {} },
      } as any,
      selection: {
        accounts: false,
        bookmarks: false,
        apiCredentialProfiles: false,
        preferences: true,
      },
      localState: {
        accountsConfig: {
          accounts: [],
          bookmarks: [],
          pinnedAccountIds: [],
          orderedAccountIds: [],
          last_updated: 100,
        },
        tagStore: { version: 1, tagsById: {} },
        preferences: DEFAULT_PREFERENCES,
        channelConfigs: { schemaVersion: 1, configs: {} },
        apiCredentialProfiles: {
          version: 2,
          profiles: [],
          links: [],
          linkTombstones: [],
          lastUpdated: 0,
        },
      },
    })

    const result = await userPreferences.importPreferences(
      imported.preferences!,
      { preserveWebdav: true },
    )

    expect(result).toMatchObject({ ok: true })
    const storedAfterImport = (await storage.get(
      USER_PREFERENCES_STORAGE_KEYS.USER_PREFERENCES,
    )) as any
    expect(storedAfterImport.preferencesVersion).toBe(27)
    expect(storedAfterImport.tempWindowFallback).toMatchObject({
      automaticFeatureBypass: { account_refresh: false },
    })
    expect(storedAfterImport.tempWindowFallback).not.toHaveProperty(
      "useForAutoRefresh",
    )

    const nextUpload = filterWebdavBackupPayloadBySelection({
      backup: {
        version: "2.0",
        timestamp: 300,
        preferences: await userPreferences.exportPreferences(),
        channelConfigs: {},
      } as any,
      selection: {
        accounts: false,
        bookmarks: false,
        apiCredentialProfiles: false,
        preferences: true,
      },
    })

    expect((nextUpload.preferences as any).preferencesVersion).toBe(27)
    expect((nextUpload.preferences as any).tempWindowFallback).toMatchObject({
      automaticFeatureBypass: { account_refresh: false },
    })
    expect(
      (nextUpload.preferences as any).tempWindowFallback,
    ).not.toHaveProperty("useForAutoRefresh")
  })

  it("canonicalizes malformed current-version WebDAV preferences before the next upload", async () => {
    await storage.set(USER_PREFERENCES_STORAGE_KEYS.USER_PREFERENCES, {
      ...DEFAULT_PREFERENCES,
      lastUpdated: 100,
      sharedPreferencesLastUpdated: 100,
    })
    const storageSetSpy = vi.spyOn((userPreferences as any).storage, "set")
    storageSetSpy.mockClear()
    const imported = createWebdavImportPayloadBySelection({
      rawBackup: {
        version: "2.0",
        timestamp: 200,
        preferences: {
          ...DEFAULT_PREFERENCES,
          preferencesVersion: 27,
          lastUpdated: 200,
          sharedPreferencesLastUpdated: 200,
          tempWindowFallback: {
            enabled: false,
            automaticFeatureBypass: {
              account_refresh: false,
              balance_history: "invalid",
              checkin: true,
            },
            useForAutoRefresh: true,
            useInSidePanel: true,
            tempContextMode: "window",
          },
        },
        channelConfigs: {},
      } as any,
      selection: {
        accounts: false,
        bookmarks: false,
        apiCredentialProfiles: false,
        preferences: true,
      },
      localState: {
        accountsConfig: {
          accounts: [],
          bookmarks: [],
          pinnedAccountIds: [],
          orderedAccountIds: [],
          last_updated: 100,
        },
        tagStore: { version: 1, tagsById: {} },
        preferences: DEFAULT_PREFERENCES,
        channelConfigs: { schemaVersion: 1, configs: {} },
        apiCredentialProfiles: {
          version: 2,
          profiles: [],
          links: [],
          linkTombstones: [],
          lastUpdated: 0,
        },
      },
    })

    try {
      const result = await userPreferences.importPreferences(
        imported.preferences!,
        { preserveWebdav: true },
      )

      expect(result).toMatchObject({ ok: true })
      expect(storageSetSpy).toHaveBeenCalledTimes(1)
      const storedAfterImport = (await storage.get(
        USER_PREFERENCES_STORAGE_KEYS.USER_PREFERENCES,
      )) as any
      const nextUpload = filterWebdavBackupPayloadBySelection({
        backup: {
          version: "2.0",
          timestamp: 300,
          preferences: await userPreferences.exportPreferences(),
          channelConfigs: {},
        } as any,
        selection: {
          accounts: false,
          bookmarks: false,
          apiCredentialProfiles: false,
          preferences: true,
        },
      })

      expect(storageSetSpy).toHaveBeenCalledTimes(1)
      expect(storedAfterImport.tempWindowFallback).toEqual({
        enabled: false,
        automaticFeatureBypass: {
          account_refresh: false,
          balance_history: true,
          checkin: true,
          redemption_assist: true,
          ldoh_site_lookup: true,
          key_management: true,
          managed_site_channels: true,
          managed_site_model_sync: true,
        },
        tempContextMode: "window",
      })
      expect(nextUpload.preferences).toMatchObject({
        preferencesVersion: 27,
        tempWindowFallback: storedAfterImport.tempWindowFallback,
      })
      expect(
        (nextUpload.preferences as any).tempWindowFallback,
      ).not.toHaveProperty("useForAutoRefresh")
      expect(
        (nextUpload.preferences as any).tempWindowFallback,
      ).not.toHaveProperty("useInSidePanel")
    } finally {
      storageSetSpy.mockRestore()
    }
  })
})
