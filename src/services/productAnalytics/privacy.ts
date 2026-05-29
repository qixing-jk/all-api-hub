import {
  PRODUCT_ANALYTICS_ACTION_IDS,
  PRODUCT_ANALYTICS_API_TYPES,
  PRODUCT_ANALYTICS_AUTO_CHECKIN_DETERMINISTIC_TIME_BUCKETS,
  PRODUCT_ANALYTICS_AUTO_CHECKIN_RETRY_ATTEMPT_BUCKETS,
  PRODUCT_ANALYTICS_AUTO_CHECKIN_RETRY_INTERVAL_BUCKETS,
  PRODUCT_ANALYTICS_AUTO_CHECKIN_SCHEDULE_MODES,
  PRODUCT_ANALYTICS_AUTO_CHECKIN_WINDOW_LENGTH_BUCKETS,
  PRODUCT_ANALYTICS_COUNT_BUCKETS,
  PRODUCT_ANALYTICS_DURATION_BUCKETS,
  PRODUCT_ANALYTICS_EDITOR_MODES,
  PRODUCT_ANALYTICS_ENTRYPOINTS,
  PRODUCT_ANALYTICS_ERROR_CATEGORIES,
  PRODUCT_ANALYTICS_EVENTS,
  PRODUCT_ANALYTICS_FAILURE_STAGES,
  PRODUCT_ANALYTICS_FEATURE_IDS,
  PRODUCT_ANALYTICS_MANAGED_SITE_TYPES,
  PRODUCT_ANALYTICS_MODE_IDS,
  PRODUCT_ANALYTICS_PAGE_IDS,
  PRODUCT_ANALYTICS_PERMISSION_FAILURE_REASONS,
  PRODUCT_ANALYTICS_PERMISSION_IDS,
  PRODUCT_ANALYTICS_PERMISSION_OPERATIONS,
  PRODUCT_ANALYTICS_PERMISSION_OUTCOMES,
  PRODUCT_ANALYTICS_RESULTS,
  PRODUCT_ANALYTICS_SETTING_IDS,
  PRODUCT_ANALYTICS_SITE_TYPES,
  PRODUCT_ANALYTICS_SOURCE_KINDS,
  PRODUCT_ANALYTICS_SPONSOR_ACTION_KINDS,
  PRODUCT_ANALYTICS_SPONSOR_CATALOG_SOURCES,
  PRODUCT_ANALYTICS_SPONSOR_RANK_BUCKETS,
  PRODUCT_ANALYTICS_SPONSOR_SUPPORT_STATUSES,
  PRODUCT_ANALYTICS_STATUS_KINDS,
  PRODUCT_ANALYTICS_SURFACE_IDS,
  PRODUCT_ANALYTICS_TARGET_KINDS,
  PRODUCT_ANALYTICS_TARGET_STATES,
  PRODUCT_ANALYTICS_TELEMETRY_SOURCES,
  type ProductAnalyticsEventName,
} from "./events"

