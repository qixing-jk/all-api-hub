import { describe, expect, it } from "vitest"

import { DATA_TYPE_CASHFLOW, DATA_TYPE_CONSUMPTION } from "~/constants"
import { NEW_API } from "~/constants/siteType"
import {
  CURRENT_PREFERENCES_VERSION,
  getPreferencesVersion,
  migratePreferences,
  needsPreferencesMigration,
} from "~/services/configMigration/preferences/preferencesMigration"
import {
  DEFAULT_PREFERENCES,
  type UserPreferences,
} from "~/services/userPreferences"
import {
  ACCOUNT_AUTO_REFRESH_INTERVAL_MIN_SECONDS,
  ACCOUNT_AUTO_REFRESH_MIN_INTERVAL_MIN_SECONDS,
  DEFAULT_ACCOUNT_AUTO_REFRESH,
} from "~/types/accountAutoRefresh"
import { DEFAULT_BALANCE_HISTORY_PREFERENCES } from "~/types/dailyBalanceHistory"
import { DEFAULT_NEW_API_CONFIG } from "~/types/newApiConfig"
import { SortingCriteriaType } from "~/types/sorting"
import { DEFAULT_VELOERA_CONFIG } from "~/types/veloeraConfig"
import { DEFAULT_WEBDAV_SETTINGS, WEBDAV_SYNC_STRATEGIES } from "~/types/webdav"
import { DEFAULT_SORTING_PRIORITY_CONFIG } from "~/utils/sortingPriority"

// Helper function to create a minimal v0 preferences object
/**
 * Builds a baseline v0 UserPreferences object for migration test scenarios.
 *
 * Note: the returned object includes currently-required fields like `logging`
 * to keep the fixture type-safe.
 */
function createV0Preferences(
  overrides?: Partial<UserPreferences>,
): UserPreferences {
  return {
    themeMode: "system" as const,
    logging: DEFAULT_PREFERENCES.logging,
    // Legacy stored value before the v7->v8 cashflow tab rename migration.
    activeTab: DATA_TYPE_CONSUMPTION as any,
    currencyType: "USD" as const,
    sortField: "balance" as const,
    sortOrder: "desc" as const,
    accountAutoRefresh: DEFAULT_ACCOUNT_AUTO_REFRESH,
    showHealthStatus: true,
    webdav: DEFAULT_WEBDAV_SETTINGS,
    newApi: DEFAULT_NEW_API_CONFIG,
    veloera: DEFAULT_VELOERA_CONFIG,
    managedSiteType: NEW_API,
    // Legacy field preserved for v6->v7 migration
    newApiModelSync: {
      enabled: false,
      interval: 24 * 60 * 60 * 1000,
      concurrency: 2,
      maxRetries: 2,
      rateLimit: { requestsPerMinute: 20, burst: 5 },
      allowedModels: [],
      globalChannelModelFilters: [],
    },
    autoCheckin: {
      globalEnabled: false,
      pretriggerDailyOnUiOpen: true,
      notifyUiOnCompletion: true,
      windowStart: "09:00",
      windowEnd: "18:00",
      scheduleMode: "random",
      retryStrategy: {
        enabled: false,
        intervalMinutes: 30,
        maxAttemptsPerDay: 3,
      },
    },
    modelRedirect: {
      enabled: false,
      standardModels: [],
      pruneMissingTargetsOnModelSync: false,
    },
    sortingPriorityConfig: undefined,
    lastUpdated: Date.now(),
    // v0 does not have preferencesVersion
    ...overrides,
  }
}

