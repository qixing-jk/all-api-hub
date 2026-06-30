/* eslint-disable jsdoc/require-jsdoc */
import { SITE_TYPES } from "~/constants/siteType"
import {
  DEFAULT_PREFERENCES,
  TOOLBAR_ACTION_CLICK_BEHAVIORS,
  type RedemptionAssistPreferences,
  type TempWindowFallbackPreferences,
  type TempWindowFallbackReminderPreferences,
  type UserPreferences,
  type WebAiApiCheckPreferences,
} from "~/services/preferences/userPreferences"
import { DEFAULT_SORTING_PRIORITY_CONFIG } from "~/services/preferences/utils/sortingPriority"
import type { BalanceHistoryPreferences } from "~/types/dailyBalanceHistory"
import type { ModelRedirectPreferences } from "~/types/managedSiteModelRedirect"
import { normalizeSiteAnnouncementPreferences } from "~/types/siteAnnouncements"
import type { SortingPriorityConfig } from "~/types/sorting"
import {
  normalizeTaskNotificationPreferences,
  TASK_NOTIFICATION_CHANNELS,
  TASK_NOTIFICATION_TASKS,
} from "~/types/taskNotifications"
import { USAGE_HISTORY_SCHEDULE_MODE } from "~/types/usageHistory"
import type { DeepPartial } from "~/types/utils"
import { resolveWebdavSyncDataSelection } from "~/types/webdav"
import { deepOverride } from "~/utils"
import { normalizeAppLanguage } from "~/utils/i18n/language"

import { buildAutoCheckinConfigSnapshotProperties } from "./autoCheckin"
import {
  PRODUCT_ANALYTICS_EVENTS,
  PRODUCT_ANALYTICS_MODE_IDS,
  PRODUCT_ANALYTICS_SETTING_IDS,
  PRODUCT_ANALYTICS_SORT_FIELDS,
  type ProductAnalyticsEntrypoint,
  type ProductAnalyticsEventPayload,
  type ProductAnalyticsManagedSiteType,
  type ProductAnalyticsModeId,
} from "./contracts"
import { trackProductAnalyticsEvent } from "./dispatch"
import { getWebdavSyncStrategyMode } from "./webDavSync"

type SettingChangedPayload = ProductAnalyticsEventPayload<
  typeof PRODUCT_ANALYTICS_EVENTS.SettingChanged
>
type SettingsSnapshotCapturedPayload = ProductAnalyticsEventPayload<
  typeof PRODUCT_ANALYTICS_EVENTS.SettingsSnapshotCaptured
>

type UserManagedSiteModelSyncConfig = NonNullable<
  UserPreferences["managedSiteModelSync"]
>

type PreferencePatch = DeepPartial<UserPreferences>

const ALL_SETTINGS_SNAPSHOT_KEYS = [
  "app",
  "display",
  "account",
  "logging",
  "autoRefresh",
  "usageHistory",
  "balanceHistory",
  "managedSite",
  "managedSiteModelSync",
  "autoCheckin",
  "modelRedirect",
  "redemptionAssist",
  "webAiApiCheck",
  "tempWindowFallback",
  "webdav",
  "taskNotifications",
  "siteAnnouncements",
] as const

type SettingsSnapshotKey = (typeof ALL_SETTINGS_SNAPSHOT_KEYS)[number]

const FALLBACK_LANGUAGE = "en"

function normalizeNonNegativeInteger(value: number): number {
  return Number.isFinite(value) && Number.isInteger(value) && value >= 0
    ? value
    : 0
}

function normalizeNonNegativeMinutes(value: number): number {
  return Number.isFinite(value) && value >= 0 ? Math.round(value) : 0
}

function getUsageHistoryScheduleMode(mode: string | undefined) {
  if (mode === USAGE_HISTORY_SCHEDULE_MODE.MANUAL) {
    return PRODUCT_ANALYTICS_MODE_IDS.UsageHistoryManual
  }
  if (mode === USAGE_HISTORY_SCHEDULE_MODE.ALARM) {
    return PRODUCT_ANALYTICS_MODE_IDS.UsageHistoryAlarm
  }
  return PRODUCT_ANALYTICS_MODE_IDS.UsageHistoryAfterRefresh
}

function getTempWindowMode(
  mode: TempWindowFallbackPreferences["tempContextMode"] | undefined,
): ProductAnalyticsModeId {
  if (mode === "window") return PRODUCT_ANALYTICS_MODE_IDS.TempWindowModeWindow
  if (mode === "tab") return PRODUCT_ANALYTICS_MODE_IDS.TempWindowModeTab
  return PRODUCT_ANALYTICS_MODE_IDS.TempWindowModeComposite
}

function getActionClickBehavior(
  behavior: UserPreferences["actionClickBehavior"] | undefined,
) {
  if (behavior === TOOLBAR_ACTION_CLICK_BEHAVIORS.Options) {
    return TOOLBAR_ACTION_CLICK_BEHAVIORS.Options
  }
  return behavior === TOOLBAR_ACTION_CLICK_BEHAVIORS.SidePanel
    ? TOOLBAR_ACTION_CLICK_BEHAVIORS.SidePanel
    : TOOLBAR_ACTION_CLICK_BEHAVIORS.Popup
}