type SanitizedProperties = Record<string, string | boolean>

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
    "duration_bucket",
    "api_type",
    "source_kind",
    "mode",
    "editor_mode",
    "status_kind",
    "telemetry_source",
    "target_kind",
    "target_state",
    "managed_site_type",
    "source_managed_site_type",
    "target_managed_site_type",
    "failure_stage",
    "item_count_bucket",
    "selected_count_bucket",
    "success_count_bucket",
    "failure_count_bucket",
    "skipped_count_bucket",
    "warning_count_bucket",
    "ready_count_bucket",
    "blocked_count_bucket",
    "model_count_bucket",
    "filter_count_bucket",
    "result_count_bucket",
    "usage_data_present",
    "shield_bypass_prompt_shown_count_bucket",
    "shield_bypass_prompt_dismissed_count_bucket",
    "shield_bypass_settings_visited_count_bucket",
    "temp_window_fetch_success_count_bucket",
    "temp_window_fetch_failure_count_bucket",
    "temp_window_turnstile_fetch_success_count_bucket",
    "temp_window_turnstile_fetch_failure_count_bucket",
    "sponsor_action_kind",
    "sponsor_catalog_source",
    "sponsor_id",
    "sponsor_rank_bucket",
    "sponsor_support_status",
    "sponsor_supported_count_bucket",
    "sponsor_unsupported_count_bucket",
    "entrypoint",
  ],
  [PRODUCT_ANALYTICS_EVENTS.ShieldBypassSummaryCaptured]: [
    "feature_id",
    "surface_id",
    "entrypoint",
    "shield_bypass_prompt_shown_count_bucket",
    "shield_bypass_prompt_dismissed_count_bucket",
    "shield_bypass_settings_visited_count_bucket",
    "temp_window_fetch_success_count_bucket",
    "temp_window_fetch_failure_count_bucket",
    "temp_window_turnstile_fetch_success_count_bucket",
    "temp_window_turnstile_fetch_failure_count_bucket",
  ],
  [PRODUCT_ANALYTICS_EVENTS.SettingChanged]: [
    "setting_id",
    "enabled",
    "configured",
    "auto_provision_key_on_account_add_enabled",
    "auto_fill_current_site_url_on_account_add_enabled",
    "warn_on_duplicate_account_add_enabled",
    "show_today_cashflow_enabled",
    "show_health_status_enabled",
    "refresh_on_open_enabled",
    "refresh_interval_bucket",
    "min_refresh_interval_bucket",
    "sync_interval_bucket",
    "polling_interval_bucket",
    "retention_days_bucket",
    "end_of_day_capture_enabled",
    "managed_site_type",
    "new_api_configured",
    "done_hub_configured",
    "veloera_configured",
    "octopus_configured",
    "axon_hub_configured",
    "claude_code_hub_configured",
    "cli_proxy_configured",
    "claude_code_router_configured",
    "concurrency_bucket",
    "rate_limit_rpm_bucket",
    "rate_limit_burst_bucket",
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
    "auto_detect_url_patterns_configured",
    "popup_enabled",
    "sidepanel_enabled",
    "options_enabled",
    "auto_refresh_enabled",
    "manual_refresh_enabled",
    "mode",
    "auto_sync_enabled",
    "backup_encryption_enabled",
    "sync_strategy",
    "sync_accounts_enabled",
    "sync_bookmarks_enabled",
    "sync_api_profiles_enabled",
    "sync_preferences_enabled",
    "browser_channel_enabled",
    "third_party_channel_count_bucket",
    "task_enabled_count_bucket",
    "notification_enabled",
    "global_enabled",
    "ui_pretrigger_enabled",
    "notify_completion_enabled",
    "retry_enabled",
    "schedule_mode",
    "retry_interval_bucket",
    "retry_max_attempts_bucket",
    "window_length_bucket",
    "deterministic_time_bucket",
    "entrypoint",
  ],
  [PRODUCT_ANALYTICS_EVENTS.SettingsSnapshotCaptured]: [
    "setting_id",
    "enabled",
    "configured",
    "auto_provision_key_on_account_add_enabled",
    "auto_fill_current_site_url_on_account_add_enabled",
    "warn_on_duplicate_account_add_enabled",
    "show_today_cashflow_enabled",
    "show_health_status_enabled",
    "refresh_on_open_enabled",
    "refresh_interval_bucket",
    "min_refresh_interval_bucket",
    "sync_interval_bucket",
    "polling_interval_bucket",
    "retention_days_bucket",
    "end_of_day_capture_enabled",
    "managed_site_type",
    "new_api_configured",
    "done_hub_configured",
    "veloera_configured",
    "octopus_configured",
    "axon_hub_configured",
    "claude_code_hub_configured",
    "cli_proxy_configured",
    "claude_code_router_configured",
    "concurrency_bucket",
    "rate_limit_rpm_bucket",
    "rate_limit_burst_bucket",
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
    "auto_detect_url_patterns_configured",
    "popup_enabled",
    "sidepanel_enabled",
    "options_enabled",
    "auto_refresh_enabled",
    "manual_refresh_enabled",
    "mode",
    "auto_sync_enabled",
    "backup_encryption_enabled",
    "sync_strategy",
    "sync_accounts_enabled",
    "sync_bookmarks_enabled",
    "sync_api_profiles_enabled",
    "sync_preferences_enabled",
    "browser_channel_enabled",
    "third_party_channel_count_bucket",
    "task_enabled_count_bucket",
    "notification_enabled",
    "global_enabled",
    "ui_pretrigger_enabled",
    "notify_completion_enabled",
    "retry_enabled",
    "schedule_mode",
    "retry_interval_bucket",
    "retry_max_attempts_bucket",
    "window_length_bucket",
    "deterministic_time_bucket",
    "account_auto_refresh_enabled",
    "account_auto_refresh_on_open_enabled",
    "account_auto_refresh_interval_bucket",
    "account_auto_refresh_min_interval_bucket",
    "usage_history_enabled",
    "usage_history_mode",
    "usage_history_sync_interval_bucket",
    "usage_history_retention_days_bucket",
    "balance_history_enabled",
    "balance_history_end_of_day_capture_enabled",
    "balance_history_retention_days_bucket",
    "managed_site_model_sync_enabled",
    "managed_site_model_sync_interval_bucket",
    "managed_site_model_sync_concurrency_bucket",
    "managed_site_model_sync_retry_max_attempts_bucket",
    "managed_site_model_sync_rate_limit_rpm_bucket",
    "managed_site_model_sync_rate_limit_burst_bucket",
    "managed_site_model_sync_allowed_models_configured",
    "managed_site_model_sync_global_filters_configured",
    "auto_checkin_global_enabled",
    "auto_checkin_ui_pretrigger_enabled",
    "auto_checkin_notify_completion_enabled",
    "auto_checkin_retry_enabled",
    "auto_checkin_schedule_mode",
    "auto_checkin_retry_interval_bucket",
    "auto_checkin_retry_max_attempts_bucket",
    "auto_checkin_window_length_bucket",
    "auto_checkin_deterministic_time_bucket",
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
    "web_ai_api_check_auto_detect_patterns_configured",
    "temp_window_fallback_enabled",
    "temp_window_fallback_popup_enabled",
    "temp_window_fallback_sidepanel_enabled",
    "temp_window_fallback_options_enabled",
    "temp_window_fallback_auto_refresh_enabled",
    "temp_window_fallback_manual_refresh_enabled",
    "temp_window_fallback_mode",
    "webdav_configured",
    "webdav_auto_sync_enabled",
    "webdav_backup_encryption_enabled",
    "webdav_sync_strategy",
    "webdav_sync_interval_bucket",
    "webdav_sync_accounts_enabled",
    "webdav_sync_bookmarks_enabled",
    "webdav_sync_api_profiles_enabled",
    "webdav_sync_preferences_enabled",
    "task_notifications_enabled",
    "task_notifications_browser_channel_enabled",
    "task_notifications_third_party_channel_count_bucket",
    "task_notifications_task_enabled_count_bucket",
    "site_announcements_enabled",
    "site_announcements_notification_enabled",
    "site_announcements_polling_interval_bucket",
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
    "total_account_count_bucket",
    "distinct_site_count_bucket",
    "known_site_type_count_bucket",
    "unknown_site_count_bucket",
    "managed_site_count_bucket",
  ],
  [PRODUCT_ANALYTICS_EVENTS.SiteTypePresent]: [
    "site_type",
    "account_count_bucket",
  ],
} satisfies Record<ProductAnalyticsEventName, readonly string[]>

