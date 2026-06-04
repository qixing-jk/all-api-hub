import { describe, expect, it } from "vitest"

import { MENU_ITEM_IDS } from "~/constants/optionsMenuIds"
import { SETTINGS_ANCHORS } from "~/constants/settingsAnchors"
import { SITE_TYPES } from "~/constants/siteType"
import {
  WEBDAV_AUTO_SYNC_TARGET_IDS,
  WEBDAV_TARGET_IDS,
} from "~/features/ImportExport/searchTargets"
import { buildOptionsOverviewViewModel } from "~/features/OptionsOverview/overviewSelectors"
import { createEmptyUsageHistoryAccountStore } from "~/services/history/usageHistory/core"
import {
  DEFAULT_PREFERENCES,
  type UserPreferences,
} from "~/services/preferences/userPreferences"
import {
  AuthTypeEnum,
  SiteHealthStatus,
  type AccountStats,
  type DisplaySiteData,
  type SiteAccount,
} from "~/types"
import type { ApiCredentialProfile } from "~/types/apiCredentialProfiles"
import {
  AUTO_CHECKIN_RUN_RESULT,
  type AutoCheckinStatus,
} from "~/types/autoCheckin"
import type {
  SiteAnnouncementRecord,
  SiteAnnouncementSiteState,
} from "~/types/siteAnnouncements"
import {
  DEFAULT_SITE_ANNOUNCEMENT_PREFERENCES,
  SITE_ANNOUNCEMENT_PROVIDER_IDS,
} from "~/types/siteAnnouncements"
import type { UsageHistoryStore } from "~/types/usageHistory"

const emptyStats: AccountStats = {
  total_quota: 0,
  today_total_consumption: 0,
  today_total_requests: 0,
  today_total_prompt_tokens: 0,
  today_total_completion_tokens: 0,
  today_total_income: 0,
}

const basePreferences: UserPreferences = {
  ...DEFAULT_PREFERENCES,
  lastUpdated: 1,
}

const emptyUsageStore: UsageHistoryStore = {
  schemaVersion: 1,
  accounts: {},
}

const baseAccount = {
  id: "account-1",
  site_name: "Relay",
  site_url: "https://relay.example.invalid",
  health: { status: SiteHealthStatus.Healthy },
  site_type: SITE_TYPES.NEW_API,
  exchange_rate: 7,
  account_info: {
    id: "user-1",
    access_token: "redacted-token",
    username: "user@example.invalid",
    quota: 100,
    today_prompt_tokens: 0,
    today_completion_tokens: 0,
    today_quota_consumption: 0,
    today_requests_count: 0,
    today_income: 0,
  },
  last_sync_time: 1,
  updated_at: 1,
  user_updated_at: 1,
  created_at: 1,
  notes: "",
  tagIds: [],
  disabled: false,
  excludeFromTotalBalance: false,
  excludeFromTodayIncome: false,
  authType: AuthTypeEnum.AccessToken,
  checkIn: {
    enableDetection: false,
  },
} satisfies SiteAccount

const healthyAccount: SiteAccount = {
  ...baseAccount,
  id: "healthy-account",
}

const autoCheckinReadyAccount: SiteAccount = {
  ...healthyAccount,
  id: "auto-checkin-ready-account",
  checkIn: { enableDetection: true },
}

const unhealthyAccount: SiteAccount = {
  ...baseAccount,
  id: "unhealthy-account",
  health: {
    status: SiteHealthStatus.Error,
    reason: "sync failed",
  },
}

const healthyDisplayData: DisplaySiteData = {
  id: "healthy-account",
  name: "Relay",
  username: "user@example.invalid",
  balance: { USD: 1, CNY: 7 },
  todayConsumption: { USD: 0, CNY: 0 },
  todayIncome: { USD: 0, CNY: 0 },
  todayTokens: { upload: 0, download: 0 },
  health: { status: SiteHealthStatus.Healthy },
  siteType: SITE_TYPES.NEW_API,
  baseUrl: "https://relay.example.invalid",
  token: "redacted-token",
  userId: "user-1",
  authType: AuthTypeEnum.AccessToken,
  checkIn: { enableDetection: false },
}

