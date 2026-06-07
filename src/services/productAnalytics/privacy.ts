import { SUPPORTED_UI_LANGUAGES } from "~/constants"
import {
  CURRENCY_TYPES,
  DASHBOARD_TAB_TYPES,
  SORT_FIELDS,
  SORT_ORDERS,
} from "~/types"
import { LOG_LEVELS } from "~/types/logging"
import { THEME_MODES } from "~/types/theme"

import {
  PRODUCT_ANALYTICS_ACCOUNT_AUTO_DETECT_FAILURE_REASONS,
  PRODUCT_ANALYTICS_ACCOUNT_AUTO_DETECT_FETCH_CONTEXT_KINDS,
  PRODUCT_ANALYTICS_ACCOUNT_AUTO_DETECT_STRATEGIES,
  PRODUCT_ANALYTICS_ACTION_IDS,
  PRODUCT_ANALYTICS_API_TYPES,
  PRODUCT_ANALYTICS_AUTO_CHECKIN_RUN_KINDS,
  PRODUCT_ANALYTICS_AUTO_CHECKIN_SCHEDULE_MODES,
  PRODUCT_ANALYTICS_AUTO_CHECKIN_SKIP_REASONS,
  PRODUCT_ANALYTICS_EDITOR_MODES,
  PRODUCT_ANALYTICS_ENTRYPOINTS,
  PRODUCT_ANALYTICS_ERROR_CATEGORIES,
  PRODUCT_ANALYTICS_EVENTS,
  PRODUCT_ANALYTICS_FAILURE_REASONS,
  PRODUCT_ANALYTICS_FAILURE_STAGES,
  PRODUCT_ANALYTICS_FEATURE_IDS,
  PRODUCT_ANALYTICS_MANAGED_SITE_TYPES,
  PRODUCT_ANALYTICS_MODE_IDS,
  PRODUCT_ANALYTICS_OPTIONS_PAGE_TARGET_IDS,
  PRODUCT_ANALYTICS_PAGE_IDS,
  PRODUCT_ANALYTICS_PERMISSION_FAILURE_REASONS,
  PRODUCT_ANALYTICS_PERMISSION_IDS,
  PRODUCT_ANALYTICS_PERMISSION_OPERATIONS,
  PRODUCT_ANALYTICS_PERMISSION_OUTCOMES,
  PRODUCT_ANALYTICS_PRODUCT_ANNOUNCEMENT_ACTION_KINDS,
  PRODUCT_ANALYTICS_PRODUCT_ANNOUNCEMENT_SEVERITIES,
  PRODUCT_ANALYTICS_REQUESTED_AUTH_MODES,
  PRODUCT_ANALYTICS_RESULTS,
  PRODUCT_ANALYTICS_SETTING_IDS,
  PRODUCT_ANALYTICS_SITE_TYPES,
  PRODUCT_ANALYTICS_SOURCE_KINDS,
  PRODUCT_ANALYTICS_SPONSOR_ACTION_KINDS,
  PRODUCT_ANALYTICS_SPONSOR_CATALOG_SOURCES,
  PRODUCT_ANALYTICS_SPONSOR_SUPPORT_STATUSES,
  PRODUCT_ANALYTICS_STATUS_KINDS,
  PRODUCT_ANALYTICS_SURFACE_IDS,
  PRODUCT_ANALYTICS_TARGET_KINDS,
  PRODUCT_ANALYTICS_TARGET_STATES,
  PRODUCT_ANALYTICS_TELEMETRY_SOURCES,
  PRODUCT_ANALYTICS_TOOLBAR_ACTION_CLICK_BEHAVIORS,
  type ProductAnalyticsEventName,
} from "./events"

type SanitizedProperties = Record<string, string | boolean | number>

const FORBIDDEN_KEY_PATTERN =
  /(url|uri|origin|host|hostname|domain|path|token|key|cookie|authorization|auth|email|balance|quota|cost|prompt|response|content|stack|trace|name|note|user|account)/i