function getSortingPriorityPreferences(
  preferences: UserPreferences,
): SortingPriorityConfig | undefined {
  return preferences.sortingPriorityConfig
}

function isSortingPriorityCustomized(
  config: SortingPriorityConfig | undefined,
): boolean {
  if (!config) return false

  const defaultById = new Map(
    DEFAULT_SORTING_PRIORITY_CONFIG.criteria.map((criterion) => [
      criterion.id,
      criterion,
    ]),
  )

  if (
    config.criteria.length !== DEFAULT_SORTING_PRIORITY_CONFIG.criteria.length
  ) {
    return true
  }

  return config.criteria.some((criterion) => {
    const defaultCriterion = defaultById.get(criterion.id)
    return (
      !defaultCriterion ||
      defaultCriterion.enabled !== criterion.enabled ||
      defaultCriterion.priority !== criterion.priority
    )
  })
}

function isManagedSiteType(
  value: UserPreferences["managedSiteType"],
): value is ProductAnalyticsManagedSiteType {
  return (
    value === SITE_TYPES.NEW_API ||
    value === SITE_TYPES.VELOERA ||
    value === SITE_TYPES.DONE_HUB ||
    value === SITE_TYPES.OCTOPUS ||
    value === SITE_TYPES.AXON_HUB ||
    value === SITE_TYPES.CLAUDE_CODE_HUB
  )
}

function hasText(value: unknown): boolean {
  return typeof value === "string" && value.trim().length > 0
}

function isNewApiConfigured(config: UserPreferences["newApi"]): boolean {
  return hasText(config.baseUrl) && hasText(config.adminToken)
}

function isDoneHubConfigured(config: UserPreferences["doneHub"]): boolean {
  return Boolean(
    config && hasText(config.baseUrl) && hasText(config.adminToken),
  )
}

function isVeloeraConfigured(config: UserPreferences["veloera"]): boolean {
  return hasText(config.baseUrl) && hasText(config.adminToken)
}

function isOctopusConfigured(config: UserPreferences["octopus"]): boolean {
  return Boolean(config && hasText(config.baseUrl) && hasText(config.username))
}

function isAxonHubConfigured(config: UserPreferences["axonHub"]): boolean {
  return Boolean(config && hasText(config.baseUrl) && hasText(config.email))
}

function isClaudeCodeHubConfigured(
  config: UserPreferences["claudeCodeHub"],
): boolean {
  return Boolean(
    config && hasText(config.baseUrl) && hasText(config.adminToken),
  )
}

function isCliProxyConfigured(config: UserPreferences["cliProxy"]): boolean {
  return Boolean(
    config && hasText(config.baseUrl) && hasText(config.managementKey),
  )
}

function isClaudeCodeRouterConfigured(
  config: UserPreferences["claudeCodeRouter"],
): boolean {
  return Boolean(config && hasText(config.baseUrl) && hasText(config.apiKey))
}

function getManagedSiteModelSyncPreferences(
  preferences: UserPreferences,
): UserManagedSiteModelSyncConfig {
  return deepOverride(
    DEFAULT_PREFERENCES.managedSiteModelSync!,
    preferences.managedSiteModelSync ??
      preferences.newApiModelSync ??
      DEFAULT_PREFERENCES.managedSiteModelSync!,
  )
}

function getBalanceHistoryPreferences(
  preferences: UserPreferences,
): BalanceHistoryPreferences {
  return preferences.balanceHistory ?? DEFAULT_PREFERENCES.balanceHistory!
}

function getTempWindowFallbackReminderPreferences(
  preferences: UserPreferences,
): TempWindowFallbackReminderPreferences {
  return (
    preferences.tempWindowFallbackReminder ??
    DEFAULT_PREFERENCES.tempWindowFallbackReminder!
  )
}

function buildAppPreferencesSnapshot(
  preferences: UserPreferences,
  entrypoint: ProductAnalyticsEntrypoint,
): SettingChangedPayload {
  return {
    setting_id: PRODUCT_ANALYTICS_SETTING_IDS.AppPreferencesSnapshot,
    entrypoint,
    theme_mode: preferences.themeMode ?? DEFAULT_PREFERENCES.themeMode,
    normalized_language:
      normalizeAppLanguage(preferences.language) ?? FALLBACK_LANGUAGE,
    toolbar_action_click_behavior: getActionClickBehavior(
      preferences.actionClickBehavior,
    ),
    open_changelog_on_update_enabled:
      preferences.openChangelogOnUpdate !== false,
  }
}

function buildDisplayPreferencesSnapshot(
  preferences: UserPreferences,
  entrypoint: ProductAnalyticsEntrypoint,
): SettingChangedPayload {
  const sortingPriorityConfig = getSortingPriorityPreferences(preferences)
  return {
    setting_id: PRODUCT_ANALYTICS_SETTING_IDS.DisplayPreferencesSnapshot,
    entrypoint,
    active_tab: preferences.activeTab,
    currency_type: preferences.currencyType,
    show_today_cashflow_enabled: preferences.showTodayCashflow !== false,
    sort_field: preferences.sortField ?? PRODUCT_ANALYTICS_SORT_FIELDS.None,
    sort_order: preferences.sortOrder,
    sorting_priority_configured: Boolean(sortingPriorityConfig),
    sorting_priority_customized: isSortingPriorityCustomized(
      sortingPriorityConfig,
    ),
    sorting_priority_enabled_criteria_count: normalizeNonNegativeInteger(
      sortingPriorityConfig?.criteria.filter((criterion) => criterion.enabled)
        .length ??
        DEFAULT_SORTING_PRIORITY_CONFIG.criteria.filter(
          (criterion) => criterion.enabled,
        ).length,
    ),
  }
}

