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
  PRODUCT_ANALYTICS_PERMISSION_IDS,
  PRODUCT_ANALYTICS_RESULTS,
  PRODUCT_ANALYTICS_SETTING_IDS,
  PRODUCT_ANALYTICS_SITE_TYPES,
  PRODUCT_ANALYTICS_SOURCE_KINDS,
  PRODUCT_ANALYTICS_STATUS_KINDS,
  PRODUCT_ANALYTICS_SURFACE_IDS,
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
    "usage_data_present",
    "entrypoint",
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
  [PRODUCT_ANALYTICS_EVENTS.PermissionResult]: [
    "permission_id",
    "result",
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
  item_count_bucket: Object.values(PRODUCT_ANALYTICS_COUNT_BUCKETS),
  known_site_type_count_bucket: Object.values(PRODUCT_ANALYTICS_COUNT_BUCKETS),
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
  ready_count_bucket: Object.values(PRODUCT_ANALYTICS_COUNT_BUCKETS),
  result: Object.values(PRODUCT_ANALYTICS_RESULTS),
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
  setting_id: Object.values(PRODUCT_ANALYTICS_SETTING_IDS),
  site_type: PRODUCT_ANALYTICS_SITE_TYPES,
  skipped_count_bucket: Object.values(PRODUCT_ANALYTICS_COUNT_BUCKETS),
  source_managed_site_type: Object.values(PRODUCT_ANALYTICS_MANAGED_SITE_TYPES),
  source_kind: Object.values(PRODUCT_ANALYTICS_SOURCE_KINDS),
  status_kind: Object.values(PRODUCT_ANALYTICS_STATUS_KINDS),
  success_count_bucket: Object.values(PRODUCT_ANALYTICS_COUNT_BUCKETS),
  surface_id: Object.values(PRODUCT_ANALYTICS_SURFACE_IDS),
  target_managed_site_type: Object.values(PRODUCT_ANALYTICS_MANAGED_SITE_TYPES),
  telemetry_source: Object.values(PRODUCT_ANALYTICS_TELEMETRY_SOURCES),
  total_account_count_bucket: Object.values(PRODUCT_ANALYTICS_COUNT_BUCKETS),
  unknown_site_count_bucket: Object.values(PRODUCT_ANALYTICS_COUNT_BUCKETS),
  warning_count_bucket: Object.values(PRODUCT_ANALYTICS_COUNT_BUCKETS),
  window_length_bucket: Object.values(
    PRODUCT_ANALYTICS_AUTO_CHECKIN_WINDOW_LENGTH_BUCKETS,
  ),
  sync_strategy: Object.values(PRODUCT_ANALYTICS_MODE_IDS),
  third_party_channel_count_bucket: Object.values(
    PRODUCT_ANALYTICS_COUNT_BUCKETS,
  ),
  task_enabled_count_bucket: Object.values(PRODUCT_ANALYTICS_COUNT_BUCKETS),
}

const PRIVACY_REVIEWED_ALLOWED_KEYS = new Set([
  "account_count_bucket",
  "auto_detect_url_patterns_configured",
  "auto_fill_current_site_url_on_account_add_enabled",
  "auto_provision_key_on_account_add_enabled",
  "managed_site_type",
  "new_api_configured",
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
      key.endsWith("_enabled") ||
      key.endsWith("_configured")
    )
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