const EVENT_ALLOWED_KEYS = {
  [PRODUCT_ANALYTICS_EVENTS.AppOpened]: ["entrypoint"],
  [PRODUCT_ANALYTICS_EVENTS.PageViewed]: ["page_id", "entrypoint"],
  [PRODUCT_ANALYTICS_EVENTS.FeatureActionStarted]: [
    "feature_id",
    "action_id",
    "surface_id",
    "entrypoint",
  ],
  [PRODUCT_ANALYTICS_EVENTS.FeatureActionCompleted]: [
    "feature_id",
    "action_id",
    "surface_id",
    "result",
    "error_category",
    "duration_ms",
    "api_type",
    "source_kind",
    "mode",
    "editor_mode",
    "status_kind",
    "telemetry_source",
    "target_kind",
    "target_state",
    "target_page_id",
    "managed_site_type",
    "source_managed_site_type",
    "target_managed_site_type",
    "failure_stage",
    "failure_reason",
    "account_auto_detect_failure_reason",
    "auto_detect_strategy",
    "requested_auth_mode",
    "site_type",
    "fetch_context_kind",
    "cache_hit",
    "cache_used",
    "fallback_available",
    "fallback_used",
    "retry_attempted",
    "retry_count",
    "temp_context_used",
    "incognito_context_used",
    "stale_response_ignored",
    "background_execution",
    "current_tab_matched",
    "item_count",
    "selected_count",
    "success_count",
    "failure_count",
    "skipped_count",
    "warning_count",
    "ready_count",
    "blocked_count",
    "model_count",
    "filter_count",
    "result_count",
    "usage_data_present",
    "route_params_present",
    "shield_bypass_prompt_shown_count",
    "shield_bypass_prompt_dismissed_count",
    "shield_bypass_settings_visited_count",
    "temp_window_fetch_success_count",
    "temp_window_fetch_failure_count",
    "temp_window_turnstile_fetch_success_count",
    "temp_window_turnstile_fetch_failure_count",
    "sponsor_action_kind",
    "sponsor_catalog_source",
    "sponsor_id",
    "sponsor_rank",
    "sponsor_support_status",
    "sponsor_supported_count",
    "sponsor_unsupported_count",
    "product_announcement_id",
    "product_announcement_severity",
    "product_announcement_action_kind",
    "product_announcement_active_count",
    "entrypoint",
  ],
  [PRODUCT_ANALYTICS_EVENTS.ShieldBypassSummaryCaptured]: [
    "feature_id",
    "surface_id",
    "entrypoint",
    "shield_bypass_prompt_shown_count",
    "shield_bypass_prompt_dismissed_count",
    "shield_bypass_settings_visited_count",
    "temp_window_fetch_success_count",
    "temp_window_fetch_failure_count",
    "temp_window_turnstile_fetch_success_count",
    "temp_window_turnstile_fetch_failure_count",
  ],
  [PRODUCT_ANALYTICS_EVENTS.AutoCheckinRunSummaryCaptured]: [
    "run_kind",
    "entrypoint",
    "total_accounts",
    "detection_enabled_accounts",
    "auto_checkin_enabled_accounts",
    "provider_available_accounts",
    "runnable_accounts",
    "success_count",
    "failed_count",
    "skipped_count",
    "retry_enabled",
    "retry_pending_before",
    "retry_attempted",
    "retry_rescued",
    "retry_pending_after",
    "retry_exhausted",
  ],
  [PRODUCT_ANALYTICS_EVENTS.AutoCheckinAccountGroupCaptured]: [
    "run_kind",
    "entrypoint",
    "site_type",
    "requested_auth_mode",
    "skip_reason",
    "total_accounts",
    "runnable_accounts",
    "success_count",
    "failed_count",
    "skipped_count",
  ],
  [PRODUCT_ANALYTICS_EVENTS.SettingChanged]: [
    "setting_id",
    "enabled",
    "configured",
    "theme_mode",
    "normalized_language",
    "toolbar_action_click_behavior",
    "open_changelog_on_update_enabled",
    "active_tab",
    "currency_type",
    "sort_field",
    "sort_order",
    "sorting_priority_configured",
    "sorting_priority_customized",
    "sorting_priority_enabled_criteria_count",
    "console_logging_enabled",
    "log_level",
    "auto_provision_key_on_account_add_enabled",
    "auto_fill_current_site_url_on_account_add_enabled",
    "warn_on_duplicate_account_add_enabled",
    "show_today_cashflow_enabled",
    "show_health_status_enabled",
    "refresh_on_open_enabled",
    "refresh_interval_minutes",
    "min_refresh_interval_seconds",
    "sync_interval_minutes",
    "polling_interval_minutes",
    "retention_days",
    "end_of_day_capture_enabled",
    "estimated_today_income_enabled",
    "managed_site_type",
    "new_api_configured",
    "done_hub_configured",
    "veloera_configured",
    "octopus_configured",
    "axon_hub_configured",
    "claude_code_hub_configured",
    "cli_proxy_configured",
    "claude_code_router_configured",
    "concurrency",
    "rate_limit_rpm",
    "rate_limit_burst",
    "allowed_models_configured",
    "global_filters_configured",
    "standard_models_configured",
    "prune_missing_targets_on_model_sync_enabled",
    "context_menu_enabled",
    "relaxed_code_validation_enabled",
    "url_whitelist_enabled",
    "url_whitelist_patterns_configured",
    "url_whitelist_account_urls_enabled",
    "url_whitelist_checkin_redeem_urls_enabled",
    "auto_detect_enabled",
    "auto_detect_enhanced_enabled",
    "auto_detect_url_patterns_configured",
    "popup_enabled",
    "sidepanel_enabled",
    "options_enabled",
    "auto_refresh_enabled",
    "manual_refresh_enabled",
    "reminder_dismissed",
    "mode",
    "auto_sync_enabled",
    "backup_encryption_enabled",
    "sync_strategy",
    "sync_accounts_enabled",
    "sync_bookmarks_enabled",
    "sync_api_profiles_enabled",
    "sync_preferences_enabled",
    "browser_channel_enabled",
    "telegram_channel_enabled",
    "feishu_channel_enabled",
    "dingtalk_channel_enabled",
    "wecom_channel_enabled",
    "ntfy_channel_enabled",
    "webhook_channel_enabled",
    "auto_checkin_task_enabled",
    "webdav_auto_sync_task_enabled",
    "managed_site_model_sync_task_enabled",
    "usage_history_sync_task_enabled",
    "balance_history_capture_task_enabled",
    "site_announcements_task_enabled",
    "third_party_channel_count",
    "task_enabled_count",
    "notification_enabled",
    "global_enabled",
    "ui_pretrigger_enabled",
    "notify_completion_enabled",
    "retry_enabled",
    "schedule_mode",
    "retry_interval_minutes",
    "retry_max_attempts",
    "window_length_minutes",
    "deterministic_time_minutes",
    "entrypoint",
  ],
  [PRODUCT_ANALYTICS_EVENTS.SettingsSnapshotCaptured]: [
    "setting_id",
    "enabled",
    "configured",
    "theme_mode",
    "normalized_language",
    "toolbar_action_click_behavior",
    "open_changelog_on_update_enabled",
    "active_tab",
    "currency_type",
    "sort_field",
    "sort_order",
    "sorting_priority_configured",
    "sorting_priority_customized",
    "sorting_priority_enabled_criteria_count",
    "console_logging_enabled",
    "log_level",
    "auto_provision_key_on_account_add_enabled",
    "auto_fill_current_site_url_on_account_add_enabled",
    "warn_on_duplicate_account_add_enabled",
    "show_today_cashflow_enabled",
    "show_health_status_enabled",
    "refresh_on_open_enabled",
    "refresh_interval_minutes",
    "min_refresh_interval_seconds",
    "sync_interval_minutes",
    "polling_interval_minutes",
    "retention_days",
    "end_of_day_capture_enabled",
    "estimated_today_income_enabled",
    "managed_site_type",
    "new_api_configured",
    "done_hub_configured",
    "veloera_configured",
    "octopus_configured",
    "axon_hub_configured",
    "claude_code_hub_configured",
    "cli_proxy_configured",
    "claude_code_router_configured",
    "concurrency",
    "rate_limit_rpm",
    "rate_limit_burst",
    "allowed_models_configured",
    "global_filters_configured",
    "standard_models_configured",
    "prune_missing_targets_on_model_sync_enabled",
    "context_menu_enabled",
    "relaxed_code_validation_enabled",
    "url_whitelist_enabled",
    "url_whitelist_patterns_configured",
    "url_whitelist_account_urls_enabled",
    "url_whitelist_checkin_redeem_urls_enabled",
    "auto_detect_enabled",
    "auto_detect_enhanced_enabled",
    "auto_detect_url_patterns_configured",
    "popup_enabled",
    "sidepanel_enabled",
    "options_enabled",
    "auto_refresh_enabled",
    "manual_refresh_enabled",
    "reminder_dismissed",
    "mode",
    "auto_sync_enabled",
    "backup_encryption_enabled",
    "sync_strategy",
    "sync_accounts_enabled",
    "sync_bookmarks_enabled",
    "sync_api_profiles_enabled",
    "sync_preferences_enabled",
    "browser_channel_enabled",
    "telegram_channel_enabled",
    "feishu_channel_enabled",
    "dingtalk_channel_enabled",
    "wecom_channel_enabled",
    "ntfy_channel_enabled",
    "webhook_channel_enabled",
    "auto_checkin_task_enabled",
    "webdav_auto_sync_task_enabled",
    "managed_site_model_sync_task_enabled",
    "usage_history_sync_task_enabled",
    "balance_history_capture_task_enabled",
    "site_announcements_task_enabled",
    "third_party_channel_count",
    "task_enabled_count",
    "notification_enabled",
    "global_enabled",
    "ui_pretrigger_enabled",
    "notify_completion_enabled",
    "retry_enabled",
    "schedule_mode",
    "retry_interval_minutes",
    "retry_max_attempts",
    "window_length_minutes",
    "deterministic_time_minutes",
    "account_auto_refresh_enabled",
    "account_auto_refresh_on_open_enabled",
    "account_auto_refresh_interval_minutes",
    "account_auto_refresh_min_interval_seconds",
    "usage_history_enabled",
    "usage_history_mode",
    "usage_history_sync_interval_minutes",
    "usage_history_retention_days",
    "balance_history_enabled",
    "balance_history_end_of_day_capture_enabled",
    "balance_history_estimated_today_income_enabled",
    "balance_history_retention_days",
    "managed_site_model_sync_enabled",
    "managed_site_model_sync_interval_minutes",
    "managed_site_model_sync_concurrency",
    "managed_site_model_sync_retry_max_attempts",
    "managed_site_model_sync_rate_limit_rpm",
    "managed_site_model_sync_rate_limit_burst",
    "managed_site_model_sync_allowed_models_configured",
    "managed_site_model_sync_global_filters_configured",
    "auto_checkin_global_enabled",
    "auto_checkin_ui_pretrigger_enabled",
    "auto_checkin_notify_completion_enabled",
    "auto_checkin_retry_enabled",
    "auto_checkin_schedule_mode",
    "auto_checkin_retry_interval_minutes",
    "auto_checkin_retry_max_attempts",
    "auto_checkin_window_length_minutes",
    "auto_checkin_deterministic_time_minutes",
    "model_redirect_enabled",
    "model_redirect_standard_models_configured",
    "model_redirect_prune_missing_targets_on_model_sync_enabled",
    "redemption_assist_enabled",
    "redemption_assist_context_menu_enabled",
    "redemption_assist_relaxed_code_validation_enabled",
    "redemption_assist_allowlist_enabled",
    "redemption_assist_allowlist_patterns_configured",
    "redemption_assist_allowlist_account_urls_enabled",
    "redemption_assist_allowlist_checkin_redeem_urls_enabled",
    "web_ai_api_check_enabled",
    "web_ai_api_check_context_menu_enabled",
    "web_ai_api_check_auto_detect_enabled",
    "web_ai_api_check_auto_detect_enhanced_enabled",
    "web_ai_api_check_auto_detect_patterns_configured",
    "temp_window_fallback_enabled",
    "temp_window_fallback_popup_enabled",
    "temp_window_fallback_sidepanel_enabled",
    "temp_window_fallback_options_enabled",
    "temp_window_fallback_auto_refresh_enabled",
    "temp_window_fallback_manual_refresh_enabled",
    "temp_window_fallback_mode",
    "temp_window_fallback_reminder_dismissed",
    "webdav_configured",
    "webdav_auto_sync_enabled",
    "webdav_backup_encryption_enabled",
    "webdav_sync_strategy",
    "webdav_sync_interval_minutes",
    "webdav_sync_accounts_enabled",
    "webdav_sync_bookmarks_enabled",
    "webdav_sync_api_profiles_enabled",
    "webdav_sync_preferences_enabled",
    "task_notifications_enabled",
    "task_notifications_browser_channel_enabled",
    "task_notifications_telegram_channel_enabled",
    "task_notifications_feishu_channel_enabled",
    "task_notifications_dingtalk_channel_enabled",
    "task_notifications_wecom_channel_enabled",
    "task_notifications_ntfy_channel_enabled",
    "task_notifications_webhook_channel_enabled",
    "task_notifications_auto_checkin_task_enabled",
    "task_notifications_webdav_auto_sync_task_enabled",
    "task_notifications_managed_site_model_sync_task_enabled",
    "task_notifications_usage_history_sync_task_enabled",
    "task_notifications_balance_history_capture_task_enabled",
    "task_notifications_site_announcements_task_enabled",
    "task_notifications_third_party_channel_count",
    "task_notifications_task_enabled_count",
    "site_announcements_enabled",
    "site_announcements_notification_enabled",
    "site_announcements_polling_interval_minutes",
    "entrypoint",
  ],
  [PRODUCT_ANALYTICS_EVENTS.PermissionResult]: [
    "permission_id",
    "result",
    "operation",
    "outcome",
    "failure_reason",
    "was_granted_before",
    "was_granted_after",
    "entrypoint",
  ],
  [PRODUCT_ANALYTICS_EVENTS.SiteEcosystemSnapshot]: [
    "total_account_count",
    "distinct_site_count",
    "known_site_type_count",
    "unknown_site_count",
    "managed_site_count",
  ],
  [PRODUCT_ANALYTICS_EVENTS.SiteTypePresent]: ["site_type", "account_count"],
} satisfies Record<ProductAnalyticsEventName, readonly string[]>

