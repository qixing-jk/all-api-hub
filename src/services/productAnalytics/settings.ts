/* eslint-disable jsdoc/require-jsdoc */
import { SITE_TYPES } from "~/constants/siteType"
import {
  DEFAULT_PREFERENCES,
  type RedemptionAssistPreferences,
  type TempWindowFallbackPreferences,
  type UserPreferences,
  type WebAiApiCheckPreferences,
} from "~/services/preferences/userPreferences"
import type { BalanceHistoryPreferences } from "~/types/dailyBalanceHistory"
import type { ModelRedirectPreferences } from "~/types/managedSiteModelRedirect"
import { normalizeSiteAnnouncementPreferences } from "~/types/siteAnnouncements"
import {
  normalizeTaskNotificationPreferences,
  TASK_NOTIFICATION_CHANNELS,
} from "~/types/taskNotifications"
import { USAGE_HISTORY_SCHEDULE_MODE } from "~/types/usageHistory"
import type { DeepPartial } from "~/types/utils"
import {
  resolveWebdavSyncDataSelection,
  WEBDAV_SYNC_STRATEGIES,
} from "~/types/webdav"
import { deepOverride } from "~/utils"

import { buildAutoCheckinConfigSnapshotProperties } from "./autoCheckin"
import {
  PRODUCT_ANALYTICS_AUTO_CHECKIN_RETRY_ATTEMPT_BUCKETS,
  PRODUCT_ANALYTICS_EVENTS,
  PRODUCT_ANALYTICS_MODE_IDS,
  PRODUCT_ANALYTICS_SETTING_IDS,
  trackProductAnalyticsEvent,
  type ProductAnalyticsEntrypoint,
  type ProductAnalyticsEventPayload,
  type ProductAnalyticsManagedSiteType,
  type ProductAnalyticsModeId,
} from "./events"
import { bucketCount } from "./privacy"

type SettingChangedPayload = ProductAnalyticsEventPayload<
  typeof PRODUCT_ANALYTICS_EVENTS.SettingChanged
>

type UserManagedSiteModelSyncConfig = NonNullable<
  UserPreferences["managedSiteModelSync"]
>

type PreferencePatch = DeepPartial<UserPreferences>

