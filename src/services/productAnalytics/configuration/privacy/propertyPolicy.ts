import { SUPPORTED_UI_LANGUAGES } from "~/constants"
import { OPENROUTER_BOOTSTRAP_ATTEMPT_OUTCOMES } from "~/constants/openRouterBootstrap"
import { SETTINGS_SNAPSHOT_AUTOMATIC_FEATURE_BYPASS_PROPERTIES } from "~/services/productAnalytics/configuration/settingsSnapshot"
import {
  PRODUCT_ANALYTICS_ACCOUNT_AUTO_DETECT_FAILURE_REASONS,
  PRODUCT_ANALYTICS_ACCOUNT_AUTO_DETECT_FETCH_CONTEXT_KINDS,
  PRODUCT_ANALYTICS_ACCOUNT_AUTO_DETECT_STRATEGIES,
  PRODUCT_ANALYTICS_ACTION_IDS,
  PRODUCT_ANALYTICS_API_TYPES,
  PRODUCT_ANALYTICS_AUTO_CHECKIN_METHOD_CATEGORIES,
  PRODUCT_ANALYTICS_AUTO_CHECKIN_RUN_KINDS,
  PRODUCT_ANALYTICS_AUTO_CHECKIN_SCHEDULE_MODES,
  PRODUCT_ANALYTICS_AUTO_CHECKIN_SKIP_REASONS,
  PRODUCT_ANALYTICS_CHECK_IN_DISCOVERY_DECISIONS,
  PRODUCT_ANALYTICS_CHECK_IN_DISCOVERY_TRIGGERS,
  PRODUCT_ANALYTICS_CHECK_IN_RECOVERY_ACTIONS,
  PRODUCT_ANALYTICS_CHECK_IN_SELECTION_MODES,
  PRODUCT_ANALYTICS_CHECK_IN_SELECTION_SOURCES,
  PRODUCT_ANALYTICS_EDITOR_MODES,
  PRODUCT_ANALYTICS_ENTRYPOINTS,
  PRODUCT_ANALYTICS_ERROR_CATEGORIES,
  PRODUCT_ANALYTICS_EVENTS,
  PRODUCT_ANALYTICS_FAILURE_REASONS,
  PRODUCT_ANALYTICS_FAILURE_STAGES,
  PRODUCT_ANALYTICS_FEATURE_IDS,
  PRODUCT_ANALYTICS_KILO_CODE_EXPORT_TARGETS,
  PRODUCT_ANALYTICS_MANAGED_SITE_BATCH_IMPORT_SOURCES,
  PRODUCT_ANALYTICS_MANAGED_SITE_TYPES,
  PRODUCT_ANALYTICS_MODE_IDS,
  PRODUCT_ANALYTICS_MODEL_PRICE_COMPARISON_PRESETS,
  PRODUCT_ANALYTICS_OPTIONS_PAGE_TARGET_IDS,
  PRODUCT_ANALYTICS_PAGE_IDS,
  PRODUCT_ANALYTICS_PERMISSION_FAILURE_REASONS,
  PRODUCT_ANALYTICS_PERMISSION_IDS,
  PRODUCT_ANALYTICS_PERMISSION_OPERATIONS,
  PRODUCT_ANALYTICS_PERMISSION_OUTCOMES,
  PRODUCT_ANALYTICS_PRODUCT_ANNOUNCEMENT_ACTION_KINDS,
  PRODUCT_ANALYTICS_PRODUCT_ANNOUNCEMENT_SEVERITIES,
  PRODUCT_ANALYTICS_PROTECTION_BYPASS_COUNT_PROPERTIES,
  PRODUCT_ANALYTICS_REQUESTED_AUTH_MODES,
  PRODUCT_ANALYTICS_RESULTS,
  PRODUCT_ANALYTICS_SETTING_IDS,
  PRODUCT_ANALYTICS_SITE_TYPES,
  PRODUCT_ANALYTICS_SORT_FIELDS,
  PRODUCT_ANALYTICS_SOURCE_KINDS,
  PRODUCT_ANALYTICS_SPONSOR_ACTION_AVAILABILITIES,
  PRODUCT_ANALYTICS_SPONSOR_ACTION_KINDS,
  PRODUCT_ANALYTICS_SPONSOR_CATALOG_SOURCES,
  PRODUCT_ANALYTICS_SPONSOR_SUPPORT_STATUSES,
  PRODUCT_ANALYTICS_STATUS_KINDS,
  PRODUCT_ANALYTICS_SURFACE_IDS,
  PRODUCT_ANALYTICS_TARGET_KINDS,
  PRODUCT_ANALYTICS_TARGET_STATES,
  PRODUCT_ANALYTICS_TELEMETRY_SOURCES,
  PRODUCT_ANALYTICS_TOOLBAR_ACTION_CLICK_BEHAVIORS,
  PRODUCT_ANALYTICS_UNIFIED_API_GUIDANCE_ACTION_KINDS,
  PRODUCT_ANALYTICS_UNIFIED_API_GUIDANCE_STATUSES,
  type ProductAnalyticsEventName,
} from "~/services/productAnalytics/contracts"
import {
  CURRENCY_TYPES,
  DASHBOARD_TAB_TYPES,
  SORT_FIELDS,
  SORT_ORDERS,
} from "~/types"
import { ACCOUNT_KEY_AUTO_PROVISION_MODES } from "~/types/accountKeyAutoProvisioning"
import { LOG_LEVELS } from "~/types/logging"
import { THEME_MODES } from "~/types/theme"