const FIELD_ALLOWED_VALUES: Record<string, readonly string[]> = {
  active_tab: DASHBOARD_TAB_TYPES,
  action_id: Object.values(PRODUCT_ANALYTICS_ACTION_IDS),
  auto_checkin_schedule_mode: Object.values(
    PRODUCT_ANALYTICS_AUTO_CHECKIN_SCHEDULE_MODES,
  ),
  api_type: Object.values(PRODUCT_ANALYTICS_API_TYPES),
  editor_mode: Object.values(PRODUCT_ANALYTICS_EDITOR_MODES),
  entrypoint: Object.values(PRODUCT_ANALYTICS_ENTRYPOINTS),
  error_category: Object.values(PRODUCT_ANALYTICS_ERROR_CATEGORIES),
  failure_stage: Object.values(PRODUCT_ANALYTICS_FAILURE_STAGES),
  feature_id: Object.values(PRODUCT_ANALYTICS_FEATURE_IDS),
  currency_type: CURRENCY_TYPES,
  log_level: LOG_LEVELS,
  managed_site_type: Object.values(PRODUCT_ANALYTICS_MANAGED_SITE_TYPES),
  mode: Object.values(PRODUCT_ANALYTICS_MODE_IDS),
  normalized_language: SUPPORTED_UI_LANGUAGES,
  page_id: Object.values(PRODUCT_ANALYTICS_PAGE_IDS),
  permission_id: Object.values(PRODUCT_ANALYTICS_PERMISSION_IDS),
  operation: Object.values(PRODUCT_ANALYTICS_PERMISSION_OPERATIONS),
  outcome: Object.values(PRODUCT_ANALYTICS_PERMISSION_OUTCOMES),
  failure_reason: Object.values(PRODUCT_ANALYTICS_PERMISSION_FAILURE_REASONS),
  account_auto_detect_failure_reason: Object.values(
    PRODUCT_ANALYTICS_ACCOUNT_AUTO_DETECT_FAILURE_REASONS,
  ),
  auto_detect_strategy: Object.values(
    PRODUCT_ANALYTICS_ACCOUNT_AUTO_DETECT_STRATEGIES,
  ),
  requested_auth_mode: Object.values(PRODUCT_ANALYTICS_REQUESTED_AUTH_MODES),
  fetch_context_kind: Object.values(
    PRODUCT_ANALYTICS_ACCOUNT_AUTO_DETECT_FETCH_CONTEXT_KINDS,
  ),
  result: Object.values(PRODUCT_ANALYTICS_RESULTS),
  run_kind: Object.values(PRODUCT_ANALYTICS_AUTO_CHECKIN_RUN_KINDS),
  schedule_mode: Object.values(PRODUCT_ANALYTICS_AUTO_CHECKIN_SCHEDULE_MODES),
  setting_id: Object.values(PRODUCT_ANALYTICS_SETTING_IDS),
  site_type: PRODUCT_ANALYTICS_SITE_TYPES,
  skip_reason: Object.values(PRODUCT_ANALYTICS_AUTO_CHECKIN_SKIP_REASONS),
  source_managed_site_type: Object.values(PRODUCT_ANALYTICS_MANAGED_SITE_TYPES),
  source_kind: Object.values(PRODUCT_ANALYTICS_SOURCE_KINDS),
  sort_field: SORT_FIELDS,
  sort_order: SORT_ORDERS,
  sponsor_action_kind: Object.values(PRODUCT_ANALYTICS_SPONSOR_ACTION_KINDS),
  sponsor_catalog_source: Object.values(
    PRODUCT_ANALYTICS_SPONSOR_CATALOG_SOURCES,
  ),
  sponsor_support_status: Object.values(
    PRODUCT_ANALYTICS_SPONSOR_SUPPORT_STATUSES,
  ),
  product_announcement_action_kind: Object.values(
    PRODUCT_ANALYTICS_PRODUCT_ANNOUNCEMENT_ACTION_KINDS,
  ),
  product_announcement_severity: Object.values(
    PRODUCT_ANALYTICS_PRODUCT_ANNOUNCEMENT_SEVERITIES,
  ),
  status_kind: Object.values(PRODUCT_ANALYTICS_STATUS_KINDS),
  surface_id: Object.values(PRODUCT_ANALYTICS_SURFACE_IDS),
  target_page_id: Object.values(PRODUCT_ANALYTICS_OPTIONS_PAGE_TARGET_IDS),
  target_kind: Object.values(PRODUCT_ANALYTICS_TARGET_KINDS),
  target_state: Object.values(PRODUCT_ANALYTICS_TARGET_STATES),
  target_managed_site_type: Object.values(PRODUCT_ANALYTICS_MANAGED_SITE_TYPES),
  telemetry_source: Object.values(PRODUCT_ANALYTICS_TELEMETRY_SOURCES),
  temp_window_fallback_mode: Object.values(PRODUCT_ANALYTICS_MODE_IDS),
  theme_mode: THEME_MODES,
  toolbar_action_click_behavior: Object.values(
    PRODUCT_ANALYTICS_TOOLBAR_ACTION_CLICK_BEHAVIORS,
  ),
  usage_history_mode: Object.values(PRODUCT_ANALYTICS_MODE_IDS),
  sync_strategy: Object.values(PRODUCT_ANALYTICS_MODE_IDS),
  webdav_sync_strategy: Object.values(PRODUCT_ANALYTICS_MODE_IDS),
}

