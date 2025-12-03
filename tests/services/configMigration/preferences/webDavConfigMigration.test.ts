import { describe, expect, it } from "vitest"

import {
  migrateWebDavConfig,
  needWebDavConfigMigration,
} from "~/services/configMigration/preferences/webDavConfigMigration"
import {
  DEFAULT_PREFERENCES,
  type UserPreferences,
} from "~/services/userPreferences"
import { DEFAULT_ACCOUNT_AUTO_REFRESH } from "~/types/accountAutoRefresh"
import { DEFAULT_NEW_API_CONFIG } from "~/types/newApiConfig"
import { DEFAULT_WEBDAV_SETTINGS, WEBDAV_SYNC_STRATEGIES } from "~/types/webdav"

const createPreferences = (
  overrides?: Partial<UserPreferences>,
): UserPreferences => {
  const base = structuredClone(DEFAULT_PREFERENCES)
  return {
    ...base,
    ...overrides,
    webdav: {
      ...(base.webdav ?? DEFAULT_WEBDAV_SETTINGS),
      ...overrides?.webdav,
    },
    accountAutoRefresh: {
      ...DEFAULT_ACCOUNT_AUTO_REFRESH,
      ...overrides?.accountAutoRefresh,
    },
    newApi: {
      ...DEFAULT_NEW_API_CONFIG,
      ...overrides?.newApi,
    },
    newApiModelSync: {
      ...base.newApiModelSync,
      ...overrides?.newApiModelSync,
    },
    autoCheckin: {
      ...base.autoCheckin,
      ...overrides?.autoCheckin,
    },
    modelRedirect: {
      ...base.modelRedirect,
      ...overrides?.modelRedirect,
    },
  }
}