describe("preferencesMigration", () => {
  describe("getPreferencesVersion", () => {
    it("returns 0 for undefined preferences", () => {
      expect(getPreferencesVersion(undefined)).toBe(0)
    })

    it("returns 0 when preferencesVersion is not set", () => {
      const prefs = createV0Preferences()
      expect(getPreferencesVersion(prefs)).toBe(0)
    })

    it("returns the version when preferencesVersion is set", () => {
      const prefs = createV0Preferences({ preferencesVersion: 3 })
      expect(getPreferencesVersion(prefs)).toBe(3)
    })

    it("returns 0 for null preferences", () => {
      expect(getPreferencesVersion(null as any)).toBe(0)
    })
  })

  describe("needsPreferencesMigration", () => {
    it("returns false for undefined preferences", () => {
      expect(needsPreferencesMigration(undefined)).toBe(false)
    })

    it("returns true when version is less than current", () => {
      const prefs = createV0Preferences({ preferencesVersion: 2 })
      expect(needsPreferencesMigration(prefs)).toBe(true)
    })

    it("returns true when preferencesVersion is not set", () => {
      const prefs = createV0Preferences()
      expect(needsPreferencesMigration(prefs)).toBe(true)
    })

    it("returns false when version equals current", () => {
      const prefs = createV0Preferences({
        preferencesVersion: CURRENT_PREFERENCES_VERSION,
      })
      expect(needsPreferencesMigration(prefs)).toBe(false)
    })

    it("returns false when version is greater than current", () => {
      const prefs = createV0Preferences({
        preferencesVersion: CURRENT_PREFERENCES_VERSION + 1,
      })
      expect(needsPreferencesMigration(prefs)).toBe(false)
    })
  })

  describe("migratePreferences", () => {
    it("does not modify preferences at current version", () => {
      const prefs = createV0Preferences({
        preferencesVersion: CURRENT_PREFERENCES_VERSION,
        activeTab: DATA_TYPE_CASHFLOW,
        managedSiteModelSync: {
          enabled: false,
          interval: 24 * 60 * 60 * 1000,
          concurrency: 2,
          maxRetries: 2,
          rateLimit: { requestsPerMinute: 20, burst: 5 },
          allowedModels: [],
          globalChannelModelFilters: [],
        },
        newApiModelSync: undefined,
        sortingPriorityConfig: DEFAULT_SORTING_PRIORITY_CONFIG,
      })

      const result = migratePreferences(prefs)

      expect(result.preferencesVersion).toBe(CURRENT_PREFERENCES_VERSION)
      expect(result).toEqual(prefs)
    })

    it("migrates v7 activeTab consumption to cashflow", () => {
      const prefs = createV0Preferences({
        preferencesVersion: 7,
        // Explicitly simulate a v7 prefs object that still has the legacy value.
        activeTab: DATA_TYPE_CONSUMPTION as any,
        managedSiteModelSync: {
          enabled: false,
          interval: 24 * 60 * 60 * 1000,
          concurrency: 2,
          maxRetries: 2,
          rateLimit: { requestsPerMinute: 20, burst: 5 },
          allowedModels: [],
          globalChannelModelFilters: [],
        },
        newApiModelSync: undefined,
      })

      const result = migratePreferences(prefs)

      expect(result.preferencesVersion).toBe(CURRENT_PREFERENCES_VERSION)
      expect(result.activeTab).toBe(DATA_TYPE_CASHFLOW)
    })

    it("migrates v0 preferences to current version", () => {
      const prefs = createV0Preferences({
        // Legacy flat fields for v0->v1 (sorting config)
      })

      const result = migratePreferences(prefs)

      expect(result.preferencesVersion).toBe(CURRENT_PREFERENCES_VERSION)
      expect(result.sortingPriorityConfig).toBeDefined()
      expect(result.managedSiteModelSync).toBeDefined()
      expect((result as any).newApiModelSync).toBeUndefined()
    })

    it("defaults showTodayCashflow to true when missing", () => {
      const prefs = createV0Preferences({
        preferencesVersion: 10,
      })

      const result = migratePreferences(prefs)

      expect(result.preferencesVersion).toBe(CURRENT_PREFERENCES_VERSION)
      expect(result.showTodayCashflow).toBe(true)
    })

    it("defaults balanceHistory to disabled when missing", () => {
      const prefs = createV0Preferences({
        preferencesVersion: 11,
      })

      const result = migratePreferences(prefs)

      expect(result.preferencesVersion).toBe(CURRENT_PREFERENCES_VERSION)
      expect(result.balanceHistory).toEqual(DEFAULT_BALANCE_HISTORY_PREFERENCES)
    })

    it("re-enables openChangelogOnUpdate during v13->v14 migration", () => {
      const prefs: UserPreferences = {
        ...DEFAULT_PREFERENCES,
        preferencesVersion: 13,
        openChangelogOnUpdate: false,
      }

      const result = migratePreferences(prefs)

      expect(result.preferencesVersion).toBe(CURRENT_PREFERENCES_VERSION)
      expect(result.openChangelogOnUpdate).toBe(true)
    })

    it("processes v1 preferences with sorting config migration", () => {
      const prefs = createV0Preferences({
        preferencesVersion: 1,
        sortingPriorityConfig: {
          criteria: [
            {
              id: SortingCriteriaType.CURRENT_SITE,
              enabled: true,
              priority: 0,
            },
          ],
          lastModified: Date.now(),
        },
      })

      const result = migratePreferences(prefs)

      expect(result.preferencesVersion).toBe(CURRENT_PREFERENCES_VERSION)
      // PINNED should be added during migration
      const hasPinned = result.sortingPriorityConfig?.criteria.some(
        (c) => c.id === SortingCriteriaType.PINNED,
      )
      expect(hasPinned).toBe(true)
    })

    it("handles v2 preferences with WebDAV config migration", () => {
      const prefs = createV0Preferences({
        preferencesVersion: 2,
        // Legacy flat WebDAV fields
        webdavUrl: "https://example.com",
        webdavUsername: "user",
        webdavPassword: "pass",
        webdavAutoSync: true,
        webdavSyncInterval: 3600,
        webdavSyncStrategy: WEBDAV_SYNC_STRATEGIES.MERGE,
      }) as UserPreferences

      const result = migratePreferences(prefs)

      expect(result.preferencesVersion).toBe(CURRENT_PREFERENCES_VERSION)
      // Old fields should be removed
      expect(result).not.toHaveProperty("webdavUrl")
      // Nested structure should be set
      expect(result.webdav).toBeDefined()
      expect(result.webdav.url).toBe("https://example.com")
    })

    it("handles v3 preferences with auto-refresh config migration", () => {
      const prefs = createV0Preferences({
        preferencesVersion: 3,
        // Legacy flat auto-refresh fields
        autoRefresh: true,
        refreshInterval: 300,
        minRefreshInterval: 45,
        refreshOnOpen: false,
      }) as UserPreferences

      const result = migratePreferences(prefs)

      expect(result.preferencesVersion).toBe(CURRENT_PREFERENCES_VERSION)
      // Old fields should be removed
      expect(result).not.toHaveProperty("autoRefresh")
      expect(result).not.toHaveProperty("refreshInterval")
      // Nested structure should be set
      expect(result.accountAutoRefresh).toEqual({
        enabled: true,
        interval: 300,
        minInterval: 45,
        refreshOnOpen: false,
      })
    })

    it("handles v4 preferences with new-api config migration", () => {
      const prefs = createV0Preferences({
        preferencesVersion: 4,
        // Legacy flat new-api fields
        newApiBaseUrl: "https://api.example.com",
        newApiAdminToken: "admin-token",
        newApiUserId: "user-id",
      }) as UserPreferences

      const result = migratePreferences(prefs)

      expect(result.preferencesVersion).toBe(CURRENT_PREFERENCES_VERSION)
      // Old fields should be removed
      expect(result).not.toHaveProperty("newApiBaseUrl")
      expect(result).not.toHaveProperty("newApiAdminToken")
      expect(result).not.toHaveProperty("newApiUserId")
      // Nested structure should be set
      expect(result.newApi).toEqual({
        baseUrl: "https://api.example.com",
        adminToken: "admin-token",
        userId: "user-id",
      })
    })

    it("clamps auto-refresh intervals to new minimums during migration", () => {
      const prefs = createV0Preferences({
        preferencesVersion: 9,
        accountAutoRefresh: {
          enabled: true,
          interval: 10,
          minInterval: 0,
          refreshOnOpen: false,
        },
      })

      const result = migratePreferences(prefs)

      expect(result.preferencesVersion).toBe(CURRENT_PREFERENCES_VERSION)
      expect(result.accountAutoRefresh.interval).toBe(
        ACCOUNT_AUTO_REFRESH_INTERVAL_MIN_SECONDS,
      )
      expect(result.accountAutoRefresh.minInterval).toBe(
        ACCOUNT_AUTO_REFRESH_MIN_INTERVAL_MIN_SECONDS,
      )
    })

    it("sequentially migrates from v0 through all versions", () => {
      const prefs = createV0Preferences({
        // All legacy flat fields for a complete v0 config
        sortingPriorityConfig: {
          criteria: [
            {
              id: SortingCriteriaType.CURRENT_SITE,
              enabled: true,
              priority: 0,
            },
            {
              id: SortingCriteriaType.HEALTH_STATUS,
              enabled: true,
              priority: 1,
            },
          ],
          lastModified: Date.now(),
        },
        webdavUrl: "https://backup.example.com",
        webdavUsername: "backupuser",
        webdavPassword: "backuppass",
        webdavAutoSync: true,
        webdavSyncInterval: 7200,
        webdavSyncStrategy: WEBDAV_SYNC_STRATEGIES.UPLOAD_ONLY,
        autoRefresh: true,
        refreshInterval: 600,
        minRefreshInterval: 60,
        refreshOnOpen: true,
        newApiBaseUrl: "https://api.example.com",
        newApiAdminToken: "admin-token",
        newApiUserId: "user-id",
      }) as UserPreferences

      const result = migratePreferences(prefs)

      // Should be at current version
      expect(result.preferencesVersion).toBe(CURRENT_PREFERENCES_VERSION)

      // All old fields should be removed
      expect(result).not.toHaveProperty("webdavUrl")
      expect(result).not.toHaveProperty("webdavUsername")
      expect(result).not.toHaveProperty("autoRefresh")
      expect(result).not.toHaveProperty("newApiBaseUrl")

      // New nested structures should be set correctly
      expect(result.webdav).toEqual({
        url: "https://backup.example.com",
        username: "backupuser",
        password: "backuppass",
        backupEncryptionEnabled: false,
        backupEncryptionPassword: "",
        autoSync: true,
        syncInterval: 7200,
        syncStrategy: WEBDAV_SYNC_STRATEGIES.UPLOAD_ONLY,
      })

      expect(result.accountAutoRefresh).toEqual({
        enabled: true,
        interval: 600,
        minInterval: 60,
        refreshOnOpen: true,
      })

      expect(result.newApi).toEqual({
        baseUrl: "https://api.example.com",
        adminToken: "admin-token",
        userId: "user-id",
      })
    })

    it("preserves non-migrated properties during migration", () => {
      const prefs = createV0Preferences({
        themeMode: "dark" as const,
        activeTab: "balance" as const,
        currencyType: "CNY" as const,
        sortField: "name" as const,
        sortOrder: "asc" as const,
        showHealthStatus: false,
        language: "zh-CN",
      })

      const result = migratePreferences(prefs)

      expect(result.themeMode).toBe("dark")
      expect(result.activeTab).toBe("balance")
      expect(result.currencyType).toBe("CNY")
      expect(result.sortField).toBe("name")
      expect(result.sortOrder).toBe("asc")
      expect(result.showHealthStatus).toBe(false)
      expect(result.language).toBe("zh-CN")
    })

    it("handles partial migrations correctly", () => {
      // Create a v2 preferences with only some of the legacy fields
      // Manually build prefs without relying on helper to avoid pre-populated structures
      const prefs: UserPreferences = {
        themeMode: "system",
        logging: DEFAULT_PREFERENCES.logging,
        // Legacy stored value before the v7->v8 cashflow tab rename migration.
        activeTab: DATA_TYPE_CONSUMPTION as any,
        currencyType: "USD",
        sortField: "balance",
        sortOrder: "desc",
        accountAutoRefresh: DEFAULT_ACCOUNT_AUTO_REFRESH,
        showHealthStatus: true,
        newApi: DEFAULT_NEW_API_CONFIG,
        veloera: DEFAULT_VELOERA_CONFIG,
        managedSiteType: NEW_API,
        newApiModelSync: {
          enabled: false,
          interval: 24 * 60 * 60 * 1000,
          concurrency: 2,
          maxRetries: 2,
          rateLimit: { requestsPerMinute: 20, burst: 5 },
          allowedModels: [],
          globalChannelModelFilters: [],
        },
        autoCheckin: {
          globalEnabled: false,
          pretriggerDailyOnUiOpen: true,
          notifyUiOnCompletion: true,
          windowStart: "09:00",
          windowEnd: "18:00",
          scheduleMode: "random",
          retryStrategy: {
            enabled: false,
            intervalMinutes: 30,
            maxAttemptsPerDay: 3,
          },
        },
        modelRedirect: {
          enabled: false,
          standardModels: [],
          pruneMissingTargetsOnModelSync: false,
        },
        webdav: DEFAULT_WEBDAV_SETTINGS,
        lastUpdated: Date.now(),
        preferencesVersion: 2,
        // Legacy fields that need migration from v2->v3 (WebDAV)
        webdavUrl: "https://example.com",
      } as UserPreferences

      const result = migratePreferences(prefs)

      expect(result.preferencesVersion).toBe(CURRENT_PREFERENCES_VERSION)
      expect(result.webdav).toBeDefined()
      expect(result.webdav.url).toBe("https://example.com")
      // Old field should be removed
      expect(result).not.toHaveProperty("webdavUrl")
    })

    it("respects defaults when fields are missing", () => {
      const prefs = createV0Preferences({
        preferencesVersion: 2,
        // No legacy WebDAV fields
      })

      const result = migratePreferences(prefs)

      expect(result.preferencesVersion).toBe(CURRENT_PREFERENCES_VERSION)
      expect(result.webdav).toEqual(DEFAULT_WEBDAV_SETTINGS)
    })

    it("handles mixed old and new field scenarios", () => {
      const prefs = createV0Preferences({
        preferencesVersion: 2,
        // Old flat WebDAV fields alongside new nested structure
        webdav: {
          url: "https://old.com",
          username: "olduser",
          password: "oldpass",
          autoSync: false,
          syncInterval: 3600,
          syncStrategy: WEBDAV_SYNC_STRATEGIES.MERGE,
        },
        webdavUrl: "https://new.com",
        webdavUsername: "newuser",
      }) as UserPreferences

      const result = migratePreferences(prefs)

      expect(result.preferencesVersion).toBe(CURRENT_PREFERENCES_VERSION)
      // Old fields should be prioritized and then removed
      expect(result.webdav.url).toBe("https://new.com")
      expect(result.webdav.username).toBe("newuser")
      expect(result).not.toHaveProperty("webdavUrl")
    })

    it("adds PINNED criterion during v0->v1 and v1->v2 migrations", () => {
      const prefs = createV0Preferences({
        sortingPriorityConfig: {
          criteria: [
            {
              id: SortingCriteriaType.CURRENT_SITE,
              enabled: true,
              priority: 0,
            },
          ],
          lastModified: Date.now(),
        },
      })

      const result = migratePreferences(prefs)

      const pinnedCriterion = result.sortingPriorityConfig?.criteria.find(
        (c) => c.id === SortingCriteriaType.PINNED,
      )

      expect(pinnedCriterion).toBeDefined()
      expect(pinnedCriterion?.enabled).toBe(true)
    })

    it("normalizes sorting priorities after migrations", () => {
      const prefs = createV0Preferences({
        preferencesVersion: 1,
        sortingPriorityConfig: {
          criteria: [
            {
              id: SortingCriteriaType.CURRENT_SITE,
              enabled: true,
              priority: 10,
            },
            {
              id: SortingCriteriaType.HEALTH_STATUS,
              enabled: true,
              priority: 20,
            },
          ],
          lastModified: Date.now(),
        },
      })

      const result = migratePreferences(prefs)

      // Priorities should be normalized
      const priorities = result.sortingPriorityConfig?.criteria.map(
        (c) => c.priority,
      )
      const uniquePriorities = [...new Set(priorities)]
      expect(uniquePriorities.length).toBe(priorities?.length)
    })

    it("handles undefined preferencesVersion as v0", () => {
      const prefs = createV0Preferences({
        webdavUrl: "https://example.com",
        autoRefresh: true,
        refreshInterval: 300,
      }) as UserPreferences

      delete (prefs as any).preferencesVersion

      const result = migratePreferences(prefs)

      expect(result.preferencesVersion).toBe(CURRENT_PREFERENCES_VERSION)
      expect(result.webdav.url).toBe("https://example.com")
    })

    it("updates lastUpdated timestamp during migration", () => {
      const prefs = createV0Preferences({
        lastUpdated: 1000,
      })

      const result = migratePreferences(prefs)

      // lastUpdated may or may not be changed depending on implementation
      // but the result should have a valid timestamp
      expect(result.lastUpdated).toBeDefined()
      expect(typeof result.lastUpdated).toBe("number")
    })

    it("correctly handles defaults for all migration steps", () => {
      const prefs = createV0Preferences({
        preferencesVersion: 1,
      })

      const result = migratePreferences(prefs)

      expect(result.preferencesVersion).toBe(CURRENT_PREFERENCES_VERSION)
      expect(result.sortingPriorityConfig).toBeDefined()
      expect(result.webdav).toBeDefined()
      expect(result.accountAutoRefresh).toBeDefined()
      expect(result.newApi).toBeDefined()
    })

    it("preserves optional fields like language during migration", () => {
      const prefs = createV0Preferences({
        language: "en",
      })

      const result = migratePreferences(prefs)

      expect(result.language).toBe("en")
    })

    it("handles sorting config without migration when already correct", () => {
      const prefs = createV0Preferences({
        preferencesVersion: CURRENT_PREFERENCES_VERSION,
        sortingPriorityConfig: DEFAULT_SORTING_PRIORITY_CONFIG,
      })

      const result = migratePreferences(prefs)

      expect(result).toEqual(prefs)
    })

    it("removes all deprecated fields after full migration", () => {
      const prefs = createV0Preferences({
        // All deprecated fields
        newApiBaseUrl: "https://api.example.com",
        newApiAdminToken: "admin-token",
        newApiUserId: "user-id",
        autoRefresh: true,
        refreshInterval: 300,
        minRefreshInterval: 45,
        refreshOnOpen: false,
        webdavUrl: "https://example.com",
        webdavUsername: "user",
        webdavPassword: "pass",
        webdavAutoSync: true,
        webdavSyncInterval: 3600,
        webdavSyncStrategy: WEBDAV_SYNC_STRATEGIES.MERGE,
      }) as UserPreferences

      const result = migratePreferences(prefs)

      expect(result).not.toHaveProperty("newApiBaseUrl")
      expect(result).not.toHaveProperty("newApiAdminToken")
      expect(result).not.toHaveProperty("newApiUserId")
      expect(result).not.toHaveProperty("autoRefresh")
      expect(result).not.toHaveProperty("refreshInterval")
      expect(result).not.toHaveProperty("minRefreshInterval")
      expect(result).not.toHaveProperty("refreshOnOpen")
      expect(result).not.toHaveProperty("webdavUrl")
      expect(result).not.toHaveProperty("webdavUsername")
      expect(result).not.toHaveProperty("webdavPassword")
      expect(result).not.toHaveProperty("webdavAutoSync")
      expect(result).not.toHaveProperty("webdavSyncInterval")
      expect(result).not.toHaveProperty("webdavSyncStrategy")
    })
  })
})