const PRIVACY_REVIEWED_ALLOWED_KEYS = new Set([
  "account_count",
  "account_auto_detect_failure_reason",
  "account_auto_refresh_enabled",
  "account_auto_refresh_interval_minutes",
  "account_auto_refresh_min_interval_seconds",
  "account_auto_refresh_on_open_enabled",
  "account_count",
  "active_tab",
  "background_execution",
  "auto_checkin_enabled_accounts",
  "detection_enabled_accounts",
  "provider_available_accounts",
  "product_announcement_id",
  "product_announcement_active_count",
  "runnable_accounts",
  "total_accounts",
  "cache_hit",
  "cache_used",
  "auto_detect_url_patterns_configured",
  "fallback_available",
  "fallback_used",
  "balance_history_capture_task_enabled",
  "balance_history_estimated_today_income_enabled",
  "failure_reason",
  "requested_auth_mode",
  "auto_fill_current_site_url_on_account_add_enabled",
  "auto_provision_key_on_account_add_enabled",
  "balance_history_enabled",
  "balance_history_end_of_day_capture_enabled",
  "balance_history_retention_days",
  "currency_type",
  "estimated_today_income_enabled",
  "managed_site_type",
  "retry_attempted",
  "retry_count",
  "new_api_configured",
  "normalized_language",
  "stale_response_ignored",
  "redemption_assist_allowlist_account_urls_enabled",
  "redemption_assist_allowlist_checkin_redeem_urls_enabled",
  "temp_context_used",
  "shield_bypass_prompt_dismissed_count",
  "shield_bypass_prompt_shown_count",
  "sponsor_id",
  "sync_accounts_enabled",
  "source_managed_site_type",
  "target_managed_site_type",
  "total_account_count",
  "url_whitelist_account_urls_enabled",
  "url_whitelist_checkin_redeem_urls_enabled",
  "url_whitelist_enabled",
  "url_whitelist_patterns_configured",
  "task_notifications_balance_history_capture_task_enabled",
  "webdav_sync_accounts_enabled",
  "webdav_sync_api_profiles_enabled",
])