function buildLoggingPreferencesSnapshot(
  preferences: UserPreferences,
  entrypoint: ProductAnalyticsEntrypoint,
): SettingChangedPayload {
  const config = preferences.logging ?? DEFAULT_PREFERENCES.logging
  return {
    setting_id: PRODUCT_ANALYTICS_SETTING_IDS.LoggingPreferencesSnapshot,
    entrypoint,
    console_logging_enabled: config.consoleEnabled === true,
    log_level: config.level,
  }
}

function getModelRedirectPreferences(
  preferences: UserPreferences,
): ModelRedirectPreferences {
  return preferences.modelRedirect ?? DEFAULT_PREFERENCES.modelRedirect
}

function getRedemptionAssistPreferences(
  preferences: UserPreferences,
): RedemptionAssistPreferences {
  return preferences.redemptionAssist ?? DEFAULT_PREFERENCES.redemptionAssist!
}

function getWebAiApiCheckPreferences(
  preferences: UserPreferences,
): WebAiApiCheckPreferences {
  return preferences.webAiApiCheck ?? DEFAULT_PREFERENCES.webAiApiCheck!
}

function getTempWindowFallbackPreferences(
  preferences: UserPreferences,
): TempWindowFallbackPreferences {
  return (
    preferences.tempWindowFallback ?? DEFAULT_PREFERENCES.tempWindowFallback!
  )
}

function buildAccountBehaviorSnapshot(
  preferences: UserPreferences,
  entrypoint: ProductAnalyticsEntrypoint,
): SettingChangedPayload {
  return {
    setting_id: PRODUCT_ANALYTICS_SETTING_IDS.AccountBehaviorSnapshot,
    entrypoint,
    auto_provision_key_on_account_add_enabled:
      preferences.autoProvisionKeyOnAccountAdd === true,
    auto_fill_current_site_url_on_account_add_enabled:
      preferences.autoFillCurrentSiteUrlOnAccountAdd === true,
    warn_on_duplicate_account_add_enabled:
      preferences.warnOnDuplicateAccountAdd !== false,
    show_today_cashflow_enabled: preferences.showTodayCashflow !== false,
    show_health_status_enabled: preferences.showHealthStatus === true,
  }
}

function buildAutoRefreshSnapshot(
  preferences: UserPreferences,
  entrypoint: ProductAnalyticsEntrypoint,
): SettingChangedPayload {
  const config =
    preferences.accountAutoRefresh ?? DEFAULT_PREFERENCES.accountAutoRefresh
  return {
    setting_id: PRODUCT_ANALYTICS_SETTING_IDS.AutoRefreshConfigSnapshot,
    entrypoint,
    enabled: config.enabled === true,
    refresh_on_open_enabled: config.refreshOnOpen === true,
    refresh_interval_minutes: normalizeNonNegativeMinutes(
      config.interval / 60_000,
    ),
    min_refresh_interval_seconds: normalizeNonNegativeInteger(
      config.minInterval / 1_000,
    ),
  }
}

function buildUsageHistorySnapshot(
  preferences: UserPreferences,
  entrypoint: ProductAnalyticsEntrypoint,
): SettingChangedPayload {
  const config = preferences.usageHistory ?? DEFAULT_PREFERENCES.usageHistory!
  return {
    setting_id: PRODUCT_ANALYTICS_SETTING_IDS.UsageHistoryConfigSnapshot,
    entrypoint,
    enabled: config.enabled === true,
    mode: getUsageHistoryScheduleMode(config.scheduleMode),
    sync_interval_minutes: normalizeNonNegativeInteger(
      config.syncIntervalMinutes,
    ),
    retention_days: normalizeNonNegativeInteger(config.retentionDays),
  }
}

function buildBalanceHistorySnapshot(
  preferences: UserPreferences,
  entrypoint: ProductAnalyticsEntrypoint,
): SettingChangedPayload {
  const config = getBalanceHistoryPreferences(preferences)
  return {
    setting_id: PRODUCT_ANALYTICS_SETTING_IDS.BalanceHistoryConfigSnapshot,
    entrypoint,
    enabled: config.enabled === true,
    end_of_day_capture_enabled: config.endOfDayCapture?.enabled === true,
    estimated_today_income_enabled:
      config.estimatedTodayIncome?.enabled === true,
    retention_days: normalizeNonNegativeInteger(config.retentionDays),
  }
}