const unhealthyDisplayData: DisplaySiteData = {
  ...healthyDisplayData,
  id: "unhealthy-account",
  name: "Broken Relay",
  health: {
    status: SiteHealthStatus.Error,
    reason: "sync failed",
  },
}

const statsWithUsage: AccountStats = {
  total_quota: 100_000,
  today_total_consumption: 1234,
  today_total_requests: 12,
  today_total_prompt_tokens: 300,
  today_total_completion_tokens: 700,
  today_total_income: 0,
}

const profile: ApiCredentialProfile = {
  id: "profile-1",
  name: "Profile",
  apiType: "openai-compatible",
  baseUrl: "https://api.example.invalid",
  apiKey: "redacted-key",
  tagIds: [],
  notes: "",
  createdAt: 1,
  updatedAt: 1,
}

const usageStoreWithTodayAndSevenDays: UsageHistoryStore = {
  schemaVersion: 1,
  accounts: {
    "healthy-account": {
      ...createEmptyUsageHistoryAccountStore(),
      daily: {
        "2026-05-26": {
          requests: 1,
          promptTokens: 10,
          completionTokens: 20,
          totalTokens: 30,
          quotaConsumed: 100,
        },
        "2026-05-27": {
          requests: 2,
          promptTokens: 20,
          completionTokens: 30,
          totalTokens: 50,
          quotaConsumed: 200,
        },
        "2026-06-01": {
          requests: 3,
          promptTokens: 30,
          completionTokens: 40,
          totalTokens: 70,
          quotaConsumed: 300,
        },
      },
    },
  },
}

const autoCheckinStatusWithFailures: AutoCheckinStatus = {
  lastRunAt: "2026-06-03T01:30:00.000Z",
  lastRunResult: AUTO_CHECKIN_RUN_RESULT.PARTIAL,
  summary: {
    totalEligible: 5,
    executed: 4,
    successCount: 3,
    failedCount: 1,
    skippedCount: 1,
    needsRetry: true,
  },
  pendingRetry: true,
  nextDailyScheduledAt: "2026-06-04T01:30:00.000Z",
  nextRetryScheduledAt: "2026-06-03T02:00:00.000Z",
}

const announcementStatus: SiteAnnouncementSiteState = {
  siteKey: "notice:new-api:https://relay.example.invalid",
  siteName: "Relay",
  siteType: SITE_TYPES.NEW_API,
  baseUrl: "https://relay.example.invalid",
  accountId: "healthy-account",
  providerId: SITE_ANNOUNCEMENT_PROVIDER_IDS.Common,
  status: "success",
  lastCheckedAt: 1780450200000,
  lastSuccessAt: 1780450200000,
  records: [],
}

const unreadAnnouncement: SiteAnnouncementRecord = {
  id: "announcement-1",
  siteKey: announcementStatus.siteKey,
  siteName: announcementStatus.siteName,
  siteType: announcementStatus.siteType,
  baseUrl: announcementStatus.baseUrl,
  accountId: announcementStatus.accountId,
  providerId: announcementStatus.providerId,
  title: "Announcement",
  content: "Summary",
  fingerprint: "announcement-fingerprint",
  firstSeenAt: 1780450200000,
  lastSeenAt: 1780450200000,
  read: false,
}

const baseOverviewInput = {
  siteAnnouncementRecords: [],
  siteAnnouncementStatuses: [],
}