const RAW_NUMBER_ALLOWED_KEYS = new Set([
  "account_count",
  "auto_checkin_enabled_accounts",
  "account_auto_refresh_interval_minutes",
  "account_auto_refresh_min_interval_seconds",
  "sorting_priority_enabled_criteria_count",
  "blocked_count",
  "balance_history_retention_days",
  "concurrency",
  "detection_enabled_accounts",
  "distinct_site_count",
  "duration_ms",
  "failure_count",
  "failed_count",
  "filter_count",
  "item_count",
  "known_site_type_count",
  "managed_site_count",
  "managed_site_model_sync_concurrency",
  "managed_site_model_sync_interval_minutes",
  "managed_site_model_sync_rate_limit_burst",
  "managed_site_model_sync_rate_limit_rpm",
  "managed_site_model_sync_retry_max_attempts",
  "min_refresh_interval_seconds",
  "model_count",
  "polling_interval_minutes",
  "product_announcement_active_count",
  "provider_available_accounts",
  "rate_limit_burst",
  "rate_limit_rpm",
  "ready_count",
  "refresh_interval_minutes",
  "retention_days",
  "result_count",
  "retry_count",
  "retry_attempted",
  "retry_exhausted",
  "retry_interval_minutes",
  "retry_max_attempts",
  "retry_pending_after",
  "retry_pending_before",
  "retry_rescued",
  "runnable_accounts",
  "selected_count",
  "shield_bypass_prompt_dismissed_count",
  "shield_bypass_prompt_shown_count",
  "shield_bypass_settings_visited_count",
  "site_announcements_polling_interval_minutes",
  "skipped_count",
  "sponsor_supported_count",
  "sponsor_unsupported_count",
  "sponsor_rank",
  "success_count",
  "sync_interval_minutes",
  "task_enabled_count",
  "task_notifications_task_enabled_count",
  "task_notifications_third_party_channel_count",
  "temp_window_fetch_failure_count",
  "temp_window_fetch_success_count",
  "temp_window_turnstile_fetch_failure_count",
  "temp_window_turnstile_fetch_success_count",
  "third_party_channel_count",
  "total_accounts",
  "total_account_count",
  "unknown_site_count",
  "usage_history_retention_days",
  "usage_history_sync_interval_minutes",
  "warning_count",
  "webdav_sync_interval_minutes",
  "window_length_minutes",
  "deterministic_time_minutes",
  "auto_checkin_retry_interval_minutes",
  "auto_checkin_retry_max_attempts",
  "auto_checkin_window_length_minutes",
  "auto_checkin_deterministic_time_minutes",
])