const FORBIDDEN_KEY_PATTERN =
  /(url|uri|origin|host|hostname|domain|path|token|key|cookie|authorization|auth|email|balance|quota|cost|prompt|response|content|stack|trace|name|note|user|account)/i

const FIELD_ALLOWED_VALUES: Record<string, readonly string[]> = {
  active_tab: DASHBOARD_TAB_TYPES,
  action_id: Object.values(PRODUCT_ANALYTICS_ACTION_IDS),
  auto_checkin_schedule_mode: Object.values(
    PRODUCT_ANALYTICS_AUTO_CHECKIN_SCHEDULE_MODES,
  ),
  check_in_discovery_trigger: PRODUCT_ANALYTICS_CHECK_IN_DISCOVERY_TRIGGERS,
  check_in_discovery_decision: PRODUCT_ANALYTICS_CHECK_IN_DISCOVERY_DECISIONS,
  check_in_selection_source: PRODUCT_ANALYTICS_CHECK_IN_SELECTION_SOURCES,
  check_in_selection_mode: PRODUCT_ANALYTICS_CHECK_IN_SELECTION_MODES,
  check_in_recovery_action: PRODUCT_ANALYTICS_CHECK_IN_RECOVERY_ACTIONS,
  api_type: Object.values(PRODUCT_ANALYTICS_API_TYPES),
  editor_mode: Object.values(PRODUCT_ANALYTICS_EDITOR_MODES),
  entrypoint: Object.values(PRODUCT_ANALYTICS_ENTRYPOINTS),
  error_category: Object.values(PRODUCT_ANALYTICS_ERROR_CATEGORIES),
  failure_stage: Object.values(PRODUCT_ANALYTICS_FAILURE_STAGES),
  feature_id: Object.values(PRODUCT_ANALYTICS_FEATURE_IDS),
  guidance_status: Object.values(
    PRODUCT_ANALYTICS_UNIFIED_API_GUIDANCE_STATUSES,
  ),
  guidance_action_kind: Object.values(
    PRODUCT_ANALYTICS_UNIFIED_API_GUIDANCE_ACTION_KINDS,
  ),
  currency_type: CURRENCY_TYPES,
  auto_provision_key_on_account_add_mode: Object.values(
    ACCOUNT_KEY_AUTO_PROVISION_MODES,
  ),
  log_level: LOG_LEVELS,
  kilo_code_export_target: Object.values(
    PRODUCT_ANALYTICS_KILO_CODE_EXPORT_TARGETS,
  ),
  managed_site_type: Object.values(PRODUCT_ANALYTICS_MANAGED_SITE_TYPES),
  managed_site_batch_import_source: Object.values(
    PRODUCT_ANALYTICS_MANAGED_SITE_BATCH_IMPORT_SOURCES,
  ),
  mode: Object.values(PRODUCT_ANALYTICS_MODE_IDS),
  normalized_language: SUPPORTED_UI_LANGUAGES,
  price_comparison_preset: Object.values(
    PRODUCT_ANALYTICS_MODEL_PRICE_COMPARISON_PRESETS,
  ),
  page_id: Object.values(PRODUCT_ANALYTICS_PAGE_IDS),
  permission_id: Object.values(PRODUCT_ANALYTICS_PERMISSION_IDS),
  operation: Object.values(PRODUCT_ANALYTICS_PERMISSION_OPERATIONS),
  outcome: Object.values(PRODUCT_ANALYTICS_PERMISSION_OUTCOMES),
  failure_reason: Object.values(PRODUCT_ANALYTICS_PERMISSION_FAILURE_REASONS),
  account_auto_detect_failure_reason: Object.values(
    PRODUCT_ANALYTICS_ACCOUNT_AUTO_DETECT_FAILURE_REASONS,
  ),
  account_auto_detect_attempt_outcome: Object.values(
    OPENROUTER_BOOTSTRAP_ATTEMPT_OUTCOMES,
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
  method_category: Object.values(
    PRODUCT_ANALYTICS_AUTO_CHECKIN_METHOD_CATEGORIES,
  ),
  source_managed_site_type: Object.values(PRODUCT_ANALYTICS_MANAGED_SITE_TYPES),
  source_kind: Object.values(PRODUCT_ANALYTICS_SOURCE_KINDS),
  sort_field: [...SORT_FIELDS, ...Object.values(PRODUCT_ANALYTICS_SORT_FIELDS)],
  sort_order: SORT_ORDERS,
  sponsor_action_kind: Object.values(PRODUCT_ANALYTICS_SPONSOR_ACTION_KINDS),
  sponsor_action_availability: Object.values(
    PRODUCT_ANALYTICS_SPONSOR_ACTION_AVAILABILITIES,
  ),
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
  ...SETTINGS_SNAPSHOT_AUTOMATIC_FEATURE_BYPASS_PROPERTIES,
  "account_count",
  "account_auto_detect_failure_reason",
  "account_auto_detect_attempt_outcome",
  "account_auto_detect_identity_detected",
  "account_auto_refresh_enabled",
  "account_auto_refresh_interval_minutes",
  "account_auto_refresh_min_interval_seconds",
  "account_auto_refresh_on_open_enabled",
  "account_state_durability_failure_count",
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
  "api_key_cleanup_patterns_configured",
  "fallback_available",
  "fallback_used",
  "balance_history_capture_task_enabled",
  "balance_history_estimated_today_income_enabled",
  "failure_reason",
  "requested_auth_mode",
  "auto_fill_current_site_url_on_account_add_enabled",
  "auto_provision_key_on_account_add_enabled",
  "auto_provision_key_on_account_add_mode",
  "balance_history_enabled",
  "balance_history_end_of_day_capture_enabled",
  "balance_history_retention_days",
  "currency_type",
  "estimated_today_income_enabled",
  "managed_site_type",
  "managed_site_batch_import_source",
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
  ...PRODUCT_ANALYTICS_PROTECTION_BYPASS_COUNT_PROPERTIES,
  "sponsor_campaign_locale",
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
  "changed_meter_count",
  "check_in_candidate_count",
  "balance_history_retention_days",
  "concurrency",
  "detection_enabled_accounts",
  "distinct_site_count",
  "duration_ms",
  "failure_count",
  "failed_count",
  "uncertain_count",
  "retryable_failure_count",
  "reconciliation_checked_count",
  "reconciliation_not_checked_count",
  "reconciliation_unknown_count",
  "reconciliation_unavailable_count",
  "account_state_durability_failure_count",
  "filter_count",
  "item_count",
  "known_site_type_count",
  "managed_site_count",
  "managed_site_model_sync_concurrency",
  "managed_site_model_sync_channel_timeout_seconds",
  "managed_site_model_sync_interval_minutes",
  "managed_site_model_sync_rate_limit_burst",
  "managed_site_model_sync_rate_limit_rpm",
  "managed_site_model_sync_retry_max_attempts",
  "min_refresh_interval_seconds",
  "model_count",
  "modeled_meter_count",
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
  ...PRODUCT_ANALYTICS_PROTECTION_BYPASS_COUNT_PROPERTIES,
  "shield_bypass_settings_visited_count",
  "site_announcements_polling_interval_minutes",
  "skipped_count",
  "sponsor_catalog_schema_version",
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
  "account_auto_detect_identity_detected",
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

  if (key === "product_announcement_id") {
    return /^[a-z0-9][a-z0-9-]*$/.test(value)
  }

  if (key === "sponsor_campaign_locale") {
    return /^[a-zA-Z]{2,3}(?:-[a-zA-Z0-9]{2,8})?$/.test(value)
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
export function shouldKeepProperty(
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