function buildManagedSiteSnapshot(
  preferences: UserPreferences,
  entrypoint: ProductAnalyticsEntrypoint,
): SettingChangedPayload {
  return {
    setting_id: PRODUCT_ANALYTICS_SETTING_IDS.ManagedSiteConfigSnapshot,
    entrypoint,
    managed_site_type: isManagedSiteType(preferences.managedSiteType)
      ? preferences.managedSiteType
      : SITE_TYPES.NEW_API,
    new_api_configured: isNewApiConfigured(preferences.newApi),
    done_hub_configured: isDoneHubConfigured(preferences.doneHub),
    veloera_configured: isVeloeraConfigured(preferences.veloera),
    octopus_configured: isOctopusConfigured(preferences.octopus),
    axon_hub_configured: isAxonHubConfigured(preferences.axonHub),
    claude_code_hub_configured: isClaudeCodeHubConfigured(
      preferences.claudeCodeHub,
    ),
    cli_proxy_configured: isCliProxyConfigured(preferences.cliProxy),
    claude_code_router_configured: isClaudeCodeRouterConfigured(
      preferences.claudeCodeRouter,
    ),
  }
}

function buildManagedSiteModelSyncSnapshot(
  preferences: UserPreferences,
  entrypoint: ProductAnalyticsEntrypoint,
): SettingChangedPayload {
  const config = getManagedSiteModelSyncPreferences(preferences)
  return {
    setting_id:
      PRODUCT_ANALYTICS_SETTING_IDS.ManagedSiteModelSyncConfigSnapshot,
    entrypoint,
    enabled: config.enabled === true,
    sync_interval_minutes: normalizeNonNegativeMinutes(
      config.interval / 60_000,
    ),
    concurrency: normalizeNonNegativeInteger(config.concurrency),
    retry_max_attempts: normalizeNonNegativeInteger(config.maxRetries),
    channel_timeout_seconds: normalizeNonNegativeInteger(
      config.channelProcessingTimeout,
    ),
    rate_limit_rpm: normalizeNonNegativeInteger(
      config.rateLimit.requestsPerMinute,
    ),
    rate_limit_burst: normalizeNonNegativeInteger(config.rateLimit.burst),
    allowed_models_configured: (config.allowedModels ?? []).length > 0,
    global_filters_configured:
      (config.globalChannelModelFilters ?? []).length > 0,
  }
}

function buildModelRedirectSnapshot(
  preferences: UserPreferences,
  entrypoint: ProductAnalyticsEntrypoint,
): SettingChangedPayload {
  const config = getModelRedirectPreferences(preferences)
  return {
    setting_id: PRODUCT_ANALYTICS_SETTING_IDS.ModelRedirectConfigSnapshot,
    entrypoint,
    enabled: config.enabled === true,
    standard_models_configured: (config.standardModels ?? []).length > 0,
    prune_missing_targets_on_model_sync_enabled:
      config.pruneMissingTargetsOnModelSync === true,
  }
}

function buildRedemptionAssistSnapshot(
  preferences: UserPreferences,
  entrypoint: ProductAnalyticsEntrypoint,
): SettingChangedPayload {
  const config = getRedemptionAssistPreferences(preferences)
  return {
    setting_id: PRODUCT_ANALYTICS_SETTING_IDS.RedemptionAssistConfigSnapshot,
    entrypoint,
    enabled: config.enabled === true,
    context_menu_enabled: config.contextMenu?.enabled === true,
    relaxed_code_validation_enabled: config.relaxedCodeValidation === true,
    url_whitelist_enabled: config.urlWhitelist?.enabled === true,
    url_whitelist_patterns_configured:
      (config.urlWhitelist?.patterns ?? []).length > 0,
    url_whitelist_account_urls_enabled:
      config.urlWhitelist?.includeAccountSiteUrls === true,
    url_whitelist_checkin_redeem_urls_enabled:
      config.urlWhitelist?.includeCheckInAndRedeemUrls === true,
  }
}

function buildWebAiApiCheckSnapshot(
  preferences: UserPreferences,
  entrypoint: ProductAnalyticsEntrypoint,
): SettingChangedPayload {
  const config = getWebAiApiCheckPreferences(preferences)
  return {
    setting_id: PRODUCT_ANALYTICS_SETTING_IDS.WebAiApiCheckConfigSnapshot,
    entrypoint,
    enabled: config.enabled === true,
    context_menu_enabled: config.contextMenu?.enabled === true,
    auto_detect_enabled: config.autoDetect?.enabled === true,
    auto_detect_enhanced_enabled: config.autoDetect?.enhanced?.enabled === true,
    auto_detect_url_patterns_configured:
      (config.autoDetect?.urlWhitelist?.patterns ?? []).length > 0,
    api_key_cleanup_patterns_configured:
      (config.keyCleanup?.removalPatterns ?? []).length > 0,
  }
}

function buildTempWindowFallbackSnapshot(
  preferences: UserPreferences,
  entrypoint: ProductAnalyticsEntrypoint,
): SettingChangedPayload {
  const config = getTempWindowFallbackPreferences(preferences)
  const reminderConfig = getTempWindowFallbackReminderPreferences(preferences)
  return {
    setting_id: PRODUCT_ANALYTICS_SETTING_IDS.TempWindowFallbackConfigSnapshot,
    entrypoint,
    enabled: config.enabled === true,
    popup_enabled: config.useInPopup === true,
    sidepanel_enabled: config.useInSidePanel === true,
    options_enabled: config.useInOptions === true,
    auto_refresh_enabled: config.useForAutoRefresh === true,
    manual_refresh_enabled: config.useForManualRefresh === true,
    mode: getTempWindowMode(config.tempContextMode),
    reminder_dismissed: reminderConfig.dismissed === true,
  }
}

