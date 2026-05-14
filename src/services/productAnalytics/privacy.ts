import {
  PRODUCT_ANALYTICS_ACTION_IDS,
  PRODUCT_ANALYTICS_COUNT_BUCKETS,
  PRODUCT_ANALYTICS_DURATION_BUCKETS,
  PRODUCT_ANALYTICS_ENTRYPOINTS,
  PRODUCT_ANALYTICS_ERROR_CATEGORIES,
  PRODUCT_ANALYTICS_EVENTS,
  PRODUCT_ANALYTICS_FEATURE_IDS,
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
    "source_kind",
    "mode",
    "status_kind",
    "telemetry_source",
    "item_count_bucket",
    "selected_count_bucket",
    "success_count_bucket",
    "failure_count_bucket",
    "model_count_bucket",
    "usage_data_present",
    "entrypoint",
  ],
  [PRODUCT_ANALYTICS_EVENTS.SettingChanged]: [
    "setting_id",
    "enabled",
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
  account_count_bucket: Object.values(PRODUCT_ANALYTICS_COUNT_BUCKETS),
  distinct_site_count_bucket: Object.values(PRODUCT_ANALYTICS_COUNT_BUCKETS),
  duration_bucket: Object.values(PRODUCT_ANALYTICS_DURATION_BUCKETS),
  entrypoint: Object.values(PRODUCT_ANALYTICS_ENTRYPOINTS),
  error_category: Object.values(PRODUCT_ANALYTICS_ERROR_CATEGORIES),
  failure_count_bucket: Object.values(PRODUCT_ANALYTICS_COUNT_BUCKETS),
  feature_id: Object.values(PRODUCT_ANALYTICS_FEATURE_IDS),
  item_count_bucket: Object.values(PRODUCT_ANALYTICS_COUNT_BUCKETS),
  known_site_type_count_bucket: Object.values(PRODUCT_ANALYTICS_COUNT_BUCKETS),
  managed_site_count_bucket: Object.values(PRODUCT_ANALYTICS_COUNT_BUCKETS),
  mode: Object.values(PRODUCT_ANALYTICS_MODE_IDS),
  model_count_bucket: Object.values(PRODUCT_ANALYTICS_COUNT_BUCKETS),
  page_id: Object.values(PRODUCT_ANALYTICS_PAGE_IDS),
  permission_id: Object.values(PRODUCT_ANALYTICS_PERMISSION_IDS),
  result: Object.values(PRODUCT_ANALYTICS_RESULTS),
  selected_count_bucket: Object.values(PRODUCT_ANALYTICS_COUNT_BUCKETS),
  setting_id: Object.values(PRODUCT_ANALYTICS_SETTING_IDS),
  site_type: PRODUCT_ANALYTICS_SITE_TYPES,
  source_kind: Object.values(PRODUCT_ANALYTICS_SOURCE_KINDS),
  status_kind: Object.values(PRODUCT_ANALYTICS_STATUS_KINDS),
  success_count_bucket: Object.values(PRODUCT_ANALYTICS_COUNT_BUCKETS),
  surface_id: Object.values(PRODUCT_ANALYTICS_SURFACE_IDS),
  telemetry_source: Object.values(PRODUCT_ANALYTICS_TELEMETRY_SOURCES),
  total_account_count_bucket: Object.values(PRODUCT_ANALYTICS_COUNT_BUCKETS),
  unknown_site_count_bucket: Object.values(PRODUCT_ANALYTICS_COUNT_BUCKETS),
}

const PRIVACY_REVIEWED_ALLOWED_KEYS = new Set([
  "account_count_bucket",
  "total_account_count_bucket",
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
    return key === "enabled" || key === "usage_data_present"
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