const ALL_SETTINGS_SNAPSHOT_KEYS = [
  "account",
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

/**
 * Buckets minute/second cadences into coarse ranges shared by settings snapshots.
 */
function bucketIntervalMinutes(minutes: number): ProductAnalyticsModeId {
  if (!Number.isFinite(minutes) || minutes < 10) {
    return PRODUCT_ANALYTICS_MODE_IDS.RefreshIntervalLessThan10m
  }
  if (minutes <= 60) return PRODUCT_ANALYTICS_MODE_IDS.RefreshIntervalTenTo60m
  if (minutes <= 6 * 60) {
    return PRODUCT_ANALYTICS_MODE_IDS.RefreshIntervalOneTo6h
  }
  if (minutes <= 24 * 60) {
    return PRODUCT_ANALYTICS_MODE_IDS.RefreshIntervalSixTo24h
  }
  return PRODUCT_ANALYTICS_MODE_IDS.RefreshIntervalGreaterThan24h
}

function bucketMinIntervalSeconds(seconds: number): ProductAnalyticsModeId {
  if (!Number.isFinite(seconds) || seconds < 60) {
    return PRODUCT_ANALYTICS_MODE_IDS.RefreshIntervalLessThan10m
  }
  if (seconds <= 10 * 60) {
    return PRODUCT_ANALYTICS_MODE_IDS.RefreshIntervalOneTo10m
  }
  return bucketIntervalMinutes(seconds / 60)
}

function bucketRetentionDays(days: number): ProductAnalyticsModeId {
  if (!Number.isFinite(days) || days <= 7) {
    return PRODUCT_ANALYTICS_MODE_IDS.RetentionDaysSevenOrLess
  }
  if (days <= 30) return PRODUCT_ANALYTICS_MODE_IDS.RetentionDaysEightTo30
  if (days <= 365) {
    return PRODUCT_ANALYTICS_MODE_IDS.RetentionDaysThirtyOneTo365
  }
  return PRODUCT_ANALYTICS_MODE_IDS.RetentionDaysGreaterThan365
}

function bucketRateLimit(value: number): ProductAnalyticsModeId {
  if (!Number.isFinite(value) || value < 20) {
    return PRODUCT_ANALYTICS_MODE_IDS.RateLimitLessThan20
  }
  if (value <= 60) return PRODUCT_ANALYTICS_MODE_IDS.RateLimitTwentyTo60
  return PRODUCT_ANALYTICS_MODE_IDS.RateLimitSixtyPlus
}

function bucketRetryAttempts(value: number) {
  if (!Number.isFinite(value) || value <= 1) {
    return PRODUCT_ANALYTICS_AUTO_CHECKIN_RETRY_ATTEMPT_BUCKETS.One
  }
  if (value <= 3) {
    return PRODUCT_ANALYTICS_AUTO_CHECKIN_RETRY_ATTEMPT_BUCKETS.TwoToThree
  }
  return PRODUCT_ANALYTICS_AUTO_CHECKIN_RETRY_ATTEMPT_BUCKETS.FourPlus
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

function getWebdavSyncStrategy(
  strategy: UserPreferences["webdav"]["syncStrategy"] | undefined,
): ProductAnalyticsModeId {
  if (strategy === WEBDAV_SYNC_STRATEGIES.UPLOAD_ONLY) {
    return PRODUCT_ANALYTICS_MODE_IDS.WebDavUploadOnly
  }
  if (strategy === WEBDAV_SYNC_STRATEGIES.DOWNLOAD_ONLY) {
    return PRODUCT_ANALYTICS_MODE_IDS.WebDavDownloadOnly
  }
  return PRODUCT_ANALYTICS_MODE_IDS.WebDavMerge
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
    refresh_interval_bucket: bucketIntervalMinutes(config.interval / 60_000),
    min_refresh_interval_bucket: bucketMinIntervalSeconds(
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
    sync_interval_bucket: bucketIntervalMinutes(config.syncIntervalMinutes),
    retention_days_bucket: bucketRetentionDays(config.retentionDays),
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
    retention_days_bucket: bucketRetentionDays(config.retentionDays),
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
    sync_interval_bucket: bucketIntervalMinutes(config.interval / 60_000),
    concurrency_bucket: bucketCount(config.concurrency),
    retry_max_attempts_bucket: bucketRetryAttempts(config.maxRetries),
    rate_limit_rpm_bucket: bucketRateLimit(config.rateLimit.requestsPerMinute),
    rate_limit_burst_bucket: bucketCount(config.rateLimit.burst),
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
    auto_detect_url_patterns_configured:
      (config.autoDetect?.urlWhitelist?.patterns ?? []).length > 0,
  }
}

function buildTempWindowFallbackSnapshot(
  preferences: UserPreferences,
  entrypoint: ProductAnalyticsEntrypoint,
): SettingChangedPayload {
  const config = getTempWindowFallbackPreferences(preferences)
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
    sync_strategy: getWebdavSyncStrategy(config.syncStrategy),
    sync_interval_bucket: bucketIntervalMinutes(config.syncInterval / 60),
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
    third_party_channel_count_bucket: bucketCount(thirdPartyChannelCount),
    task_enabled_count_bucket: bucketCount(taskEnabledCount),
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
    polling_interval_bucket: bucketIntervalMinutes(config.intervalMinutes),
  }
}

function buildSnapshotByKey(
  key: SettingsSnapshotKey,
  preferences: UserPreferences,
  entrypoint: ProductAnalyticsEntrypoint,
): SettingChangedPayload {
  switch (key) {
    case "account":
      return buildAccountBehaviorSnapshot(preferences, entrypoint)
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
  const accountKeys: Array<keyof UserPreferences> = [
    "autoProvisionKeyOnAccountAdd",
    "autoFillCurrentSiteUrlOnAccountAdd",
    "warnOnDuplicateAccountAdd",
    "showTodayCashflow",
    "showHealthStatus",
  ]
  if (accountKeys.some((key) => key in patch)) keys.add("account")
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
  if ("tempWindowFallback" in patch) keys.add("tempWindowFallback")
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
      PRODUCT_ANALYTICS_EVENTS.SettingChanged,
      properties,
    )
  }
}