const FIELD_ALLOWED_VALUES: Record<string, readonly string[]> = {
  action_id: Object.values(PRODUCT_ANALYTICS_ACTION_IDS),
  account_auto_refresh_interval_bucket: Object.values(
    PRODUCT_ANALYTICS_MODE_IDS,
  ),
  account_auto_refresh_min_interval_bucket: Object.values(
    PRODUCT_ANALYTICS_MODE_IDS,
  ),
  auto_checkin_deterministic_time_bucket: Object.values(
    PRODUCT_ANALYTICS_AUTO_CHECKIN_DETERMINISTIC_TIME_BUCKETS,
  ),
  auto_checkin_retry_interval_bucket: Object.values(
    PRODUCT_ANALYTICS_AUTO_CHECKIN_RETRY_INTERVAL_BUCKETS,
  ),
  auto_checkin_retry_max_attempts_bucket: Object.values(
    PRODUCT_ANALYTICS_AUTO_CHECKIN_RETRY_ATTEMPT_BUCKETS,
  ),
  auto_checkin_schedule_mode: Object.values(
    PRODUCT_ANALYTICS_AUTO_CHECKIN_SCHEDULE_MODES,
  ),
  auto_checkin_window_length_bucket: Object.values(
    PRODUCT_ANALYTICS_AUTO_CHECKIN_WINDOW_LENGTH_BUCKETS,
  ),
  balance_history_retention_days_bucket: Object.values(
    PRODUCT_ANALYTICS_MODE_IDS,
  ),
  deterministic_time_bucket: Object.values(
    PRODUCT_ANALYTICS_AUTO_CHECKIN_DETERMINISTIC_TIME_BUCKETS,
  ),
  api_type: Object.values(PRODUCT_ANALYTICS_API_TYPES),
  account_count_bucket: Object.values(PRODUCT_ANALYTICS_COUNT_BUCKETS),
  blocked_count_bucket: Object.values(PRODUCT_ANALYTICS_COUNT_BUCKETS),
  distinct_site_count_bucket: Object.values(PRODUCT_ANALYTICS_COUNT_BUCKETS),
  duration_bucket: Object.values(PRODUCT_ANALYTICS_DURATION_BUCKETS),
  editor_mode: Object.values(PRODUCT_ANALYTICS_EDITOR_MODES),
  entrypoint: Object.values(PRODUCT_ANALYTICS_ENTRYPOINTS),
  error_category: Object.values(PRODUCT_ANALYTICS_ERROR_CATEGORIES),
  failure_count_bucket: Object.values(PRODUCT_ANALYTICS_COUNT_BUCKETS),
  failure_stage: Object.values(PRODUCT_ANALYTICS_FAILURE_STAGES),
  feature_id: Object.values(PRODUCT_ANALYTICS_FEATURE_IDS),
  filter_count_bucket: Object.values(PRODUCT_ANALYTICS_COUNT_BUCKETS),
  item_count_bucket: Object.values(PRODUCT_ANALYTICS_COUNT_BUCKETS),
  known_site_type_count_bucket: Object.values(PRODUCT_ANALYTICS_COUNT_BUCKETS),
  managed_site_model_sync_concurrency_bucket: Object.values(
    PRODUCT_ANALYTICS_COUNT_BUCKETS,
  ),
  managed_site_model_sync_interval_bucket: Object.values(
    PRODUCT_ANALYTICS_MODE_IDS,
  ),
  managed_site_model_sync_rate_limit_burst_bucket: Object.values(
    PRODUCT_ANALYTICS_COUNT_BUCKETS,
  ),
  managed_site_model_sync_rate_limit_rpm_bucket: Object.values(
    PRODUCT_ANALYTICS_MODE_IDS,
  ),
  managed_site_model_sync_retry_max_attempts_bucket: Object.values(
    PRODUCT_ANALYTICS_AUTO_CHECKIN_RETRY_ATTEMPT_BUCKETS,
  ),
  managed_site_type: Object.values(PRODUCT_ANALYTICS_MANAGED_SITE_TYPES),
  managed_site_count_bucket: Object.values(PRODUCT_ANALYTICS_COUNT_BUCKETS),
  mode: Object.values(PRODUCT_ANALYTICS_MODE_IDS),
  refresh_interval_bucket: Object.values(PRODUCT_ANALYTICS_MODE_IDS),
  min_refresh_interval_bucket: Object.values(PRODUCT_ANALYTICS_MODE_IDS),
  sync_interval_bucket: Object.values(PRODUCT_ANALYTICS_MODE_IDS),
  polling_interval_bucket: Object.values(PRODUCT_ANALYTICS_MODE_IDS),
  retention_days_bucket: Object.values(PRODUCT_ANALYTICS_MODE_IDS),
  model_count_bucket: Object.values(PRODUCT_ANALYTICS_COUNT_BUCKETS),
  page_id: Object.values(PRODUCT_ANALYTICS_PAGE_IDS),
  permission_id: Object.values(PRODUCT_ANALYTICS_PERMISSION_IDS),
  operation: Object.values(PRODUCT_ANALYTICS_PERMISSION_OPERATIONS),
  outcome: Object.values(PRODUCT_ANALYTICS_PERMISSION_OUTCOMES),
  failure_reason: Object.values(PRODUCT_ANALYTICS_PERMISSION_FAILURE_REASONS),
  ready_count_bucket: Object.values(PRODUCT_ANALYTICS_COUNT_BUCKETS),
  result: Object.values(PRODUCT_ANALYTICS_RESULTS),
  result_count_bucket: Object.values(PRODUCT_ANALYTICS_COUNT_BUCKETS),
  retry_interval_bucket: Object.values(
    PRODUCT_ANALYTICS_AUTO_CHECKIN_RETRY_INTERVAL_BUCKETS,
  ),
  retry_max_attempts_bucket: Object.values(
    PRODUCT_ANALYTICS_AUTO_CHECKIN_RETRY_ATTEMPT_BUCKETS,
  ),
  concurrency_bucket: Object.values(PRODUCT_ANALYTICS_COUNT_BUCKETS),
  rate_limit_rpm_bucket: Object.values(PRODUCT_ANALYTICS_MODE_IDS),
  rate_limit_burst_bucket: Object.values(PRODUCT_ANALYTICS_COUNT_BUCKETS),
  schedule_mode: Object.values(PRODUCT_ANALYTICS_AUTO_CHECKIN_SCHEDULE_MODES),
  selected_count_bucket: Object.values(PRODUCT_ANALYTICS_COUNT_BUCKETS),
  shield_bypass_prompt_dismissed_count_bucket: Object.values(
    PRODUCT_ANALYTICS_COUNT_BUCKETS,
  ),
  shield_bypass_prompt_shown_count_bucket: Object.values(
    PRODUCT_ANALYTICS_COUNT_BUCKETS,
  ),
  shield_bypass_settings_visited_count_bucket: Object.values(
    PRODUCT_ANALYTICS_COUNT_BUCKETS,
  ),
  setting_id: Object.values(PRODUCT_ANALYTICS_SETTING_IDS),
  site_type: PRODUCT_ANALYTICS_SITE_TYPES,
  skipped_count_bucket: Object.values(PRODUCT_ANALYTICS_COUNT_BUCKETS),
  source_managed_site_type: Object.values(PRODUCT_ANALYTICS_MANAGED_SITE_TYPES),
  source_kind: Object.values(PRODUCT_ANALYTICS_SOURCE_KINDS),
  sponsor_action_kind: Object.values(PRODUCT_ANALYTICS_SPONSOR_ACTION_KINDS),
  sponsor_catalog_source: Object.values(
    PRODUCT_ANALYTICS_SPONSOR_CATALOG_SOURCES,
  ),
  sponsor_rank_bucket: Object.values(PRODUCT_ANALYTICS_SPONSOR_RANK_BUCKETS),
  sponsor_support_status: Object.values(
    PRODUCT_ANALYTICS_SPONSOR_SUPPORT_STATUSES,
  ),
  sponsor_supported_count_bucket: Object.values(
    PRODUCT_ANALYTICS_COUNT_BUCKETS,
  ),
  sponsor_unsupported_count_bucket: Object.values(
    PRODUCT_ANALYTICS_COUNT_BUCKETS,
  ),
  status_kind: Object.values(PRODUCT_ANALYTICS_STATUS_KINDS),
  success_count_bucket: Object.values(PRODUCT_ANALYTICS_COUNT_BUCKETS),
  surface_id: Object.values(PRODUCT_ANALYTICS_SURFACE_IDS),
  target_kind: Object.values(PRODUCT_ANALYTICS_TARGET_KINDS),
  target_state: Object.values(PRODUCT_ANALYTICS_TARGET_STATES),
  target_managed_site_type: Object.values(PRODUCT_ANALYTICS_MANAGED_SITE_TYPES),
  telemetry_source: Object.values(PRODUCT_ANALYTICS_TELEMETRY_SOURCES),
  temp_window_fetch_failure_count_bucket: Object.values(
    PRODUCT_ANALYTICS_COUNT_BUCKETS,
  ),
  temp_window_fetch_success_count_bucket: Object.values(
    PRODUCT_ANALYTICS_COUNT_BUCKETS,
  ),
  temp_window_turnstile_fetch_failure_count_bucket: Object.values(
    PRODUCT_ANALYTICS_COUNT_BUCKETS,
  ),
  temp_window_turnstile_fetch_success_count_bucket: Object.values(
    PRODUCT_ANALYTICS_COUNT_BUCKETS,
  ),
  site_announcements_polling_interval_bucket: Object.values(
    PRODUCT_ANALYTICS_MODE_IDS,
  ),
  task_notifications_task_enabled_count_bucket: Object.values(
    PRODUCT_ANALYTICS_COUNT_BUCKETS,
  ),
  task_notifications_third_party_channel_count_bucket: Object.values(
    PRODUCT_ANALYTICS_COUNT_BUCKETS,
  ),
  temp_window_fallback_mode: Object.values(PRODUCT_ANALYTICS_MODE_IDS),
  total_account_count_bucket: Object.values(PRODUCT_ANALYTICS_COUNT_BUCKETS),
  usage_history_mode: Object.values(PRODUCT_ANALYTICS_MODE_IDS),
  usage_history_retention_days_bucket: Object.values(
    PRODUCT_ANALYTICS_MODE_IDS,
  ),
  usage_history_sync_interval_bucket: Object.values(PRODUCT_ANALYTICS_MODE_IDS),
  unknown_site_count_bucket: Object.values(PRODUCT_ANALYTICS_COUNT_BUCKETS),
  warning_count_bucket: Object.values(PRODUCT_ANALYTICS_COUNT_BUCKETS),
  window_length_bucket: Object.values(
    PRODUCT_ANALYTICS_AUTO_CHECKIN_WINDOW_LENGTH_BUCKETS,
  ),
  sync_strategy: Object.values(PRODUCT_ANALYTICS_MODE_IDS),
  webdav_sync_interval_bucket: Object.values(PRODUCT_ANALYTICS_MODE_IDS),
  webdav_sync_strategy: Object.values(PRODUCT_ANALYTICS_MODE_IDS),
  third_party_channel_count_bucket: Object.values(
    PRODUCT_ANALYTICS_COUNT_BUCKETS,
  ),
  task_enabled_count_bucket: Object.values(PRODUCT_ANALYTICS_COUNT_BUCKETS),
}

