import { beforeEach, describe, expect, it, vi } from "vitest"

import { SITE_TYPES } from "~/constants/siteType"
import {
  createDefaultPreferences,
  type UserPreferences,
} from "~/services/preferences/userPreferences"
import { DEFAULT_SORTING_PRIORITY_CONFIG } from "~/services/preferences/utils/sortingPriority"
import {
  PRODUCT_ANALYTICS_AUTO_CHECKIN_SCHEDULE_MODES,
  PRODUCT_ANALYTICS_ENTRYPOINTS,
  PRODUCT_ANALYTICS_EVENTS,
  PRODUCT_ANALYTICS_MODE_IDS,
  PRODUCT_ANALYTICS_SETTING_IDS,
  PRODUCT_ANALYTICS_SORT_FIELDS,
  trackProductAnalyticsEvent,
} from "~/services/productAnalytics/events"
import {
  buildAggregateSettingsSnapshotEvent,
  buildSettingsSnapshotEvents,
  trackSettingsSnapshotEvents,
} from "~/services/productAnalytics/settings"
import { AUTO_CHECKIN_SCHEDULE_MODE } from "~/types/autoCheckin"
import { SortingCriteriaType } from "~/types/sorting"
import { USAGE_HISTORY_SCHEDULE_MODE } from "~/types/usageHistory"
import { WEBDAV_SYNC_STRATEGIES } from "~/types/webdav"

vi.mock("~/services/productAnalytics/events", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("~/services/productAnalytics/events")>()

  return {
    ...actual,
    trackProductAnalyticsEvent: vi.fn(),
  }
})

const trackProductAnalyticsEventMock = vi.mocked(trackProductAnalyticsEvent)

function createPreferences(
  overrides: Partial<UserPreferences> = {},
): UserPreferences {
  return {
    ...createDefaultPreferences(1_700_000_000_000),
    ...overrides,
  }
}

