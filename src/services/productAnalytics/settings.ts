import { DEFAULT_PREFERENCES } from "~/services/preferences/preferencesDefaults"
import { type UserPreferences } from "~/services/preferences/preferencesSchema"
import { buildAutoCheckinConfigSnapshotProperties } from "~/services/productAnalytics/autoCheckin"
import {
  PRODUCT_ANALYTICS_EVENTS,
  type ProductAnalyticsEntrypoint,
  type ProductAnalyticsEventPayload,
} from "~/services/productAnalytics/contracts"
import { trackProductAnalyticsEvent } from "~/services/productAnalytics/dispatch"
import { SETTINGS_SNAPSHOT_AUTOMATIC_BYPASS_ENABLED_PROPERTY } from "~/services/productAnalytics/settingsSnapshot"
import type { DeepPartial } from "~/types/utils"
import { deepOverride } from "~/utils"

import { automationSettingsSnapshots } from "./settingsSnapshots/automation"
import { generalSettingsSnapshots } from "./settingsSnapshots/general"
import { integrationsSettingsSnapshots } from "./settingsSnapshots/integrations"
import { managedSiteSettingsSnapshots } from "./settingsSnapshots/managedSite"
import {
  buildAutomaticFeatureBypassSnapshot,
  protectionSettingsSnapshots,
} from "./settingsSnapshots/protection"
import type {
  SettingChangedPayload,
  SettingsSnapshotProjection,
} from "./settingsSnapshots/values"

type SettingsSnapshotCapturedPayload = ProductAnalyticsEventPayload<
  typeof PRODUCT_ANALYTICS_EVENTS.SettingsSnapshotCaptured
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

const SETTINGS_SNAPSHOT_PROJECTIONS: Record<
  SettingsSnapshotKey,
  SettingsSnapshotProjection
> = {
  ...generalSettingsSnapshots,
  ...automationSettingsSnapshots,
  ...managedSiteSettingsSnapshots,
  ...protectionSettingsSnapshots,
  ...integrationsSettingsSnapshots,
  autoCheckin: {
    keys: ["autoCheckin"],
    build: (preferences, entrypoint) =>
      buildAutoCheckinConfigSnapshotProperties(
        deepOverride(
          DEFAULT_PREFERENCES.autoCheckin!,
          preferences.autoCheckin ?? {},
        ),
        entrypoint,
      ),
  },
}

/** Build the reviewed projection registered for one settings area. */
function buildSnapshotByKey(
  key: SettingsSnapshotKey,
  preferences: UserPreferences,
  entrypoint: ProductAnalyticsEntrypoint,
): SettingChangedPayload {
  return SETTINGS_SNAPSHOT_PROJECTIONS[key].build(preferences, entrypoint)
}

/** Select settings areas in canonical order; shared preference keys can affect multiple projections. */
function resolveSnapshotKeysForPatch(patch?: PreferencePatch) {
  if (!patch) return ALL_SETTINGS_SNAPSHOT_KEYS
  return ALL_SETTINGS_SNAPSHOT_KEYS.filter((key) =>
    SETTINGS_SNAPSHOT_PROJECTIONS[key].keys.some((field) => field in patch),
  )
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
    auto_provision_key_on_account_add_mode:
      account.auto_provision_key_on_account_add_mode,
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
    [SETTINGS_SNAPSHOT_AUTOMATIC_BYPASS_ENABLED_PROPERTY]:
      tempWindowFallback.enabled,
    ...buildAutomaticFeatureBypassSnapshot(preferences),
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