const PRIVACY_REVIEWED_ALLOWED_KEYS = new Set([
  "account_count_bucket",
  "account_auto_refresh_enabled",
  "account_auto_refresh_interval_bucket",
  "account_auto_refresh_min_interval_bucket",
  "account_auto_refresh_on_open_enabled",
  "auto_detect_url_patterns_configured",
  "auto_fill_current_site_url_on_account_add_enabled",
  "auto_provision_key_on_account_add_enabled",
  "balance_history_enabled",
  "balance_history_end_of_day_capture_enabled",
  "balance_history_retention_days_bucket",
  "managed_site_type",
  "new_api_configured",
  "redemption_assist_allowlist_account_urls_enabled",
  "redemption_assist_allowlist_checkin_redeem_urls_enabled",
  "shield_bypass_prompt_dismissed_count_bucket",
  "shield_bypass_prompt_shown_count_bucket",
  "sponsor_id",
  "sync_accounts_enabled",
  "source_managed_site_type",
  "target_managed_site_type",
  "total_account_count_bucket",
  "url_whitelist_account_urls_enabled",
  "url_whitelist_checkin_redeem_urls_enabled",
  "url_whitelist_enabled",
  "url_whitelist_patterns_configured",
])

/**
 * Accepts only scalar property values supported by PostHog product analytics.
 */