describe("webDavConfigMigration", () => {
  describe("needWebDavConfigMigration", () => {
    it("returns false when no flat WebDAV fields exist", () => {
      const prefs = createPreferences({
        themeMode: "dark",
        activeTab: "balance",
        currencyType: "USD",
      })

      const result = needWebDavConfigMigration(prefs)
      expect(result).toBe(false)
    })

    it("returns true when webdavUrl field exists", () => {
      const prefs = createPreferences({
        webdavUrl: "https://example.com/webdav",
        themeMode: "dark",
      })

      const result = needWebDavConfigMigration(prefs)
      expect(result).toBe(true)
    })

    it("returns true when webdavUsername field exists", () => {
      const prefs = createPreferences({
        webdavUsername: "user",
        themeMode: "dark",
      })

      const result = needWebDavConfigMigration(prefs)
      expect(result).toBe(true)
    })

    it("returns true when webdavPassword field exists", () => {
      const prefs = createPreferences({
        webdavPassword: "password",
        themeMode: "dark",
      })

      const result = needWebDavConfigMigration(prefs)
      expect(result).toBe(true)
    })

    it("returns true when webdavAutoSync field exists", () => {
      const prefs = createPreferences({
        webdavAutoSync: true,
        themeMode: "dark",
      })

      const result = needWebDavConfigMigration(prefs)
      expect(result).toBe(true)
    })

    it("returns true when webdavSyncInterval field exists", () => {
      const prefs = createPreferences({
        webdavSyncInterval: 3600,
        themeMode: "dark",
      })

      const result = needWebDavConfigMigration(prefs)
      expect(result).toBe(true)
    })

    it("returns true when webdavSyncStrategy field exists", () => {
      const prefs = createPreferences({
        webdavSyncStrategy: WEBDAV_SYNC_STRATEGIES.MERGE,
        themeMode: "dark",
      })

      const result = needWebDavConfigMigration(prefs)
      expect(result).toBe(true)
    })

    it("returns true when any flat WebDAV field exists", () => {
      const prefs = createPreferences({
        webdavUrl: "https://example.com",
        webdavUsername: "user",
        webdavPassword: "pass",
        webdavAutoSync: true,
        webdavSyncInterval: 3600,
        webdavSyncStrategy: WEBDAV_SYNC_STRATEGIES.MERGE,
        themeMode: "dark",
      })

      const result = needWebDavConfigMigration(prefs)
      expect(result).toBe(true)
    })
  })

  describe("migrateWebDavConfig", () => {
    it("migrates flat WebDAV fields to nested structure", () => {
      const oldPrefs = createPreferences({
        webdavUrl: "https://example.com/webdav",
        webdavUsername: "testuser",
        webdavPassword: "testpass",
        webdavAutoSync: true,
        webdavSyncInterval: 1800,
        webdavSyncStrategy: WEBDAV_SYNC_STRATEGIES.UPLOAD_ONLY,
        themeMode: "dark",
      })

      const result = migrateWebDavConfig(oldPrefs)

      expect(result.webdav).toEqual({
        url: "https://example.com/webdav",
        username: "testuser",
        password: "testpass",
        autoSync: true,
        syncInterval: 1800,
        syncStrategy: WEBDAV_SYNC_STRATEGIES.UPLOAD_ONLY,
      })
    })

    it("removes old flat WebDAV fields after migration", () => {
      const oldPrefs = {
        webdavUrl: "https://example.com/webdav",
        webdavUsername: "testuser",
        webdavPassword: "testpass",
        webdavAutoSync: true,
        webdavSyncInterval: 1800,
        webdavSyncStrategy: WEBDAV_SYNC_STRATEGIES.MERGE,
        themeMode: "dark",
      } as UserPreferences

      const result = migrateWebDavConfig(oldPrefs)

      expect(result).not.toHaveProperty("webdavUrl")
      expect(result).not.toHaveProperty("webdavUsername")
      expect(result).not.toHaveProperty("webdavPassword")
      expect(result).not.toHaveProperty("webdavAutoSync")
      expect(result).not.toHaveProperty("webdavSyncInterval")
      expect(result).not.toHaveProperty("webdavSyncStrategy")
    })

    it("uses defaults when flat fields are missing", () => {
      const prefs = {
        themeMode: "dark",
      } as UserPreferences

      const result = migrateWebDavConfig(prefs)

      expect(result.webdav).toEqual(DEFAULT_WEBDAV_SETTINGS)
    })

    it("handles partial flat fields with defaults", () => {
      const prefs = {
        webdavUrl: "https://example.com",
        webdavAutoSync: true,
        themeMode: "dark",
      } as UserPreferences

      const result = migrateWebDavConfig(prefs)

      expect(result.webdav).toEqual({
        url: "https://example.com",
        username: DEFAULT_WEBDAV_SETTINGS.username,
        password: DEFAULT_WEBDAV_SETTINGS.password,
        autoSync: true,
        syncInterval: DEFAULT_WEBDAV_SETTINGS.syncInterval,
        syncStrategy: DEFAULT_WEBDAV_SETTINGS.syncStrategy,
      })
    })

    it("does not migrate if already using nested structure", () => {
      const newPrefs = {
        webdav: {
          url: "https://example.com/webdav",
          username: "testuser",
          password: "testpass",
          autoSync: true,
          syncInterval: 3600,
          syncStrategy: WEBDAV_SYNC_STRATEGIES.MERGE,
        },
        themeMode: "dark",
      } as UserPreferences

      const result = migrateWebDavConfig(newPrefs)

      expect(result).toEqual(newPrefs)
    })

    it("migrates even if nested webdav already exists when flat fields present", () => {
      const mixedPrefs = createPreferences({
        webdav: {
          url: "https://old.com",
          username: "olduser",
          password: "oldpass",
          autoSync: false,
          syncInterval: 7200,
          syncStrategy: WEBDAV_SYNC_STRATEGIES.DOWNLOAD_ONLY,
        },
        webdavUrl: "https://new.com",
        webdavUsername: "newuser",
        webdavPassword: "newpass",
        webdavAutoSync: true,
        webdavSyncInterval: 3600,
        webdavSyncStrategy: WEBDAV_SYNC_STRATEGIES.MERGE,
        themeMode: "dark",
      })

      const result = migrateWebDavConfig(mixedPrefs)

      expect(result.webdav).toEqual({
        url: "https://new.com",
        username: "newuser",
        password: "newpass",
        autoSync: true,
        syncInterval: 3600,
        syncStrategy: WEBDAV_SYNC_STRATEGIES.MERGE,
      })

      expect(result).not.toHaveProperty("webdavUrl")
    })

    it("preserves non-WebDAV properties during migration", () => {
      const oldPrefs = {
        webdavUrl: "https://example.com",
        webdavUsername: "user",
        themeMode: "light" as const,
        activeTab: "balance" as const,
        currencyType: "CNY" as const,
        sortField: "name" as const,
        sortOrder: "asc" as const,
      } as UserPreferences

      const result = migrateWebDavConfig(oldPrefs)

      expect(result.themeMode).toBe("light")
      expect(result.activeTab).toBe("balance")
      expect(result.currencyType).toBe("CNY")
      expect(result.sortField).toBe("name")
      expect(result.sortOrder).toBe("asc")
    })

    it("handles all sync strategies correctly", () => {
      const strategies = [
        WEBDAV_SYNC_STRATEGIES.MERGE,
        WEBDAV_SYNC_STRATEGIES.UPLOAD_ONLY,
        WEBDAV_SYNC_STRATEGIES.DOWNLOAD_ONLY,
      ] as const

      strategies.forEach((strategy) => {
        const prefs = {
          webdavSyncStrategy: strategy,
          themeMode: "dark",
        } as UserPreferences

        const result = migrateWebDavConfig(prefs)

        expect(result.webdav.syncStrategy).toBe(strategy)
      })
    })

    it("handles empty string values gracefully", () => {
      const prefs = createPreferences({
        webdavUrl: "",
        webdavUsername: "",
        webdavPassword: "",
        themeMode: "dark",
      })

      const result = migrateWebDavConfig(prefs)

      expect(result.webdav).toEqual({
        url: "",
        username: "",
        password: "",
        autoSync: DEFAULT_WEBDAV_SETTINGS.autoSync,
        syncInterval: DEFAULT_WEBDAV_SETTINGS.syncInterval,
        syncStrategy: DEFAULT_WEBDAV_SETTINGS.syncStrategy,
      })
    })

    it("handles undefined webdav field existing in prefs", () => {
      const prefs = createPreferences({
        webdav: undefined,
        webdavUrl: "https://example.com",
        themeMode: "dark",
      })

      const result = migrateWebDavConfig(prefs)

      expect(result.webdav).toBeDefined()
      expect(result.webdav.url).toBe("https://example.com")
    })

    it("preserves other nested objects during migration", () => {
      const prefs = createPreferences({
        webdavUrl: "https://example.com",
        newApi: {
          baseUrl: "https://api.example.com",
          adminToken: "token",
          userId: "user123",
        },
        accountAutoRefresh: {
          enabled: true,
          interval: 300,
          minInterval: 45,
          refreshOnOpen: false,
        },
        themeMode: "dark",
      })

      const result = migrateWebDavConfig(prefs)

      expect(result.newApi).toEqual(prefs.newApi)
      expect(result.accountAutoRefresh).toEqual(prefs.accountAutoRefresh)
    })
  })
})
