import { DEFAULT_PREFERENCES } from "~/services/preferences/preferencesDefaults"
import {
  type RedemptionAssistPreferences,
  type UserPreferences,
  type WebAiApiCheckPreferences,
} from "~/services/preferences/preferencesSchema"
import {
  PRODUCT_ANALYTICS_MODE_IDS,
  PRODUCT_ANALYTICS_SETTING_IDS,
  type ProductAnalyticsEntrypoint,
} from "~/services/productAnalytics/contracts"
import type { BalanceHistoryPreferences } from "~/types/dailyBalanceHistory"
import type { ModelRedirectPreferences } from "~/types/managedSiteModelRedirect"
import { USAGE_HISTORY_SCHEDULE_MODE } from "~/types/usageHistory"

import {
  normalizeNonNegativeInteger,
  normalizeNonNegativeMinutes,
  type SettingChangedPayload,
} from "./values"
import type { SettingsSnapshotProjection } from "./values"

/** Project auto refresh into privacy-reviewed analytics facts. */
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

/** Project usage history into privacy-reviewed analytics facts. */
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

/** Map the stored schedule choice to its controlled analytics mode. */
function getUsageHistoryScheduleMode(mode: string | undefined) {
  if (mode === USAGE_HISTORY_SCHEDULE_MODE.MANUAL) {
    return PRODUCT_ANALYTICS_MODE_IDS.UsageHistoryManual
  }
  if (mode === USAGE_HISTORY_SCHEDULE_MODE.ALARM) {
    return PRODUCT_ANALYTICS_MODE_IDS.UsageHistoryAlarm
  }
  return PRODUCT_ANALYTICS_MODE_IDS.UsageHistoryAfterRefresh
}

/** Project balance history into privacy-reviewed analytics facts. */
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

/** Resolve balance history defaults for older saved preferences. */
function getBalanceHistoryPreferences(
  preferences: UserPreferences,
): BalanceHistoryPreferences {
  return preferences.balanceHistory ?? DEFAULT_PREFERENCES.balanceHistory!
}

/** Project model redirect into privacy-reviewed analytics facts. */
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

/** Resolve model redirect defaults before projecting controlled flags. */
function getModelRedirectPreferences(
  preferences: UserPreferences,
): ModelRedirectPreferences {
  return preferences.modelRedirect ?? DEFAULT_PREFERENCES.modelRedirect
}

/** Project redemption assist into privacy-reviewed analytics facts. */
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

/** Resolve redemption assist defaults before projecting controlled flags. */
function getRedemptionAssistPreferences(
  preferences: UserPreferences,
): RedemptionAssistPreferences {
  return preferences.redemptionAssist ?? DEFAULT_PREFERENCES.redemptionAssist!
}

/** Project web ai api check into privacy-reviewed analytics facts. */
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

/** Resolve web verification defaults before projecting controlled flags. */
function getWebAiApiCheckPreferences(
  preferences: UserPreferences,
): WebAiApiCheckPreferences {
  return preferences.webAiApiCheck ?? DEFAULT_PREFERENCES.webAiApiCheck!
}

/** Keep patch attribution beside the safe projection of each settings area. */
export const automationSettingsSnapshots = {
  autoRefresh: {
    keys: ["accountAutoRefresh"],
    build: buildAutoRefreshSnapshot,
  },
  usageHistory: { keys: ["usageHistory"], build: buildUsageHistorySnapshot },
  balanceHistory: {
    keys: ["balanceHistory"],
    build: buildBalanceHistorySnapshot,
  },
  modelRedirect: { keys: ["modelRedirect"], build: buildModelRedirectSnapshot },
  redemptionAssist: {
    keys: ["redemptionAssist"],
    build: buildRedemptionAssistSnapshot,
  },
  webAiApiCheck: { keys: ["webAiApiCheck"], build: buildWebAiApiCheckSnapshot },
} satisfies Record<string, SettingsSnapshotProjection>