function buildWebdavSnapshot(
  preferences: UserPreferences,
  entrypoint: ProductAnalyticsEntrypoint,
): SettingChangedPayload {
  const config = preferences.webdav ?? DEFAULT_PREFERENCES.webdav
  const syncData = resolveWebdavSyncDataSelection(config.syncData)
  return {
    setting_id: PRODUCT_ANALYTICS_SETTING_IDS.WebDavConfigSnapshot,
    entrypoint,
    configured: hasText(config.url) && hasText(config.username),
    auto_sync_enabled: config.autoSync === true,
    backup_encryption_enabled: config.backupEncryptionEnabled === true,
    sync_strategy: getWebdavSyncStrategyMode(config.syncStrategy),
    sync_interval_minutes: normalizeNonNegativeMinutes(
      config.syncInterval / 60,
    ),
    sync_accounts_enabled: syncData.accounts,
    sync_bookmarks_enabled: syncData.bookmarks,
    sync_api_profiles_enabled: syncData.apiCredentialProfiles,
    sync_preferences_enabled: syncData.preferences,
  }
}

function buildTaskNotificationsSnapshot(
  preferences: UserPreferences,
  entrypoint: ProductAnalyticsEntrypoint,
): SettingChangedPayload {
  const config = normalizeTaskNotificationPreferences(
    preferences.taskNotifications,
  )
  const thirdPartyChannelCount = [
    config.channels[TASK_NOTIFICATION_CHANNELS.Telegram].enabled,
    config.channels[TASK_NOTIFICATION_CHANNELS.Feishu].enabled,
    config.channels[TASK_NOTIFICATION_CHANNELS.Dingtalk].enabled,
    config.channels[TASK_NOTIFICATION_CHANNELS.Wecom].enabled,
    config.channels[TASK_NOTIFICATION_CHANNELS.Ntfy].enabled,
    config.channels[TASK_NOTIFICATION_CHANNELS.Webhook].enabled,
  ].filter(Boolean).length
  const taskEnabledCount = Object.values(config.tasks).filter(Boolean).length

  return {
    setting_id: PRODUCT_ANALYTICS_SETTING_IDS.TaskNotificationsConfigSnapshot,
    entrypoint,
    enabled: config.enabled === true,
    browser_channel_enabled:
      config.channels[TASK_NOTIFICATION_CHANNELS.Browser].enabled === true,
    telegram_channel_enabled:
      config.channels[TASK_NOTIFICATION_CHANNELS.Telegram].enabled === true,
    feishu_channel_enabled:
      config.channels[TASK_NOTIFICATION_CHANNELS.Feishu].enabled === true,
    dingtalk_channel_enabled:
      config.channels[TASK_NOTIFICATION_CHANNELS.Dingtalk].enabled === true,
    wecom_channel_enabled:
      config.channels[TASK_NOTIFICATION_CHANNELS.Wecom].enabled === true,
    ntfy_channel_enabled:
      config.channels[TASK_NOTIFICATION_CHANNELS.Ntfy].enabled === true,
    webhook_channel_enabled:
      config.channels[TASK_NOTIFICATION_CHANNELS.Webhook].enabled === true,
    auto_checkin_task_enabled:
      config.tasks[TASK_NOTIFICATION_TASKS.AutoCheckin] === true,
    webdav_auto_sync_task_enabled:
      config.tasks[TASK_NOTIFICATION_TASKS.WebdavAutoSync] === true,
    managed_site_model_sync_task_enabled:
      config.tasks[TASK_NOTIFICATION_TASKS.ManagedSiteModelSync] === true,
    usage_history_sync_task_enabled:
      config.tasks[TASK_NOTIFICATION_TASKS.UsageHistorySync] === true,
    balance_history_capture_task_enabled:
      config.tasks[TASK_NOTIFICATION_TASKS.BalanceHistoryCapture] === true,
    site_announcements_task_enabled:
      config.tasks[TASK_NOTIFICATION_TASKS.SiteAnnouncements] === true,
    third_party_channel_count: thirdPartyChannelCount,
    task_enabled_count: taskEnabledCount,
  }
}

function buildSiteAnnouncementsSnapshot(
  preferences: UserPreferences,
  entrypoint: ProductAnalyticsEntrypoint,
): SettingChangedPayload {
  const config = normalizeSiteAnnouncementPreferences(
    preferences.siteAnnouncementNotifications,
  )
  return {
    setting_id: PRODUCT_ANALYTICS_SETTING_IDS.SiteAnnouncementsConfigSnapshot,
    entrypoint,
    enabled: config.enabled === true,
    notification_enabled: config.notificationEnabled === true,
    polling_interval_minutes: normalizeNonNegativeInteger(
      config.intervalMinutes,
    ),
  }
}