describe("Options overview selectors", () => {
  it("builds setup-focused overview data when no accounts or profiles exist", () => {
    const view = buildOptionsOverviewViewModel({
      accounts: [],
      displayData: [],
      accountStats: emptyStats,
      apiCredentialProfiles: [],
      usageStore: emptyUsageStore,
      preferences: basePreferences,
      managedSiteType: undefined,
      autoCheckinStatus: null,
      ...baseOverviewInput,
    })

    expect(view.statusCards.find((item) => item.id === "accounts")?.value).toBe(
      "0",
    )
    expect(view.attentionItems.map((item) => item.id)).toContain(
      "setup:add-account",
    )
    expect(
      view.configurationOverviewItems
        .find((item) => item.id === "accountFoundation")
        ?.subItems.map((item) => item.target.menuItemId),
    ).toContain(MENU_ITEM_IDS.ACCOUNT)
  })

  it("surfaces unhealthy enabled accounts before setup hints", () => {
    const view = buildOptionsOverviewViewModel({
      accounts: [healthyAccount, unhealthyAccount],
      displayData: [healthyDisplayData, unhealthyDisplayData],
      accountStats: statsWithUsage,
      apiCredentialProfiles: [profile],
      usageStore: usageStoreWithTodayAndSevenDays,
      preferences: basePreferences,
      managedSiteType: SITE_TYPES.NEW_API,
      autoCheckinStatus: null,
      ...baseOverviewInput,
    })

    expect(view.attentionItems[0]?.id).toBe("account:unhealthy-account:error")
    expect(view.attentionItems[0]?.severity).toBe("error")
    expect(view.attentionItems[0]?.target).toEqual({
      menuItemId: MENU_ITEM_IDS.ACCOUNT,
      params: { search: "unhealthy-account" },
    })
    expect(view.usageSnapshot.todayTokens).toBe(1000)
    expect(view.usageSnapshot.sevenDayRequests).toBe(6)
    expect(view.usageSnapshot.sevenDayTokens).toBe(150)
    expect(
      view.configurationOverviewItems.find((item) => item.id === "managedSite")
        ?.isVisible,
    ).toBe(true)
  })

  it("keeps unhealthy account attention item ids unique across accounts", () => {
    const secondUnhealthyDisplayData: DisplaySiteData = {
      ...unhealthyDisplayData,
      id: "second-unhealthy-account",
      name: "Second Broken Relay",
    }
    const view = buildOptionsOverviewViewModel({
      accounts: [healthyAccount],
      displayData: [unhealthyDisplayData, secondUnhealthyDisplayData],
      accountStats: emptyStats,
      apiCredentialProfiles: [profile],
      usageStore: emptyUsageStore,
      preferences: basePreferences,
      managedSiteType: undefined,
      autoCheckinStatus: null,
      ...baseOverviewInput,
    })

    expect(view.attentionItems.map((item) => item.id)).toEqual([
      "account:second-unhealthy-account:error",
      "account:unhealthy-account:error",
    ])
  })

  it("promotes auto check-in run state into a dedicated overview panel", () => {
    const view = buildOptionsOverviewViewModel({
      accounts: [healthyAccount],
      displayData: [healthyDisplayData],
      accountStats: statsWithUsage,
      apiCredentialProfiles: [profile],
      usageStore: usageStoreWithTodayAndSevenDays,
      preferences: basePreferences,
      managedSiteType: SITE_TYPES.NEW_API,
      autoCheckinStatus: autoCheckinStatusWithFailures,
      siteAnnouncementRecords: [unreadAnnouncement],
      siteAnnouncementStatuses: [announcementStatus],
    })

    expect(view.autoCheckinPanel).toMatchObject({
      status: "partial",
      severity: "warning",
      totalEligible: 5,
      executed: 4,
      successCount: 3,
      failedCount: 1,
      skippedCount: 1,
      needsRetry: true,
      lastRunAt: "2026-06-03T01:30:00.000Z",
      nextRunAt: "2026-06-04T01:30:00.000Z",
      nextRetryAt: "2026-06-03T02:00:00.000Z",
    })
    expect(view.autoCheckinPanel.actions.map((action) => action.id)).toEqual([
      "openAutoCheckin",
      "retryFailed",
    ])
    expect(view.automationOverview.items.map((item) => item.id)).toEqual([
      "autoCheckin",
      "siteAnnouncements",
      "managedSiteModelSync",
      "webdavAutoSync",
    ])
    expect(view.automationOverview.items[0]).toMatchObject({
      id: "autoCheckin",
      defaultExpanded: false,
      autoCheckinPanel: { status: "partial" },
    })
    expect(
      view.automationOverview.items
        .find((item) => item.id === "siteAnnouncements")
        ?.summaryRows.map((row) => [row.id, row.value]),
    ).toEqual([
      ["interval", "360"],
      ["records", "1"],
      ["unread", "1"],
      ["lastChecked", "2026-06-03T01:30:00.000Z"],
    ])
    expect(
      view.automationOverview.items.find(
        (item) => item.id === "siteAnnouncements",
      )?.primaryTarget,
    ).toEqual({
      menuItemId: MENU_ITEM_IDS.BASIC,
      params: {
        tab: "general",
        anchor: SETTINGS_ANCHORS.SITE_ANNOUNCEMENT_NOTIFICATIONS_ENABLED,
        highlight: SETTINGS_ANCHORS.SITE_ANNOUNCEMENT_NOTIFICATIONS_ENABLED,
      },
    })
  })

  it("builds capability status cards for the configuration overview", () => {
    const view = buildOptionsOverviewViewModel({
      accounts: [],
      displayData: [],
      accountStats: emptyStats,
      apiCredentialProfiles: [],
      usageStore: emptyUsageStore,
      preferences: {
        ...basePreferences,
        autoCheckin: {
          ...basePreferences.autoCheckin,
          globalEnabled: false,
        },
      },
      managedSiteType: undefined,
      autoCheckinStatus: null,
      ...baseOverviewInput,
    })

    expect(view.configurationOverviewItems.map((item) => item.id)).toEqual([
      "accountFoundation",
      "credentialAssets",
      "automation",
      "dataHistory",
      "backupSync",
      "managedSite",
    ])
    expect(
      view.configurationOverviewItems.find(
        (item) => item.id === "accountFoundation",
      ),
    ).toMatchObject({
      status: "needs_setup",
    })
    expect(
      view.configurationOverviewItems.find((item) => item.id === "automation"),
    ).toMatchObject({
      status: "disabled",
    })
    expect(
      view.configurationOverviewItems
        .find((item) => item.id === "automation")
        ?.subItems.map((item) => [
          item.id,
          item.status,
          item.target.menuItemId,
          item.target.params?.tab,
          item.target.params?.anchor,
          item.target.params?.highlight,
        ]),
    ).toEqual([
      [
        "autoCheckin",
        "disabled",
        MENU_ITEM_IDS.BASIC,
        "checkinRedeem",
        SETTINGS_ANCHORS.AUTO_CHECKIN,
        SETTINGS_ANCHORS.AUTO_CHECKIN,
      ],
      [
        "siteAnnouncements",
        "disabled",
        MENU_ITEM_IDS.BASIC,
        "general",
        SETTINGS_ANCHORS.SITE_ANNOUNCEMENT_NOTIFICATIONS_ENABLED,
        SETTINGS_ANCHORS.SITE_ANNOUNCEMENT_NOTIFICATIONS_ENABLED,
      ],
    ])
    expect(
      view.configurationOverviewItems
        .find((item) => item.id === "dataHistory")
        ?.subItems.map((item) => [
          item.id,
          item.status,
          item.target.menuItemId,
          item.target.params?.tab,
          item.target.params?.anchor,
          item.target.params?.highlight,
        ]),
    ).toEqual([
      [
        "usageAnalytics",
        "needs_setup",
        MENU_ITEM_IDS.ACCOUNT,
        undefined,
        undefined,
        undefined,
      ],
      [
        "balanceHistory",
        "disabled",
        MENU_ITEM_IDS.BASIC,
        "balanceHistory",
        SETTINGS_ANCHORS.BALANCE_HISTORY,
        SETTINGS_ANCHORS.BALANCE_HISTORY,
      ],
    ])
    expect(
      view.configurationOverviewItems
        .find((item) => item.id === "backupSync")
        ?.subItems.map((item) => [
          item.id,
          item.status,
          item.target.menuItemId,
          item.target.params?.anchor,
          item.target.params?.highlight,
        ]),
    ).toEqual([
      [
        "webdavManual",
        "disabled",
        MENU_ITEM_IDS.IMPORT_EXPORT,
        WEBDAV_TARGET_IDS.root,
        WEBDAV_TARGET_IDS.root,
      ],
      [
        "webdavAutoSync",
        "disabled",
        MENU_ITEM_IDS.IMPORT_EXPORT,
        WEBDAV_AUTO_SYNC_TARGET_IDS.root,
        WEBDAV_AUTO_SYNC_TARGET_IDS.root,
      ],
    ])
    expect(
      view.configurationOverviewItems.find((item) => item.id === "managedSite")
        ?.isVisible,
    ).toBe(false)
  })

  it("summarizes WebDAV manual and automatic backup readiness separately", () => {
    const view = buildOptionsOverviewViewModel({
      accounts: [healthyAccount],
      displayData: [healthyDisplayData],
      accountStats: emptyStats,
      apiCredentialProfiles: [profile],
      usageStore: emptyUsageStore,
      preferences: {
        ...basePreferences,
        webdav: {
          ...basePreferences.webdav,
          url: "https://webdav.example.invalid/backups",
          username: "backup-user",
          password: "redacted-password",
          autoSync: false,
        },
      },
      managedSiteType: undefined,
      autoCheckinStatus: null,
      ...baseOverviewInput,
    })

    expect(
      view.configurationOverviewItems.find((item) => item.id === "backupSync"),
    ).toMatchObject({
      status: "configured",
    })
    expect(
      view.configurationOverviewItems
        .find((item) => item.id === "backupSync")
        ?.subItems.map((item) => [
          item.id,
          item.status,
          item.target.menuItemId,
          item.target.params?.anchor,
          item.target.params?.highlight,
        ]),
    ).toEqual([
      [
        "webdavManual",
        "configured",
        MENU_ITEM_IDS.IMPORT_EXPORT,
        WEBDAV_TARGET_IDS.root,
        WEBDAV_TARGET_IDS.root,
      ],
      [
        "webdavAutoSync",
        "disabled",
        MENU_ITEM_IDS.IMPORT_EXPORT,
        WEBDAV_AUTO_SYNC_TARGET_IDS.root,
        WEBDAV_AUTO_SYNC_TARGET_IDS.root,
      ],
    ])
  })

  it("does not count disabled automation settings as configured", () => {
    const view = buildOptionsOverviewViewModel({
      accounts: [autoCheckinReadyAccount],
      displayData: [healthyDisplayData],
      accountStats: emptyStats,
      apiCredentialProfiles: [profile],
      usageStore: emptyUsageStore,
      preferences: {
        ...basePreferences,
        siteAnnouncementNotifications: {
          ...DEFAULT_SITE_ANNOUNCEMENT_PREFERENCES,
          enabled: false,
        },
      },
      managedSiteType: undefined,
      autoCheckinStatus: null,
      ...baseOverviewInput,
    })

    expect(
      view.configurationOverviewItems.find((item) => item.id === "automation"),
    ).toMatchObject({
      status: "configured",
    })
    expect(
      view.configurationOverviewItems
        .find((item) => item.id === "automation")
        ?.subItems.map((item) => [item.id, item.status]),
    ).toEqual([
      ["autoCheckin", "configured"],
      ["siteAnnouncements", "disabled"],
    ])
  })

  it("keeps configured overview subitems pointed at operational pages", () => {
    const view = buildOptionsOverviewViewModel({
      accounts: [autoCheckinReadyAccount],
      displayData: [healthyDisplayData],
      accountStats: {
        ...emptyStats,
        today_total_requests: 3,
      },
      apiCredentialProfiles: [profile],
      usageStore: emptyUsageStore,
      preferences: {
        ...basePreferences,
        usageHistory: {
          ...DEFAULT_PREFERENCES.usageHistory!,
          enabled: true,
        },
        balanceHistory: {
          ...DEFAULT_PREFERENCES.balanceHistory!,
          enabled: true,
        },
        siteAnnouncementNotifications: {
          ...DEFAULT_SITE_ANNOUNCEMENT_PREFERENCES,
          enabled: true,
        },
      },
      managedSiteType: undefined,
      autoCheckinStatus: null,
      ...baseOverviewInput,
    })

    expect(
      view.configurationOverviewItems
        .find((item) => item.id === "automation")
        ?.subItems.map((item) => [item.id, item.status, item.target]),
    ).toEqual([
      ["autoCheckin", "configured", { menuItemId: MENU_ITEM_IDS.AUTO_CHECKIN }],
      [
        "siteAnnouncements",
        "configured",
        { menuItemId: MENU_ITEM_IDS.SITE_ANNOUNCEMENTS },
      ],
    ])
    expect(
      view.configurationOverviewItems
        .find((item) => item.id === "dataHistory")
        ?.subItems.map((item) => [item.id, item.status, item.target]),
    ).toEqual([
      [
        "usageAnalytics",
        "configured",
        { menuItemId: MENU_ITEM_IDS.USAGE_ANALYTICS },
      ],
      [
        "balanceHistory",
        "configured",
        { menuItemId: MENU_ITEM_IDS.BALANCE_HISTORY },
      ],
    ])
  })

  it("requires accounts before marking site announcement polling configured", () => {
    const view = buildOptionsOverviewViewModel({
      accounts: [],
      displayData: [],
      accountStats: emptyStats,
      apiCredentialProfiles: [profile],
      usageStore: emptyUsageStore,
      preferences: {
        ...basePreferences,
        siteAnnouncementNotifications: {
          ...DEFAULT_SITE_ANNOUNCEMENT_PREFERENCES,
          enabled: true,
        },
      },
      managedSiteType: undefined,
      autoCheckinStatus: null,
      ...baseOverviewInput,
    })

    expect(
      view.configurationOverviewItems
        .find((item) => item.id === "automation")
        ?.subItems.find((item) => item.id === "siteAnnouncements"),
    ).toMatchObject({
      status: "needs_setup",
      target: {
        menuItemId: MENU_ITEM_IDS.ACCOUNT,
      },
    })
  })

  it("routes data-history setup gaps caused by missing accounts to account management", () => {
    const view = buildOptionsOverviewViewModel({
      accounts: [],
      displayData: [],
      accountStats: emptyStats,
      apiCredentialProfiles: [profile],
      usageStore: emptyUsageStore,
      preferences: {
        ...basePreferences,
        usageHistory: {
          ...DEFAULT_PREFERENCES.usageHistory!,
          enabled: true,
        },
        balanceHistory: {
          ...DEFAULT_PREFERENCES.balanceHistory!,
          enabled: true,
        },
      },
      managedSiteType: undefined,
      autoCheckinStatus: null,
      ...baseOverviewInput,
    })

    expect(
      view.configurationOverviewItems
        .find((item) => item.id === "dataHistory")
        ?.subItems.map((item) => [item.id, item.status, item.target]),
    ).toEqual([
      ["usageAnalytics", "needs_setup", { menuItemId: MENU_ITEM_IDS.ACCOUNT }],
      ["balanceHistory", "needs_setup", { menuItemId: MENU_ITEM_IDS.ACCOUNT }],
    ])
  })

  it("keeps data-history setup gaps caused by missing data pointed at settings", () => {
    const view = buildOptionsOverviewViewModel({
      accounts: [healthyAccount],
      displayData: [healthyDisplayData],
      accountStats: emptyStats,
      apiCredentialProfiles: [profile],
      usageStore: emptyUsageStore,
      preferences: {
        ...basePreferences,
        usageHistory: {
          ...DEFAULT_PREFERENCES.usageHistory!,
          enabled: true,
        },
        balanceHistory: {
          ...DEFAULT_PREFERENCES.balanceHistory!,
          enabled: true,
        },
      },
      managedSiteType: undefined,
      autoCheckinStatus: null,
      ...baseOverviewInput,
    })

    expect(
      view.configurationOverviewItems
        .find((item) => item.id === "dataHistory")
        ?.subItems.map((item) => [
          item.id,
          item.status,
          item.target.menuItemId,
          item.target.params?.tab,
          item.target.params?.anchor,
        ]),
    ).toEqual([
      [
        "usageAnalytics",
        "needs_setup",
        MENU_ITEM_IDS.BASIC,
        "accountUsage",
        SETTINGS_ANCHORS.USAGE_HISTORY_SYNC,
      ],
      [
        "balanceHistory",
        "configured",
        MENU_ITEM_IDS.BALANCE_HISTORY,
        undefined,
        undefined,
      ],
    ])
  })

  it("requires auto check-in account detection before marking it configured", () => {
    const view = buildOptionsOverviewViewModel({
      accounts: [healthyAccount],
      displayData: [healthyDisplayData],
      accountStats: emptyStats,
      apiCredentialProfiles: [profile],
      usageStore: emptyUsageStore,
      preferences: basePreferences,
      managedSiteType: undefined,
      autoCheckinStatus: null,
      ...baseOverviewInput,
    })

    expect(
      view.configurationOverviewItems
        .find((item) => item.id === "automation")
        ?.subItems.find((item) => item.id === "autoCheckin"),
    ).toMatchObject({
      status: "needs_setup",
      target: {
        menuItemId: MENU_ITEM_IDS.ACCOUNT,
      },
    })
  })

  it("routes disabled automation setup gaps to their settings controls", () => {
    const view = buildOptionsOverviewViewModel({
      accounts: [autoCheckinReadyAccount],
      displayData: [healthyDisplayData],
      accountStats: emptyStats,
      apiCredentialProfiles: [profile],
      usageStore: emptyUsageStore,
      preferences: {
        ...basePreferences,
        autoCheckin: {
          ...basePreferences.autoCheckin,
          globalEnabled: false,
        },
        siteAnnouncementNotifications: {
          ...DEFAULT_SITE_ANNOUNCEMENT_PREFERENCES,
          enabled: false,
        },
      },
      managedSiteType: undefined,
      autoCheckinStatus: null,
      ...baseOverviewInput,
    })

    expect(
      view.configurationOverviewItems
        .find((item) => item.id === "automation")
        ?.subItems.map((item) => [item.id, item.status, item.target]),
    ).toEqual([
      [
        "autoCheckin",
        "disabled",
        {
          menuItemId: MENU_ITEM_IDS.BASIC,
          params: {
            tab: "checkinRedeem",
            anchor: SETTINGS_ANCHORS.AUTO_CHECKIN,
            highlight: SETTINGS_ANCHORS.AUTO_CHECKIN,
          },
        },
      ],
      [
        "siteAnnouncements",
        "disabled",
        {
          menuItemId: MENU_ITEM_IDS.BASIC,
          params: {
            tab: "general",
            anchor: SETTINGS_ANCHORS.SITE_ANNOUNCEMENT_NOTIFICATIONS_ENABLED,
            highlight: SETTINGS_ANCHORS.SITE_ANNOUNCEMENT_NOTIFICATIONS_ENABLED,
          },
        },
      ],
    ])
  })

  it("requires managed-site connection settings before marking managed features configured", () => {
    const incompleteView = buildOptionsOverviewViewModel({
      accounts: [healthyAccount],
      displayData: [healthyDisplayData],
      accountStats: emptyStats,
      apiCredentialProfiles: [profile],
      usageStore: emptyUsageStore,
      preferences: basePreferences,
      managedSiteType: SITE_TYPES.NEW_API,
      autoCheckinStatus: null,
      ...baseOverviewInput,
    })

    expect(
      incompleteView.configurationOverviewItems.find(
        (item) => item.id === "managedSite",
      ),
    ).toMatchObject({
      status: "needs_setup",
      isVisible: true,
    })
    expect(
      incompleteView.configurationOverviewItems
        .find((item) => item.id === "managedSite")
        ?.subItems.map((item) => [
          item.id,
          item.status,
          item.target.menuItemId,
          item.target.params?.tab,
          item.target.params?.anchor,
          item.target.params?.highlight,
        ]),
    ).toEqual([
      [
        "managedSiteChannels",
        "needs_setup",
        MENU_ITEM_IDS.BASIC,
        "managedSite",
        SETTINGS_ANCHORS.MANAGED_SITE_SELECTOR,
        SETTINGS_ANCHORS.MANAGED_SITE_SELECTOR,
      ],
      [
        "managedSiteModelSync",
        "needs_setup",
        MENU_ITEM_IDS.BASIC,
        "managedSite",
        SETTINGS_ANCHORS.MANAGED_SITE_SELECTOR,
        SETTINGS_ANCHORS.MANAGED_SITE_SELECTOR,
      ],
    ])

    const configuredView = buildOptionsOverviewViewModel({
      accounts: [healthyAccount],
      displayData: [healthyDisplayData],
      accountStats: emptyStats,
      apiCredentialProfiles: [profile],
      usageStore: emptyUsageStore,
      preferences: {
        ...basePreferences,
        newApi: {
          ...basePreferences.newApi,
          baseUrl: "https://managed.example.invalid",
          adminToken: "redacted-admin-token",
          userId: "1",
        },
      },
      managedSiteType: SITE_TYPES.NEW_API,
      autoCheckinStatus: null,
      ...baseOverviewInput,
    })

    expect(
      configuredView.configurationOverviewItems.find(
        (item) => item.id === "managedSite",
      ),
    ).toMatchObject({
      status: "configured",
    })
    expect(
      configuredView.configurationOverviewItems
        .find((item) => item.id === "managedSite")
        ?.subItems.map((item) => [
          item.id,
          item.status,
          item.target.menuItemId,
          item.target.params?.tab,
          item.target.params?.anchor,
          item.target.params?.highlight,
        ]),
    ).toEqual([
      [
        "managedSiteChannels",
        "configured",
        MENU_ITEM_IDS.MANAGED_SITE_CHANNELS,
        undefined,
        undefined,
        undefined,
      ],
      [
        "managedSiteModelSync",
        "disabled",
        MENU_ITEM_IDS.BASIC,
        "managedSite",
        SETTINGS_ANCHORS.MANAGED_SITE_MODEL_SYNC,
        SETTINGS_ANCHORS.MANAGED_SITE_MODEL_SYNC,
      ],
    ])
  })

  it("requires a valid managed-site admin user id before marking standard managed sites configured", () => {
    const view = buildOptionsOverviewViewModel({
      accounts: [healthyAccount],
      displayData: [healthyDisplayData],
      accountStats: emptyStats,
      apiCredentialProfiles: [profile],
      usageStore: emptyUsageStore,
      preferences: {
        ...basePreferences,
        newApi: {
          ...basePreferences.newApi,
          baseUrl: "https://managed.example.invalid",
          adminToken: "redacted-admin-token",
          userId: "admin",
        },
      },
      managedSiteType: SITE_TYPES.NEW_API,
      autoCheckinStatus: null,
      ...baseOverviewInput,
    })

    expect(
      view.configurationOverviewItems.find((item) => item.id === "managedSite"),
    ).toMatchObject({
      status: "needs_setup",
    })
    expect(
      view.configurationOverviewItems
        .find((item) => item.id === "managedSite")
        ?.subItems.map((item) => [item.id, item.status]),
    ).toEqual([
      ["managedSiteChannels", "needs_setup"],
      ["managedSiteModelSync", "needs_setup"],
    ])
  })

  it("does not surface model sync as available for managed sites without sync support", () => {
    const view = buildOptionsOverviewViewModel({
      accounts: [healthyAccount],
      displayData: [healthyDisplayData],
      accountStats: emptyStats,
      apiCredentialProfiles: [profile],
      usageStore: emptyUsageStore,
      preferences: {
        ...basePreferences,
        axonHub: {
          baseUrl: "https://axon.example.invalid",
          email: "admin@example.invalid",
          password: "redacted-password",
        },
        managedSiteModelSync: {
          ...DEFAULT_PREFERENCES.managedSiteModelSync!,
          enabled: true,
        },
      },
      managedSiteType: SITE_TYPES.AXON_HUB,
      autoCheckinStatus: null,
      ...baseOverviewInput,
    })

    expect(view.automationOverview.items.map((item) => item.id)).not.toContain(
      "managedSiteModelSync",
    )
    expect(
      view.configurationOverviewItems
        .find((item) => item.id === "managedSite")
        ?.subItems.map((item) => [item.id, item.status]),
    ).toEqual([
      ["managedSiteChannels", "configured"],
      ["managedSiteModelSync", "not_applicable"],
    ])
  })
})