function isAllowedScalar(value: unknown): value is string | boolean {
  return typeof value === "string" || typeof value === "boolean"
}

/**
 * Confirms a sanitized field uses an approved enum value or the enabled flag.
 */
function isAllowedFieldValue(key: string, value: string | boolean): boolean {
  if (typeof value === "boolean") {
    return (
      key === "enabled" ||
      key === "configured" ||
      key === "usage_data_present" ||
      key === "was_granted_before" ||
      key === "was_granted_after" ||
      key.endsWith("_enabled") ||
      key.endsWith("_configured")
    )
  }

  if (key === "sponsor_id") {
    return /^[a-z0-9][a-z0-9-]*$/.test(value)
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
  allowedKeys: Set<string>,
  key: string,
  value: unknown,
): value is string | boolean {
  return (
    allowedKeys.has(key) &&
    isPrivacyReviewedKey(key) &&
    isAllowedScalar(value) &&
    isAllowedFieldValue(key, value)
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
  const rawRecord = rawProperties as Record<string, unknown>
  const sanitized: SanitizedProperties = {}

  for (const [key, value] of Object.entries(rawRecord)) {
    if (!shouldKeepProperty(allowedKeys, key, value)) continue

    sanitized[key] = value
  }

  return sanitized
}

/**
 * Converts exact counts into coarse analytics buckets.
 */
export function bucketCount(count: number) {
  if (!Number.isFinite(count) || count <= 0) {
    return PRODUCT_ANALYTICS_COUNT_BUCKETS.Zero
  }
  if (count === 1) return PRODUCT_ANALYTICS_COUNT_BUCKETS.One
  if (count <= 3) return PRODUCT_ANALYTICS_COUNT_BUCKETS.TwoToThree
  if (count <= 10) return PRODUCT_ANALYTICS_COUNT_BUCKETS.FourToTen
  return PRODUCT_ANALYTICS_COUNT_BUCKETS.TenPlus
}

/**
 * Converts exact durations into coarse analytics buckets.
 */
export function bucketDurationMs(durationMs: number) {
  if (!Number.isFinite(durationMs) || durationMs < 1_000) {
    return PRODUCT_ANALYTICS_DURATION_BUCKETS.LessThan1s
  }
  if (durationMs <= 5_000) return PRODUCT_ANALYTICS_DURATION_BUCKETS.OneTo5s
  if (durationMs <= 30_000) return PRODUCT_ANALYTICS_DURATION_BUCKETS.FiveTo30s
  if (durationMs <= 120_000) {
    return PRODUCT_ANALYTICS_DURATION_BUCKETS.ThirtyTo120s
  }
  return PRODUCT_ANALYTICS_DURATION_BUCKETS.GreaterThan120s
}