function buildSnapshotByKey(
  key: SettingsSnapshotKey,
  preferences: UserPreferences,
  entrypoint: ProductAnalyticsEntrypoint,
): SettingChangedPayload {
  switch (key) {
    case "app":
      return buildAppPreferencesSnapshot(preferences, entrypoint)
    case "display":
      return buildDisplayPreferencesSnapshot(preferences, entrypoint)
    case "account":
      return buildAccountBehaviorSnapshot(preferences, entrypoint)
    case "logging":
      return buildLoggingPreferencesSnapshot(preferences, entrypoint)
    case "autoRefresh":
      return buildAutoRefreshSnapshot(preferences, entrypoint)
    case "usageHistory":
      return buildUsageHistorySnapshot(preferences, entrypoint)
    case "balanceHistory":
      return buildBalanceHistorySnapshot(preferences, entrypoint)
    case "managedSite":
      return buildManagedSiteSnapshot(preferences, entrypoint)
    case "managedSiteModelSync":
      return buildManagedSiteModelSyncSnapshot(preferences, entrypoint)
    case "autoCheckin":
      return buildAutoCheckinConfigSnapshotProperties(
        deepOverride(
          DEFAULT_PREFERENCES.autoCheckin!,
          preferences.autoCheckin ?? {},
        ),
        entrypoint,
      )
    case "modelRedirect":
      return buildModelRedirectSnapshot(preferences, entrypoint)
    case "redemptionAssist":
      return buildRedemptionAssistSnapshot(preferences, entrypoint)
    case "webAiApiCheck":
      return buildWebAiApiCheckSnapshot(preferences, entrypoint)
    case "tempWindowFallback":
      return buildTempWindowFallbackSnapshot(preferences, entrypoint)
    case "webdav":
      return buildWebdavSnapshot(preferences, entrypoint)
    case "taskNotifications":
      return buildTaskNotificationsSnapshot(preferences, entrypoint)
    case "siteAnnouncements":
      return buildSiteAnnouncementsSnapshot(preferences, entrypoint)
  }
}

function resolveSnapshotKeysForPatch(patch?: PreferencePatch) {
  if (!patch) return ALL_SETTINGS_SNAPSHOT_KEYS

  const keys = new Set<SettingsSnapshotKey>()
  const appKeys: Array<keyof UserPreferences> = [
    "themeMode",
    "language",
    "actionClickBehavior",
    "openChangelogOnUpdate",
  ]
  if (appKeys.some((key) => key in patch)) keys.add("app")
  const displayKeys: Array<keyof UserPreferences> = [
    "activeTab",
    "currencyType",
    "showTodayCashflow",
    "sortField",
    "sortOrder",
    "sortingPriorityConfig",
  ]
  if (displayKeys.some((key) => key in patch)) keys.add("display")
  const accountKeys: Array<keyof UserPreferences> = [
    "autoProvisionKeyOnAccountAdd",
    "autoFillCurrentSiteUrlOnAccountAdd",
    "warnOnDuplicateAccountAdd",
    "showTodayCashflow",
    "showHealthStatus",
  ]
  if (accountKeys.some((key) => key in patch)) keys.add("account")
  if ("logging" in patch) keys.add("logging")
  if ("accountAutoRefresh" in patch) keys.add("autoRefresh")
  if ("usageHistory" in patch) keys.add("usageHistory")
  if ("balanceHistory" in patch) keys.add("balanceHistory")
  if (
    "managedSiteType" in patch ||
    "newApi" in patch ||
    "doneHub" in patch ||
    "veloera" in patch ||
    "octopus" in patch ||
    "axonHub" in patch ||
    "claudeCodeHub" in patch ||
    "cliProxy" in patch ||
    "claudeCodeRouter" in patch
  ) {
    keys.add("managedSite")
  }
  if ("managedSiteModelSync" in patch || "newApiModelSync" in patch) {
    keys.add("managedSiteModelSync")
  }
  if ("autoCheckin" in patch) keys.add("autoCheckin")
  if ("modelRedirect" in patch) keys.add("modelRedirect")
  if ("redemptionAssist" in patch) keys.add("redemptionAssist")
  if ("webAiApiCheck" in patch) keys.add("webAiApiCheck")
  if ("tempWindowFallback" in patch || "tempWindowFallbackReminder" in patch) {
    keys.add("tempWindowFallback")
  }
  if ("webdav" in patch) keys.add("webdav")
  if ("taskNotifications" in patch) keys.add("taskNotifications")
  if ("siteAnnouncementNotifications" in patch) keys.add("siteAnnouncements")

  return Array.from(keys)
}

/**
 * Builds privacy-safe settings snapshots. The payloads intentionally describe
 * configuration shape and strategy, not raw user-entered values.
 */
export function buildSettingsSnapshotEvents(
  preferences: UserPreferences,
  entrypoint: ProductAnalyticsEntrypoint,
  patch?: PreferencePatch,
): SettingChangedPayload[] {
  return resolveSnapshotKeysForPatch(patch).map((key) =>
    buildSnapshotByKey(key, preferences, entrypoint),
  )
}

/**
 * Builds one aggregate settings snapshot for cadence-limited background
 * telemetry. Patch-scoped option-page telemetry stays module-level so it can
 * attribute which settings area was saved.
 */