const FEATURE_ACTION_COMPLETED_ALLOWED_FAILURE_REASONS: ReadonlySet<string> =
  new Set(Object.values(PRODUCT_ANALYTICS_FAILURE_REASONS))

const FEATURE_ACTION_COMPLETED_BOOLEAN_FIELDS = new Set([
  "cache_hit",
  "cache_used",
  "fallback_available",
  "fallback_used",
  "retry_attempted",
  "temp_context_used",
  "incognito_context_used",
  "stale_response_ignored",
  "background_execution",
  "current_tab_matched",
  "route_params_present",
  "usage_data_present",
])

/**
 * Accepts only scalar property values supported by PostHog product analytics.
 */
function isAllowedScalar(value: unknown): value is string | boolean | number {
  return (
    typeof value === "string" ||
    typeof value === "boolean" ||
    (typeof value === "number" &&
      Number.isInteger(value) &&
      value >= 0 &&
      value <= Number.MAX_SAFE_INTEGER)
  )
}

/**
 * Confirms a sanitized field uses an approved enum value or the enabled flag.
 */
function isAllowedFieldValue(
  eventName: ProductAnalyticsEventName,
  key: string,
  value: string | boolean | number,
): boolean {
  if (typeof value === "number") {
    if (
      eventName === PRODUCT_ANALYTICS_EVENTS.FeatureActionCompleted &&
      FEATURE_ACTION_COMPLETED_BOOLEAN_FIELDS.has(key)
    ) {
      return false
    }

    return RAW_NUMBER_ALLOWED_KEYS.has(key)
  }

  if (typeof value === "boolean") {
    if (
      eventName === PRODUCT_ANALYTICS_EVENTS.FeatureActionCompleted &&
      FEATURE_ACTION_COMPLETED_BOOLEAN_FIELDS.has(key)
    ) {
      return true
    }

    return (
      key === "enabled" ||
      key === "configured" ||
      key === "usage_data_present" ||
      key === "was_granted_before" ||
      key === "was_granted_after" ||
      key === "incognito_context_used" ||
      key === "current_tab_matched" ||
      key === "reminder_dismissed" ||
      key === "sorting_priority_customized" ||
      key === "temp_window_fallback_reminder_dismissed" ||
      key.endsWith("_enabled") ||
      key.endsWith("_configured")
    )
  }

  if (key === "sponsor_id") {
    return /^[a-z0-9][a-z0-9-]*$/.test(value)
  }

  if (key === "product_announcement_id") {
    return /^[a-z0-9][a-z0-9-]*$/.test(value)
  }

  if (
    key === "failure_reason" &&
    eventName === PRODUCT_ANALYTICS_EVENTS.FeatureActionCompleted
  ) {
    return FEATURE_ACTION_COMPLETED_ALLOWED_FAILURE_REASONS.has(value)
  }

  const allowedValues = FIELD_ALLOWED_VALUES[key]
  return Array.isArray(allowedValues) && allowedValues.includes(value)
}