describe("settings product analytics snapshots", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("builds broad privacy-safe settings snapshots for development insights", () => {
    const preferences = createPreferences({
      themeMode: "dark",
      language: "zh-Hant-TW",
      actionClickBehavior: "sidepanel",
      openChangelogOnUpdate: false,
      activeTab: "balance",
      currencyType: "CNY",
      showTodayCashflow: false,
      sortField: "income",
      sortOrder: "asc",
      sortingPriorityConfig: {
        criteria: [
          {
            id: SortingCriteriaType.USER_SORT_FIELD,
            enabled: true,
            priority: 0,
          },
          {
            id: SortingCriteriaType.PINNED,
            enabled: false,
            priority: 1,
          },
        ],
        lastModified: 1_700_000_000_000,
      },
      logging: {
        consoleEnabled: false,
        level: "warn",
      },
      autoFillCurrentSiteUrlOnAccountAdd: true,
      autoProvisionKeyOnAccountAdd: true,
      warnOnDuplicateAccountAdd: false,
      accountAutoRefresh: {
        enabled: true,
        interval: 3_600_000,
        minInterval: 300_000,
        refreshOnOpen: true,
      },
      usageHistory: {
        enabled: true,
        retentionDays: 30,
        scheduleMode: USAGE_HISTORY_SCHEDULE_MODE.ALARM,
        syncIntervalMinutes: 720,
      },
      balanceHistory: {
        enabled: true,
        endOfDayCapture: { enabled: true },
        retentionDays: 730,
        estimatedTodayIncome: { enabled: true },
      },
      newApi: {
        baseUrl: "https://private-new-api.example",
        adminToken: "sk-private",
        userId: "42",
        username: "admin@example.com",
        password: "secret",
        totpSecret: "totp",
      },
      doneHub: {
        baseUrl: "https://donehub.example",
        adminToken: "private-token",
        userId: "7",
      },
      veloera: {
        baseUrl: "https://veloera.example",
        adminToken: "veloera-token",
        userId: "8",
      },
      managedSiteType: SITE_TYPES.DONE_HUB,
      managedSiteModelSync: {
        enabled: true,
        interval: 2 * 60 * 60 * 1000,
        concurrency: 6,
        maxRetries: 4,
        channelProcessingTimeout: 600,
        rateLimit: {
          requestsPerMinute: 90,
          burst: 12,
        },
        allowedModels: ["private-model-a", "private-model-b"],
        globalChannelModelFilters: [
          {
            id: "filter-1",
            name: "Private filter",
            kind: "pattern",
            pattern: "private-model",
            isRegex: false,
            action: "include",
            enabled: true,
            createdAt: 1,
            updatedAt: 1,
          },
        ],
      },
      autoCheckin: {
        globalEnabled: true,
        pretriggerDailyOnUiOpen: true,
        notifyUiOnCompletion: false,
        windowStart: "08:00",
        windowEnd: "12:00",
        scheduleMode: AUTO_CHECKIN_SCHEDULE_MODE.DETERMINISTIC,
        deterministicTime: "09:30",
        retryStrategy: {
          enabled: true,
          intervalMinutes: 45,
          maxAttemptsPerDay: 4,
        },
      },
      modelRedirect: {
        enabled: true,
        standardModels: ["private-standard-a"],
        pruneMissingTargetsOnModelSync: true,
      },
      redemptionAssist: {
        enabled: true,
        contextMenu: { enabled: false },
        relaxedCodeValidation: true,
        urlWhitelist: {
          enabled: true,
          patterns: ["https://private.example/redeem"],
          includeAccountSiteUrls: true,
          includeCheckInAndRedeemUrls: false,
        },
      },
      webAiApiCheck: {
        enabled: true,
        contextMenu: { enabled: true },
        autoDetect: {
          enabled: true,
          enhanced: { enabled: true },
          urlWhitelist: {
            patterns: ["https://private.example/api-keys"],
          },
        },
      },
      tempWindowFallback: {
        enabled: true,
        useInPopup: true,
        useInSidePanel: false,
        useInOptions: true,
        useForAutoRefresh: true,
        useForManualRefresh: false,
        tempContextMode: "window",
      },
      tempWindowFallbackReminder: {
        dismissed: true,
      },
      webdav: {
        url: "https://dav.example/private",
        username: "private-user",
        password: "private-password",
        backupEncryptionEnabled: true,
        backupEncryptionPassword: "private-encryption-password",
        autoSync: true,
        syncInterval: 7_200,
        syncStrategy: WEBDAV_SYNC_STRATEGIES.DOWNLOAD_ONLY,
        syncData: {
          accounts: true,
          bookmarks: false,
          apiCredentialProfiles: true,
          preferences: false,
        },
      },
      taskNotifications: {
        enabled: true,
        tasks: {
          autoCheckin: true,
          webdavAutoSync: true,
          managedSiteModelSync: true,
          usageHistorySync: false,
          balanceHistoryCapture: false,
          siteAnnouncements: true,
        },
        channels: {
          browser: { enabled: true },
          telegram: {
            enabled: true,
            botToken: "private-bot-token",
            chatId: "private-chat",
          },
          feishu: { enabled: false, webhookKey: "" },
          dingtalk: {
            enabled: false,
            webhookKey: "",
            secret: "",
          },
          wecom: { enabled: false, webhookKey: "" },
          ntfy: {
            enabled: true,
            topicUrl: "https://ntfy.example/topic",
            accessToken: "private-ntfy-token",
          },
          webhook: { enabled: true, url: "https://webhook.example" },
        },
      },
      siteAnnouncementNotifications: {
        enabled: true,
        notificationEnabled: false,
        intervalMinutes: 1_440,
      },
    })

    const events = buildSettingsSnapshotEvents(
      preferences,
      PRODUCT_ANALYTICS_ENTRYPOINTS.Options,
    )

    expect(events).toEqual([
      {
        setting_id: "app_preferences_snapshot",
        entrypoint: PRODUCT_ANALYTICS_ENTRYPOINTS.Options,
        theme_mode: "dark",
        normalized_language: "zh-TW",
        toolbar_action_click_behavior: "sidepanel",
        open_changelog_on_update_enabled: false,
      },
      {
        setting_id: "display_preferences_snapshot",
        entrypoint: PRODUCT_ANALYTICS_ENTRYPOINTS.Options,
        active_tab: "balance",
        currency_type: "CNY",
        show_today_cashflow_enabled: false,
        sort_field: "income",
        sort_order: "asc",
        sorting_priority_configured: true,
        sorting_priority_customized: true,
        sorting_priority_enabled_criteria_count: 1,
      },
      {
        setting_id: PRODUCT_ANALYTICS_SETTING_IDS.AccountBehaviorSnapshot,
        entrypoint: PRODUCT_ANALYTICS_ENTRYPOINTS.Options,
        auto_provision_key_on_account_add_enabled: true,
        auto_fill_current_site_url_on_account_add_enabled: true,
        warn_on_duplicate_account_add_enabled: false,
        show_today_cashflow_enabled: false,
        show_health_status_enabled: true,
      },
      {
        setting_id: "logging_preferences_snapshot",
        entrypoint: PRODUCT_ANALYTICS_ENTRYPOINTS.Options,
        console_logging_enabled: false,
        log_level: "warn",
      },
      {
        setting_id: PRODUCT_ANALYTICS_SETTING_IDS.AutoRefreshConfigSnapshot,
        entrypoint: PRODUCT_ANALYTICS_ENTRYPOINTS.Options,
        enabled: true,
        refresh_on_open_enabled: true,
        refresh_interval_minutes: 60,
        min_refresh_interval_seconds: 300,
      },
      {
        setting_id: PRODUCT_ANALYTICS_SETTING_IDS.UsageHistoryConfigSnapshot,
        entrypoint: PRODUCT_ANALYTICS_ENTRYPOINTS.Options,
        enabled: true,
        mode: PRODUCT_ANALYTICS_MODE_IDS.UsageHistoryAlarm,
        sync_interval_minutes: 720,
        retention_days: 30,
      },
      {
        setting_id: PRODUCT_ANALYTICS_SETTING_IDS.BalanceHistoryConfigSnapshot,
        entrypoint: PRODUCT_ANALYTICS_ENTRYPOINTS.Options,
        enabled: true,
        end_of_day_capture_enabled: true,
        estimated_today_income_enabled: true,
        retention_days: 730,
      },
      {
        setting_id: PRODUCT_ANALYTICS_SETTING_IDS.ManagedSiteConfigSnapshot,
        entrypoint: PRODUCT_ANALYTICS_ENTRYPOINTS.Options,
        managed_site_type: SITE_TYPES.DONE_HUB,
        new_api_configured: true,
        done_hub_configured: true,
        veloera_configured: true,
        octopus_configured: false,
        axon_hub_configured: false,
        claude_code_hub_configured: false,
        cli_proxy_configured: false,
        claude_code_router_configured: false,
      },
      {
        setting_id:
          PRODUCT_ANALYTICS_SETTING_IDS.ManagedSiteModelSyncConfigSnapshot,
        entrypoint: PRODUCT_ANALYTICS_ENTRYPOINTS.Options,
        enabled: true,
        sync_interval_minutes: 120,
        concurrency: 6,
        retry_max_attempts: 4,
        channel_timeout_seconds: 600,
        rate_limit_rpm: 90,
        rate_limit_burst: 12,
        allowed_models_configured: true,
        global_filters_configured: true,
      },
      {
        setting_id: PRODUCT_ANALYTICS_SETTING_IDS.AutoCheckinConfigSnapshot,
        entrypoint: PRODUCT_ANALYTICS_ENTRYPOINTS.Options,
        global_enabled: true,
        ui_pretrigger_enabled: true,
        notify_completion_enabled: false,
        retry_enabled: true,
        schedule_mode:
          PRODUCT_ANALYTICS_AUTO_CHECKIN_SCHEDULE_MODES.Deterministic,
        retry_interval_minutes: 45,
        retry_max_attempts: 4,
        window_length_minutes: 240,
        deterministic_time_minutes: 570,
      },
      {
        setting_id: PRODUCT_ANALYTICS_SETTING_IDS.ModelRedirectConfigSnapshot,
        entrypoint: PRODUCT_ANALYTICS_ENTRYPOINTS.Options,
        enabled: true,
        standard_models_configured: true,
        prune_missing_targets_on_model_sync_enabled: true,
      },
      {
        setting_id:
          PRODUCT_ANALYTICS_SETTING_IDS.RedemptionAssistConfigSnapshot,
        entrypoint: PRODUCT_ANALYTICS_ENTRYPOINTS.Options,
        enabled: true,
        context_menu_enabled: false,
        relaxed_code_validation_enabled: true,
        url_whitelist_enabled: true,
        url_whitelist_patterns_configured: true,
        url_whitelist_account_urls_enabled: true,
        url_whitelist_checkin_redeem_urls_enabled: false,
      },
      {
        setting_id: PRODUCT_ANALYTICS_SETTING_IDS.WebAiApiCheckConfigSnapshot,
        entrypoint: PRODUCT_ANALYTICS_ENTRYPOINTS.Options,
        enabled: true,
        context_menu_enabled: true,
        auto_detect_enabled: true,
        auto_detect_enhanced_enabled: true,
        auto_detect_url_patterns_configured: true,
      },
      {
        setting_id:
          PRODUCT_ANALYTICS_SETTING_IDS.TempWindowFallbackConfigSnapshot,
        entrypoint: PRODUCT_ANALYTICS_ENTRYPOINTS.Options,
        enabled: true,
        popup_enabled: true,
        sidepanel_enabled: false,
        options_enabled: true,
        auto_refresh_enabled: true,
        manual_refresh_enabled: false,
        mode: PRODUCT_ANALYTICS_MODE_IDS.TempWindowModeWindow,
        reminder_dismissed: true,
      },
      {
        setting_id: PRODUCT_ANALYTICS_SETTING_IDS.WebDavConfigSnapshot,
        entrypoint: PRODUCT_ANALYTICS_ENTRYPOINTS.Options,
        configured: true,
        auto_sync_enabled: true,
        backup_encryption_enabled: true,
        sync_strategy: PRODUCT_ANALYTICS_MODE_IDS.WebDavDownloadOnly,
        sync_interval_minutes: 120,
        sync_accounts_enabled: true,
        sync_bookmarks_enabled: false,
        sync_api_profiles_enabled: true,
        sync_preferences_enabled: false,
      },
      {
        setting_id:
          PRODUCT_ANALYTICS_SETTING_IDS.TaskNotificationsConfigSnapshot,
        entrypoint: PRODUCT_ANALYTICS_ENTRYPOINTS.Options,
        enabled: true,
        browser_channel_enabled: true,
        telegram_channel_enabled: true,
        feishu_channel_enabled: false,
        dingtalk_channel_enabled: false,
        wecom_channel_enabled: false,
        ntfy_channel_enabled: true,
        webhook_channel_enabled: true,
        auto_checkin_task_enabled: true,
        webdav_auto_sync_task_enabled: true,
        managed_site_model_sync_task_enabled: true,
        usage_history_sync_task_enabled: false,
        balance_history_capture_task_enabled: false,
        site_announcements_task_enabled: true,
        third_party_channel_count: 3,
        task_enabled_count: 4,
      },
      {
        setting_id:
          PRODUCT_ANALYTICS_SETTING_IDS.SiteAnnouncementsConfigSnapshot,
        entrypoint: PRODUCT_ANALYTICS_ENTRYPOINTS.Options,
        enabled: true,
        notification_enabled: false,
        polling_interval_minutes: 1440,
      },
    ])

    expect(JSON.stringify(events)).not.toContain("private")
    expect(JSON.stringify(events)).not.toContain("https://")
    expect(JSON.stringify(events)).not.toContain("secret")
  })

  it("builds one aggregate settings snapshot with module-prefixed fields", () => {
    const snapshot = buildAggregateSettingsSnapshotEvent(
      createPreferences({
        accountAutoRefresh: {
          enabled: true,
          refreshOnOpen: true,
          interval: 3_600_000,
          minInterval: 300_000,
        },
        webdav: {
          ...createPreferences().webdav,
          url: "https://dav.example/private",
          username: "private-user",
          autoSync: true,
        },
        autoCheckin: {
          ...createPreferences().autoCheckin!,
          globalEnabled: false,
        },
      }),
      PRODUCT_ANALYTICS_ENTRYPOINTS.Background,
    )

    expect(snapshot).toEqual(
      expect.objectContaining({
        entrypoint: PRODUCT_ANALYTICS_ENTRYPOINTS.Background,
        theme_mode: "system",
        normalized_language: "en",
        toolbar_action_click_behavior: "popup",
        open_changelog_on_update_enabled: true,
        active_tab: "cashflow",
        currency_type: "USD",
        sort_field: "balance",
        sort_order: "desc",
        account_auto_refresh_enabled: true,
        account_auto_refresh_on_open_enabled: true,
        webdav_configured: true,
        webdav_auto_sync_enabled: true,
        auto_checkin_global_enabled: false,
      }),
    )
    expect(snapshot).not.toHaveProperty("setting_id")
    expect(JSON.stringify(snapshot)).not.toContain("private")
    expect(JSON.stringify(snapshot)).not.toContain("https://")
  })

  it("preserves options-page toolbar behavior in settings snapshots", () => {
    const preferences = createPreferences({
      actionClickBehavior: "options",
    })

    const [appSnapshot] = buildSettingsSnapshotEvents(
      preferences,
      PRODUCT_ANALYTICS_ENTRYPOINTS.Options,
      { actionClickBehavior: "options" },
    )
    const aggregateSnapshot = buildAggregateSettingsSnapshotEvent(
      preferences,
      PRODUCT_ANALYTICS_ENTRYPOINTS.Background,
    )

    expect(appSnapshot).toEqual(
      expect.objectContaining({
        toolbar_action_click_behavior: "options",
      }),
    )
    expect(aggregateSnapshot).toEqual(
      expect.objectContaining({
        toolbar_action_click_behavior: "options",
      }),
    )
  })

  it("reports cleared display sort as none in settings snapshots", () => {
    const preferences = createPreferences({ sortField: null })

    const [displaySnapshot] = buildSettingsSnapshotEvents(
      preferences,
      PRODUCT_ANALYTICS_ENTRYPOINTS.Options,
      { sortField: null },
    )
    const aggregateSnapshot = buildAggregateSettingsSnapshotEvent(
      preferences,
      PRODUCT_ANALYTICS_ENTRYPOINTS.Background,
    )

    expect(displaySnapshot).toEqual(
      expect.objectContaining({
        setting_id: "display_preferences_snapshot",
        sort_field: PRODUCT_ANALYTICS_SORT_FIELDS.None,
      }),
    )
    expect(aggregateSnapshot).toEqual(
      expect.objectContaining({
        sort_field: PRODUCT_ANALYTICS_SORT_FIELDS.None,
      }),
    )
  })

  it("tracks only affected snapshots for a preference patch", () => {
    const preferences = createPreferences()

    trackSettingsSnapshotEvents(
      preferences,
      PRODUCT_ANALYTICS_ENTRYPOINTS.Options,
      {
        accountAutoRefresh: { enabled: true },
        language: "ja-JP",
        logging: { consoleEnabled: true },
        webdav: { autoSync: true },
      },
    )

    expect(trackProductAnalyticsEventMock).toHaveBeenCalledTimes(4)
    expect(trackProductAnalyticsEventMock).toHaveBeenNthCalledWith(
      1,
      PRODUCT_ANALYTICS_EVENTS.SettingsSnapshotCaptured,
      expect.objectContaining({
        setting_id: "app_preferences_snapshot",
      }),
    )
    expect(trackProductAnalyticsEventMock).toHaveBeenNthCalledWith(
      2,
      PRODUCT_ANALYTICS_EVENTS.SettingsSnapshotCaptured,
      expect.objectContaining({
        setting_id: "logging_preferences_snapshot",
      }),
    )
    expect(trackProductAnalyticsEventMock).toHaveBeenNthCalledWith(
      3,
      PRODUCT_ANALYTICS_EVENTS.SettingsSnapshotCaptured,
      expect.objectContaining({
        setting_id: PRODUCT_ANALYTICS_SETTING_IDS.AutoRefreshConfigSnapshot,
      }),
    )
    expect(trackProductAnalyticsEventMock).toHaveBeenNthCalledWith(
      4,
      PRODUCT_ANALYTICS_EVENTS.SettingsSnapshotCaptured,
      expect.objectContaining({
        setting_id: PRODUCT_ANALYTICS_SETTING_IDS.WebDavConfigSnapshot,
      }),
    )
  })

  it("reports millisecond auto-refresh intervals as exact minutes and seconds", () => {
    const [autoRefreshSnapshot] = buildSettingsSnapshotEvents(
      createPreferences({
        accountAutoRefresh: {
          enabled: true,
          refreshOnOpen: false,
          interval: 600_000,
          minInterval: 5_000,
        },
      }),
      PRODUCT_ANALYTICS_ENTRYPOINTS.Options,
      { accountAutoRefresh: { interval: 600_000 } },
    )

    expect(autoRefreshSnapshot).toEqual(
      expect.objectContaining({
        setting_id: PRODUCT_ANALYTICS_SETTING_IDS.AutoRefreshConfigSnapshot,
        refresh_interval_minutes: 10,
        min_refresh_interval_seconds: 5,
      }),
    )
  })

  it("reports boundary settings and legacy managed-site sync preferences exactly", () => {
    const events = buildSettingsSnapshotEvents(
      createPreferences({
        accountAutoRefresh: {
          enabled: true,
          refreshOnOpen: false,
          interval: 25 * 60 * 60 * 1000,
          minInterval: 90 * 60 * 1000,
        },
        usageHistory: {
          enabled: true,
          scheduleMode: USAGE_HISTORY_SCHEDULE_MODE.MANUAL,
          syncIntervalMinutes: Number.NaN,
          retentionDays: 400,
        },
        managedSiteType: "custom-site" as UserPreferences["managedSiteType"],
        managedSiteModelSync: undefined,
        newApiModelSync: {
          enabled: true,
          interval: 15 * 60 * 1000,
          concurrency: 0,
          maxRetries: 1,
          channelProcessingTimeout: 0,
          rateLimit: {
            requestsPerMinute: 10,
            burst: 0,
          },
          allowedModels: [],
          globalChannelModelFilters: [],
        },
        webdav: {
          ...createPreferences().webdav,
          syncStrategy: WEBDAV_SYNC_STRATEGIES.UPLOAD_ONLY,
        },
      }),
      PRODUCT_ANALYTICS_ENTRYPOINTS.Options,
      {
        accountAutoRefresh: {},
        usageHistory: {},
        managedSiteType: "custom-site" as UserPreferences["managedSiteType"],
        newApiModelSync: {},
        webdav: {},
      },
    )

    expect(events).toEqual([
      expect.objectContaining({
        setting_id: PRODUCT_ANALYTICS_SETTING_IDS.AutoRefreshConfigSnapshot,
        refresh_interval_minutes: 1500,
        min_refresh_interval_seconds: 5400,
      }),
      expect.objectContaining({
        setting_id: PRODUCT_ANALYTICS_SETTING_IDS.UsageHistoryConfigSnapshot,
        mode: PRODUCT_ANALYTICS_MODE_IDS.UsageHistoryManual,
        sync_interval_minutes: 0,
        retention_days: 400,
      }),
      expect.objectContaining({
        setting_id: PRODUCT_ANALYTICS_SETTING_IDS.ManagedSiteConfigSnapshot,
        managed_site_type: SITE_TYPES.NEW_API,
      }),
      expect.objectContaining({
        setting_id:
          PRODUCT_ANALYTICS_SETTING_IDS.ManagedSiteModelSyncConfigSnapshot,
        sync_interval_minutes: 15,
        concurrency: 0,
        retry_max_attempts: 1,
        channel_timeout_seconds: 0,
        rate_limit_rpm: 10,
        rate_limit_burst: 0,
        allowed_models_configured: false,
        global_filters_configured: false,
      }),
      expect.objectContaining({
        setting_id: PRODUCT_ANALYTICS_SETTING_IDS.WebDavConfigSnapshot,
        sync_strategy: PRODUCT_ANALYTICS_MODE_IDS.WebDavUploadOnly,
      }),
    ])
  })

  it("treats default sorting priority as not customized", () => {
    const [displaySnapshot] = buildSettingsSnapshotEvents(
      createPreferences({
        sortingPriorityConfig: {
          criteria: DEFAULT_SORTING_PRIORITY_CONFIG.criteria,
          lastModified: 1,
        },
      }),
      PRODUCT_ANALYTICS_ENTRYPOINTS.Options,
      { sortingPriorityConfig: {} },
    )

    expect(displaySnapshot).toEqual(
      expect.objectContaining({
        setting_id: "display_preferences_snapshot",
        sorting_priority_configured: true,
        sorting_priority_customized: false,
      }),
    )
  })

  it("uses default balance history and temp-window reminder preferences when sections are missing", () => {
    const events = buildSettingsSnapshotEvents(
      createPreferences({
        balanceHistory: undefined,
        tempWindowFallbackReminder: undefined,
      }),
      PRODUCT_ANALYTICS_ENTRYPOINTS.Options,
      {
        balanceHistory: {},
        tempWindowFallback: {},
      },
    )

    expect(events).toEqual([
      expect.objectContaining({
        setting_id: PRODUCT_ANALYTICS_SETTING_IDS.BalanceHistoryConfigSnapshot,
        enabled: false,
      }),
      expect.objectContaining({
        setting_id:
          PRODUCT_ANALYTICS_SETTING_IDS.TempWindowFallbackConfigSnapshot,
        reminder_dismissed: false,
      }),
    ])
  })

  it("resolves patch keys and exact numeric fields for targeted snapshots", () => {
    const preferences = createPreferences({
      usageHistory: {
        enabled: false,
        scheduleMode: USAGE_HISTORY_SCHEDULE_MODE.AFTER_REFRESH,
        syncIntervalMinutes: 30,
        retentionDays: 7,
      },
      balanceHistory: {
        enabled: true,
        endOfDayCapture: { enabled: false },
        retentionDays: 365,
        estimatedTodayIncome: { enabled: false },
      },
      managedSiteModelSync: {
        enabled: true,
        interval: 3 * 60 * 60 * 1000,
        concurrency: 12,
        maxRetries: Number.NaN,
        channelProcessingTimeout: 5_700,
        rateLimit: {
          requestsPerMinute: 60,
          burst: 0,
        },
        allowedModels: [],
        globalChannelModelFilters: [],
      },
      sortingPriorityConfig: {
        criteria: [],
        lastModified: 1,
      },
      tempWindowFallback: {
        enabled: true,
        useInPopup: false,
        useInSidePanel: true,
        useInOptions: false,
        useForAutoRefresh: false,
        useForManualRefresh: true,
        tempContextMode: "tab",
      },
    })

    const events = buildSettingsSnapshotEvents(
      preferences,
      PRODUCT_ANALYTICS_ENTRYPOINTS.Options,
      {
        themeMode: "dark",
        activeTab: "balance",
        sortingPriorityConfig: {},
        showHealthStatus: true,
        balanceHistory: {},
        modelRedirect: {},
        redemptionAssist: {},
        webAiApiCheck: {},
        tempWindowFallback: {},
        taskNotifications: {},
        siteAnnouncementNotifications: {},
      },
    )

    expect(events).toEqual([
      expect.objectContaining({
        setting_id: "app_preferences_snapshot",
      }),
      expect.objectContaining({
        setting_id: "display_preferences_snapshot",
        sorting_priority_configured: true,
      }),
      expect.objectContaining({
        setting_id: PRODUCT_ANALYTICS_SETTING_IDS.AccountBehaviorSnapshot,
      }),
      expect.objectContaining({
        setting_id: PRODUCT_ANALYTICS_SETTING_IDS.BalanceHistoryConfigSnapshot,
        retention_days: 365,
      }),
      expect.objectContaining({
        setting_id: PRODUCT_ANALYTICS_SETTING_IDS.ModelRedirectConfigSnapshot,
      }),
      expect.objectContaining({
        setting_id:
          PRODUCT_ANALYTICS_SETTING_IDS.RedemptionAssistConfigSnapshot,
      }),
      expect.objectContaining({
        setting_id: PRODUCT_ANALYTICS_SETTING_IDS.WebAiApiCheckConfigSnapshot,
      }),
      expect.objectContaining({
        setting_id:
          PRODUCT_ANALYTICS_SETTING_IDS.TempWindowFallbackConfigSnapshot,
        mode: PRODUCT_ANALYTICS_MODE_IDS.TempWindowModeTab,
      }),
      expect.objectContaining({
        setting_id:
          PRODUCT_ANALYTICS_SETTING_IDS.TaskNotificationsConfigSnapshot,
      }),
      expect.objectContaining({
        setting_id:
          PRODUCT_ANALYTICS_SETTING_IDS.SiteAnnouncementsConfigSnapshot,
      }),
    ])

    const [usageSnapshot, syncSnapshot] = buildSettingsSnapshotEvents(
      preferences,
      PRODUCT_ANALYTICS_ENTRYPOINTS.Options,
      {
        usageHistory: {},
        managedSiteModelSync: {},
      },
    )

    expect(usageSnapshot).toEqual(
      expect.objectContaining({
        mode: PRODUCT_ANALYTICS_MODE_IDS.UsageHistoryAfterRefresh,
        retention_days: 7,
      }),
    )
    expect(syncSnapshot).toEqual(
      expect.objectContaining({
        sync_interval_minutes: 180,
        concurrency: 12,
        retry_max_attempts: 0,
        channel_timeout_seconds: 5_700,
        rate_limit_rpm: 60,
      }),
    )
  })
})