export function buildAggregateSettingsSnapshotEvent(
  preferences: UserPreferences,
  entrypoint: ProductAnalyticsEntrypoint,
): SettingsSnapshotCapturedPayload {
  const snapshots = Object.fromEntries(
    ALL_SETTINGS_SNAPSHOT_KEYS.map((key) => [
      key,
      buildSnapshotByKey(key, preferences, entrypoint),
    ]),
  ) as Record<SettingsSnapshotKey, SettingChangedPayload>
  const app = snapshots.app
  const display = snapshots.display
  const account = snapshots.account
  const logging = snapshots.logging
  const autoRefresh = snapshots.autoRefresh
  const usageHistory = snapshots.usageHistory
  const balanceHistory = snapshots.balanceHistory
  const managedSite = snapshots.managedSite
  const managedSiteModelSync = snapshots.managedSiteModelSync
  const autoCheckin = snapshots.autoCheckin
  const modelRedirect = snapshots.modelRedirect
  const redemptionAssist = snapshots.redemptionAssist
  const webAiApiCheck = snapshots.webAiApiCheck
  const tempWindowFallback = snapshots.tempWindowFallback
  const webdav = snapshots.webdav
  const taskNotifications = snapshots.taskNotifications
  const siteAnnouncements = snapshots.siteAnnouncements

  return {
    entrypoint,
    theme_mode: app.theme_mode,
    normalized_language: app.normalized_language,
    toolbar_action_click_behavior: app.toolbar_action_click_behavior,
    open_changelog_on_update_enabled: app.open_changelog_on_update_enabled,
    active_tab: display.active_tab,
    currency_type: display.currency_type,
    show_today_cashflow_enabled: display.show_today_cashflow_enabled,
    sort_field: display.sort_field,
    sort_order: display.sort_order,
    sorting_priority_configured: display.sorting_priority_configured,
    sorting_priority_customized: display.sorting_priority_customized,
    sorting_priority_enabled_criteria_count:
      display.sorting_priority_enabled_criteria_count,
    console_logging_enabled: logging.console_logging_enabled,
    log_level: logging.log_level,
    auto_provision_key_on_account_add_enabled:
      account.auto_provision_key_on_account_add_enabled,
    auto_fill_current_site_url_on_account_add_enabled:
      account.auto_fill_current_site_url_on_account_add_enabled,
    warn_on_duplicate_account_add_enabled:
      account.warn_on_duplicate_account_add_enabled,
    show_health_status_enabled: account.show_health_status_enabled,
    account_auto_refresh_enabled: autoRefresh.enabled,
    account_auto_refresh_on_open_enabled: autoRefresh.refresh_on_open_enabled,
    account_auto_refresh_interval_minutes: autoRefresh.refresh_interval_minutes,
    account_auto_refresh_min_interval_seconds:
      autoRefresh.min_refresh_interval_seconds,
    usage_history_enabled: usageHistory.enabled,
    usage_history_mode: usageHistory.mode,
    usage_history_sync_interval_minutes: usageHistory.sync_interval_minutes,
    usage_history_retention_days: usageHistory.retention_days,
    balance_history_enabled: balanceHistory.enabled,
    balance_history_end_of_day_capture_enabled:
      balanceHistory.end_of_day_capture_enabled,
    balance_history_estimated_today_income_enabled:
      balanceHistory.estimated_today_income_enabled,
    balance_history_retention_days: balanceHistory.retention_days,
    managed_site_type: managedSite.managed_site_type,
    new_api_configured: managedSite.new_api_configured,
    done_hub_configured: managedSite.done_hub_configured,
    veloera_configured: managedSite.veloera_configured,
    octopus_configured: managedSite.octopus_configured,
    axon_hub_configured: managedSite.axon_hub_configured,
    claude_code_hub_configured: managedSite.claude_code_hub_configured,
    cli_proxy_configured: managedSite.cli_proxy_configured,
    claude_code_router_configured: managedSite.claude_code_router_configured,
    managed_site_model_sync_enabled: managedSiteModelSync.enabled,
    managed_site_model_sync_interval_minutes:
      managedSiteModelSync.sync_interval_minutes,
    managed_site_model_sync_concurrency: managedSiteModelSync.concurrency,
    managed_site_model_sync_retry_max_attempts:
      managedSiteModelSync.retry_max_attempts,
    managed_site_model_sync_channel_timeout_seconds:
      managedSiteModelSync.channel_timeout_seconds,
    managed_site_model_sync_rate_limit_rpm: managedSiteModelSync.rate_limit_rpm,
    managed_site_model_sync_rate_limit_burst:
      managedSiteModelSync.rate_limit_burst,
    managed_site_model_sync_allowed_models_configured:
      managedSiteModelSync.allowed_models_configured,
    managed_site_model_sync_global_filters_configured:
      managedSiteModelSync.global_filters_configured,
    auto_checkin_global_enabled: autoCheckin.global_enabled,
    auto_checkin_ui_pretrigger_enabled: autoCheckin.ui_pretrigger_enabled,
    auto_checkin_notify_completion_enabled:
      autoCheckin.notify_completion_enabled,
    auto_checkin_retry_enabled: autoCheckin.retry_enabled,
    auto_checkin_schedule_mode: autoCheckin.schedule_mode,
    auto_checkin_retry_interval_minutes: autoCheckin.retry_interval_minutes,
    auto_checkin_retry_max_attempts: autoCheckin.retry_max_attempts,
    auto_checkin_window_length_minutes: autoCheckin.window_length_minutes,
    auto_checkin_deterministic_time_minutes:
      autoCheckin.deterministic_time_minutes,
    model_redirect_enabled: modelRedirect.enabled,
    model_redirect_standard_models_configured:
      modelRedirect.standard_models_configured,
    model_redirect_prune_missing_targets_on_model_sync_enabled:
      modelRedirect.prune_missing_targets_on_model_sync_enabled,
    redemption_assist_enabled: redemptionAssist.enabled,
    redemption_assist_context_menu_enabled:
      redemptionAssist.context_menu_enabled,
    redemption_assist_relaxed_code_validation_enabled:
      redemptionAssist.relaxed_code_validation_enabled,
    redemption_assist_allowlist_enabled: redemptionAssist.url_whitelist_enabled,
    redemption_assist_allowlist_patterns_configured:
      redemptionAssist.url_whitelist_patterns_configured,
    redemption_assist_allowlist_account_urls_enabled:
      redemptionAssist.url_whitelist_account_urls_enabled,
    redemption_assist_allowlist_checkin_redeem_urls_enabled:
      redemptionAssist.url_whitelist_checkin_redeem_urls_enabled,
    web_ai_api_check_enabled: webAiApiCheck.enabled,
    web_ai_api_check_context_menu_enabled: webAiApiCheck.context_menu_enabled,
    web_ai_api_check_auto_detect_enabled: webAiApiCheck.auto_detect_enabled,
    web_ai_api_check_auto_detect_enhanced_enabled:
      webAiApiCheck.auto_detect_enhanced_enabled,
    web_ai_api_check_auto_detect_patterns_configured:
      webAiApiCheck.auto_detect_url_patterns_configured,
    temp_window_fallback_enabled: tempWindowFallback.enabled,
    temp_window_fallback_popup_enabled: tempWindowFallback.popup_enabled,
    temp_window_fallback_sidepanel_enabled:
      tempWindowFallback.sidepanel_enabled,
    temp_window_fallback_options_enabled: tempWindowFallback.options_enabled,
    temp_window_fallback_auto_refresh_enabled:
      tempWindowFallback.auto_refresh_enabled,
    temp_window_fallback_manual_refresh_enabled:
      tempWindowFallback.manual_refresh_enabled,
    temp_window_fallback_mode: tempWindowFallback.mode,
    temp_window_fallback_reminder_dismissed:
      tempWindowFallback.reminder_dismissed,
    webdav_configured: webdav.configured,
    webdav_auto_sync_enabled: webdav.auto_sync_enabled,
    webdav_backup_encryption_enabled: webdav.backup_encryption_enabled,
    webdav_sync_strategy: webdav.sync_strategy,
    webdav_sync_interval_minutes: webdav.sync_interval_minutes,
    webdav_sync_accounts_enabled: webdav.sync_accounts_enabled,
    webdav_sync_bookmarks_enabled: webdav.sync_bookmarks_enabled,
    webdav_sync_api_profiles_enabled: webdav.sync_api_profiles_enabled,
    webdav_sync_preferences_enabled: webdav.sync_preferences_enabled,
    task_notifications_enabled: taskNotifications.enabled,
    task_notifications_browser_channel_enabled:
      taskNotifications.browser_channel_enabled,
    task_notifications_telegram_channel_enabled:
      taskNotifications.telegram_channel_enabled,
    task_notifications_feishu_channel_enabled:
      taskNotifications.feishu_channel_enabled,
    task_notifications_dingtalk_channel_enabled:
      taskNotifications.dingtalk_channel_enabled,
    task_notifications_wecom_channel_enabled:
      taskNotifications.wecom_channel_enabled,
    task_notifications_ntfy_channel_enabled:
      taskNotifications.ntfy_channel_enabled,
    task_notifications_webhook_channel_enabled:
      taskNotifications.webhook_channel_enabled,
    task_notifications_auto_checkin_task_enabled:
      taskNotifications.auto_checkin_task_enabled,
    task_notifications_webdav_auto_sync_task_enabled:
      taskNotifications.webdav_auto_sync_task_enabled,
    task_notifications_managed_site_model_sync_task_enabled:
      taskNotifications.managed_site_model_sync_task_enabled,
    task_notifications_usage_history_sync_task_enabled:
      taskNotifications.usage_history_sync_task_enabled,
    task_notifications_balance_history_capture_task_enabled:
      taskNotifications.balance_history_capture_task_enabled,
    task_notifications_site_announcements_task_enabled:
      taskNotifications.site_announcements_task_enabled,
    task_notifications_third_party_channel_count:
      taskNotifications.third_party_channel_count,
    task_notifications_task_enabled_count: taskNotifications.task_enabled_count,
    site_announcements_enabled: siteAnnouncements.enabled,
    site_announcements_notification_enabled:
      siteAnnouncements.notification_enabled,
    site_announcements_polling_interval_minutes:
      siteAnnouncements.polling_interval_minutes,
  }
}

/**
 * Emits settings snapshots for either all tracked settings or just the modules
 * touched by a saved preference patch.
 */
export function trackSettingsSnapshotEvents(
  preferences: UserPreferences,
  entrypoint: ProductAnalyticsEntrypoint,
  patch?: PreferencePatch,
) {
  for (const properties of buildSettingsSnapshotEvents(
    preferences,
    entrypoint,
    patch,
  )) {
    void trackProductAnalyticsEvent(
      PRODUCT_ANALYTICS_EVENTS.SettingsSnapshotCaptured,
      properties,
    )
  }
}
