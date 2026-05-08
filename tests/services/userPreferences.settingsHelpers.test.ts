import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { Storage } from "@plasmohq/storage"

import { DATA_TYPE_BALANCE } from "~/constants"
import { USER_PREFERENCES_STORAGE_KEYS } from "~/services/core/storageKeys"
import {
  DEFAULT_PREFERENCES,
  userPreferences,
} from "~/services/preferences/userPreferences"
import { AUTO_CHECKIN_SCHEDULE_MODE } from "~/types/autoCheckin"
import { DEFAULT_TASK_NOTIFICATION_PREFERENCES } from "~/types/taskNotifications"
import { WEBDAV_SYNC_STRATEGIES } from "~/types/webdav"

describe("userPreferences settings helpers", () => {
  const storage = new Storage({ area: "local" })

  beforeEach(async () => {
    vi.useFakeTimers()
    await storage.remove(USER_PREFERENCES_STORAGE_KEYS.USER_PREFERENCES)
  })

  afterEach(async () => {
    vi.useRealTimers()
    await storage.remove(USER_PREFERENCES_STORAGE_KEYS.USER_PREFERENCES)
  })

  it("persists display, language, health, WebDAV, and export helper updates", async () => {
    await storage.set(
      USER_PREFERENCES_STORAGE_KEYS.USER_PREFERENCES,
      structuredClone(DEFAULT_PREFERENCES),
    )

    expect(await userPreferences.updateActiveTab(DATA_TYPE_BALANCE)).toBe(true)
    expect(await userPreferences.updateCurrencyType("CNY")).toBe(true)
    expect(await userPreferences.updateShowTodayCashflow(false)).toBe(true)
    expect(await userPreferences.updateSortConfig("name", "asc")).toBe(true)
    expect(await userPreferences.updateShowHealthStatus(false)).toBe(true)
    expect(await userPreferences.setLanguage("ja")).toBe(true)
    expect(
      await userPreferences.updateWebdavSettings({
        url: "https://dav.example.com",
        username: "alice",
        password: "secret",
        backupEncryptionEnabled: true,
        backupEncryptionPassword: "vault-pass",
        syncData: {
          ...DEFAULT_PREFERENCES.webdav.syncData,
          accounts: false,
        },
      }),
    ).toBe(true)
    expect(
      await userPreferences.updateWebdavAutoSyncSettings({
        autoSync: true,
        syncInterval: 7200,
        syncStrategy: WEBDAV_SYNC_STRATEGIES.DOWNLOAD_ONLY,
      }),
    ).toBe(true)

    const preferences = await userPreferences.getPreferences()
    const exportedPreferences = await userPreferences.exportPreferences()

    expect(await userPreferences.getLanguage()).toBe("ja")
    expect(preferences.activeTab).toBe(DATA_TYPE_BALANCE)
    expect(preferences.currencyType).toBe("CNY")
    expect(preferences.showTodayCashflow).toBe(false)
    expect(preferences.sortField).toBe("name")
    expect(preferences.sortOrder).toBe("asc")
    expect(preferences.showHealthStatus).toBe(false)
    expect(preferences.language).toBe("ja")
    expect(preferences.webdav).toEqual({
      ...DEFAULT_PREFERENCES.webdav,
      url: "https://dav.example.com",
      username: "alice",
      password: "secret",
      backupEncryptionEnabled: true,
      backupEncryptionPassword: "vault-pass",
      syncData: {
        ...DEFAULT_PREFERENCES.webdav.syncData,
        accounts: false,
      },
      autoSync: true,
      syncInterval: 7200,
      syncStrategy: WEBDAV_SYNC_STRATEGIES.DOWNLOAD_ONLY,
    })
    expect(exportedPreferences).toEqual(preferences)

    const storedAfter = (await storage.get(
      USER_PREFERENCES_STORAGE_KEYS.USER_PREFERENCES,
    )) as any
    expect(storedAfter.language).toBe("ja")
    expect(storedAfter.webdav).toEqual(preferences.webdav)
  })

  it("persists and resets task notification preferences", async () => {
    await storage.set(
      USER_PREFERENCES_STORAGE_KEYS.USER_PREFERENCES,
      structuredClone(DEFAULT_PREFERENCES),
    )

    expect(
      await userPreferences.updateTaskNotifications({
        enabled: false,
        tasks: {
          ...DEFAULT_TASK_NOTIFICATION_PREFERENCES.tasks,
          usageHistorySync: false,
        },
      }),
    ).toBe(true)

    let preferences = await userPreferences.getPreferences()
    expect(preferences.taskNotifications).toEqual({
      enabled: false,
      tasks: {
        ...DEFAULT_TASK_NOTIFICATION_PREFERENCES.tasks,
        usageHistorySync: false,
      },
      channels: DEFAULT_TASK_NOTIFICATION_PREFERENCES.channels,
    })

    expect(await userPreferences.resetTaskNotifications()).toBe(true)

    preferences = await userPreferences.getPreferences()
    expect(preferences.taskNotifications).toEqual(
      DEFAULT_TASK_NOTIFICATION_PREFERENCES,
    )
  })

  it("restores grouped reset helpers back to their default snapshots", async () => {
    await storage.set(USER_PREFERENCES_STORAGE_KEYS.USER_PREFERENCES, {
      ...structuredClone(DEFAULT_PREFERENCES),
      activeTab: DATA_TYPE_BALANCE,
      currencyType: "CNY",
      showTodayCashflow: false,
      accountAutoRefresh: {
        ...DEFAULT_PREFERENCES.accountAutoRefresh,
        enabled: false,
        interval: DEFAULT_PREFERENCES.accountAutoRefresh.interval + 300,
      },
      newApi: {
        ...DEFAULT_PREFERENCES.newApi,
        baseUrl: "https://new-api.example.com",
      },
      managedSiteModelSync: {
        ...DEFAULT_PREFERENCES.managedSiteModelSync,
        enabled: true,
        allowedModels: ["gpt-4o"],
      },
      cliProxy: {
        baseUrl: "http://localhost:8317/v0/management",
        managementKey: "management-key",
      },
      claudeCodeRouter: {
        baseUrl: "http://router.local",
        apiKey: "router-key",
      },
      autoCheckin: {
        ...DEFAULT_PREFERENCES.autoCheckin,
        globalEnabled: false,
        scheduleMode: AUTO_CHECKIN_SCHEDULE_MODE.DETERMINISTIC,
        deterministicTime: "12:34",
      },
      modelRedirect: {
        ...DEFAULT_PREFERENCES.modelRedirect,
        enabled: true,
        standardModels: ["custom-model"],
        pruneMissingTargetsOnModelSync: true,
      },
      redemptionAssist: {
        ...DEFAULT_PREFERENCES.redemptionAssist,
        enabled: false,
        contextMenu: { enabled: false },
        relaxedCodeValidation: false,
        urlWhitelist: {
          ...DEFAULT_PREFERENCES.redemptionAssist!.urlWhitelist,
          enabled: false,
          patterns: ["^https://blocked.example.com$"],
          includeAccountSiteUrls: false,
          includeCheckInAndRedeemUrls: false,
        },
      },
      webAiApiCheck: {
        ...DEFAULT_PREFERENCES.webAiApiCheck,
        enabled: false,
        contextMenu: { enabled: false },
        autoDetect: {
          enabled: true,
          urlWhitelist: {
            patterns: ["^https://detect.example.com$"],
          },
        },
      },
      webdav: {
        ...DEFAULT_PREFERENCES.webdav,
        url: "https://dav.example.com",
        username: "alice",
        password: "secret",
        autoSync: true,
        syncInterval: 7200,
        syncStrategy: WEBDAV_SYNC_STRATEGIES.DOWNLOAD_ONLY,
      },
    })

    expect(await userPreferences.resetDisplaySettings()).toBe(true)
    expect(await userPreferences.resetAutoRefreshConfig()).toBe(true)
    expect(await userPreferences.resetNewApiConfig()).toBe(true)
    expect(await userPreferences.resetNewApiModelSyncConfig()).toBe(true)

    await userPreferences.savePreferences({
      managedSiteModelSync: {
        ...DEFAULT_PREFERENCES.managedSiteModelSync,
        enabled: true,
        concurrency: 5,
      },
    })

    expect(await userPreferences.resetManagedSiteModelSyncConfig()).toBe(true)
    expect(await userPreferences.resetCliProxyConfig()).toBe(true)
    expect(await userPreferences.resetClaudeCodeRouterConfig()).toBe(true)
    expect(await userPreferences.resetAutoCheckinConfig()).toBe(true)
    expect(await userPreferences.resetModelRedirectConfig()).toBe(true)
    expect(await userPreferences.resetRedemptionAssist()).toBe(true)
    expect(await userPreferences.resetWebAiApiCheck()).toBe(true)
    expect(await userPreferences.resetWebdavConfig()).toBe(true)

    const preferences = await userPreferences.getPreferences()

    expect(preferences.activeTab).toBe(DEFAULT_PREFERENCES.activeTab)
    expect(preferences.currencyType).toBe(DEFAULT_PREFERENCES.currencyType)
    expect(preferences.showTodayCashflow).toBe(
      DEFAULT_PREFERENCES.showTodayCashflow,
    )
    expect(preferences.accountAutoRefresh).toEqual(
      DEFAULT_PREFERENCES.accountAutoRefresh,
    )
    expect(preferences.newApi).toEqual(DEFAULT_PREFERENCES.newApi)
    expect(preferences.managedSiteModelSync).toEqual(
      DEFAULT_PREFERENCES.managedSiteModelSync,
    )
    expect(preferences.cliProxy).toEqual(DEFAULT_PREFERENCES.cliProxy)
    expect(preferences.claudeCodeRouter).toEqual(
      DEFAULT_PREFERENCES.claudeCodeRouter,
    )
    expect(preferences.autoCheckin).toEqual(DEFAULT_PREFERENCES.autoCheckin)
    expect(preferences.modelRedirect).toEqual(DEFAULT_PREFERENCES.modelRedirect)
    expect(preferences.redemptionAssist).toEqual(
      DEFAULT_PREFERENCES.redemptionAssist,
    )
    expect(preferences.webAiApiCheck).toEqual(DEFAULT_PREFERENCES.webAiApiCheck)
    expect(preferences.webdav).toEqual(DEFAULT_PREFERENCES.webdav)
  })

  it("resetToDefaults and clearPreferences restore a clean preference state", async () => {
    await storage.set(USER_PREFERENCES_STORAGE_KEYS.USER_PREFERENCES, {
      ...structuredClone(DEFAULT_PREFERENCES),
      activeTab: DATA_TYPE_BALANCE,
      currencyType: "CNY",
      language: "ja",
    })

    const resetTimestamp = new Date("2026-03-30T10:00:00.000Z")
    vi.setSystemTime(resetTimestamp)

    expect(await userPreferences.resetToDefaults()).toBe(true)

    const resetPreferences = await userPreferences.getPreferences()
    expect(resetPreferences.activeTab).toBe(DEFAULT_PREFERENCES.activeTab)
    expect(resetPreferences.currencyType).toBe(DEFAULT_PREFERENCES.currencyType)
    expect(resetPreferences.language).toBe(DEFAULT_PREFERENCES.language)
    expect(resetPreferences.lastUpdated).toBe(resetTimestamp.getTime())
    expect(resetPreferences.sharedPreferencesLastUpdated).toBe(
      resetTimestamp.getTime(),
    )

    expect(await userPreferences.clearPreferences()).toBe(true)

    const storedAfterClear = await storage.get(
      USER_PREFERENCES_STORAGE_KEYS.USER_PREFERENCES,
    )
    expect(storedAfterClear).toBeUndefined()

    const preferencesAfterClear = await userPreferences.getPreferences()
    expect(preferencesAfterClear.lastUpdated).toBe(0)
    expect(preferencesAfterClear.sharedPreferencesLastUpdated).toBe(0)
    expect(preferencesAfterClear.activeTab).toBe(DEFAULT_PREFERENCES.activeTab)
  })
})