/**
 * Allows sensitive-looking field names only after explicit privacy review.
 */
function isPrivacyReviewedKey(key: string): boolean {
  return (
    !FORBIDDEN_KEY_PATTERN.test(key) || PRIVACY_REVIEWED_ALLOWED_KEYS.has(key)
  )
}

/**
 * Applies every sanitizer gate for one candidate analytics property.
 */
function shouldKeepProperty(
  eventName: ProductAnalyticsEventName,
  allowedKeys: Set<string>,
  key: string,
  value: unknown,
): value is string | boolean | number {
  return (
    allowedKeys.has(key) &&
    isPrivacyReviewedKey(key) &&
    isAllowedScalar(value) &&
    isAllowedFieldValue(eventName, key, value)
  )
}

/**
 * Removes non-whitelisted, privacy-sensitive, non-scalar, and invalid enum fields.
 */
export function sanitizeProductAnalyticsEvent(
  eventName: ProductAnalyticsEventName,
  rawProperties: unknown,
): SanitizedProperties {
  if (!rawProperties || typeof rawProperties !== "object") return {}

  const allowedKeys = new Set(EVENT_ALLOWED_KEYS[eventName] ?? [])
  const sanitized: SanitizedProperties = {}

  for (const [key, value] of Object.entries(rawProperties)) {
    if (!shouldKeepProperty(eventName, allowedKeys, key, value)) continue

    sanitized[key] = value
  }

  return sanitized
}
