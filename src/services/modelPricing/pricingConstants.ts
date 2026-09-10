/** Runtime values owned by the shared pricing contract; wire values stay unchanged. */
export const PRICING_METERS = {
  VIDEO_OUTPUT: "videoOutput",
  INPUT: "input",
  OUTPUT: "output",
  CACHE_READ: "cacheRead",
  CACHE_WRITE: "cacheWrite",
  CACHE_WRITE1H: "cacheWrite1h",
  IMAGE_INPUT: "imageInput",
  IMAGE_OUTPUT: "imageOutput",
  AUDIO_INPUT: "audioInput",
  AUDIO_OUTPUT: "audioOutput",
  AUDIO_CACHE: "audioCache",
  OUTPUT_IMAGE: "outputImage",
  REQUEST: "request",
  IMAGE: "image",
  AUDIO: "audio",
  SEARCH: "search",
  CHARACTERS: "characters",
  VIDEO_SECONDS: "videoSeconds",
  REFERENCE_IMAGE: "referenceImage",
  SEARCH_UNITS: "searchUnits",
  PAGES: "pages",
  OUTPUT_MEGAPIXELS: "outputMegapixels",
} as const

export const PRICE_RATE_UNITS = {
  TOKEN: "token",
  REQUEST: "request",
  IMAGE: "image",
  SECOND: "second",
  SEARCH: "search",
  CHARACTER: "character",
  SEARCH_UNIT: "search-unit",
  PAGE: "page",
  MEGAPIXEL: "megapixel",
} as const

export const PRICING_USAGE_MODES = {
  TOKENS: "tokens",
  REQUEST: "request",
  IMAGE: "image",
  VIDEO: "video",
  METERED: "metered",
  CUSTOM: "custom",
} as const

export const PRICING_PURPOSES = {
  REQUEST: "request",
  TOKEN_INDEX: "token-index",
} as const

export const PRICING_SOURCE_KINDS = {
  ACCOUNT: "account",
  CATALOG: "catalog",
  ESTIMATE: "estimate",
} as const

export const PRICING_GROUP_MULTIPLIERS = {
  PENDING: "pending",
  INCLUDED: "included",
} as const

export const PRICING_CONDITION_KINDS = {
  CALENDAR: "calendar",
  SELECTION: "selection",
  MEASUREMENT: "measurement",
  RANGE: "range",
  DATE_WINDOW: "date-window",
  TIME_WINDOW: "time-window",
  UTC_WINDOW: "utc-window",
} as const

export const PRICING_ISSUE_CODES = {
  UNSUPPORTED_RULE: "unsupported-rule",
  UNVERIFIED_AXIS: "unverified-axis",
  UNKNOWN_FEES: "unknown-fees",
  PRICE_UNAVAILABLE: "price-unavailable",
  SOURCE_UNAVAILABLE: "source-unavailable",
  CONDITION_MISSING: "condition-missing",
  CACHE_BASIS_UNKNOWN: "cache-basis-unknown",
  SOURCE_CONFLICT: "source-conflict",
  USAGE_INVALID: "usage-invalid",
  SERVICE_TIER_UNAVAILABLE: "service-tier-unavailable",
  GROUP_RATE_MISSING: "group-rate-missing",
  MODEL_LIMIT_EXCEEDED: "model-limit-exceeded",
  USAGE_MISSING: "usage-missing",
  PRICE_RANGE_UNAVAILABLE: "price-range-unavailable",
  PRICE_MISSING: "price-missing",
  PRICE_INVALID: "price-invalid",
  EXCHANGE_RATE_MISSING: "exchange-rate-missing",
  OUTPUT_TOKEN_MIX: "output-token-mix",
} as const

export const PRICING_ISSUE_REASONS = {
  CONDITION_SYNTAX: "condition-syntax",
  PRICE_EXPRESSION: "price-expression",
  REQUEST_CONDITION: "request-condition",
  EXPRESSION_VERSION: "expression-version",
  EXPRESSION_LIMIT: "expression-limit",
  TASK_USAGE: "task-usage",
  MISSING_EXPRESSION: "missing-expression",
  SOURCE_CONFLICT: "source-conflict",
} as const

export const QUOTE_STATUSES = {
  COMPLETE: "complete",
  PARTIAL: "partial",
  UNAVAILABLE: "unavailable",
} as const

export const QUOTE_UNITS = {
  REQUEST: "request",
  IMAGE: "image",
  MILLION_SELECTED_TOKENS: "million-selected-tokens",
  MILLION_VIDEO_OUTPUT_TOKENS: "million-video-output-tokens",
  UNRESOLVED: "unresolved",
  VIDEO_SECOND: "video-second",
  AUDIO_SECOND: "audio-second",
  PAGE: "page",
  MEGAPIXEL: "megapixel",
  THOUSAND_CHARACTERS: "thousand-characters",
  SEARCH_UNIT: "search-unit",
} as const

export const PRICING_SERVICE_TIERS = {
  STANDARD: "standard",
  FLEX: "flex",
  PRIORITY: "priority",
  FAST: "fast",
  ULTRAFAST: "ultrafast",
  BATCH: "batch",
} as const

export const PRICING_RESPONSE_FORMATS = {
  OPENAI: "openai",
  ANTHROPIC: "anthropic",
} as const

export const PRICING_SELECTION_AXES = {
  SERVICE_TIER: "serviceTier",
  RESPONSE_FORMAT: "responseFormat",
  IMAGE_SIZE: "imageSize",
  VIDEO_INPUT: "videoInput",
  VIDEO_QUALITY: "videoQuality",
  IMAGE_QUALITY: "imageQuality",
} as const

export const PRICING_RANGE_AXES = {
  INPUT_TOKENS: "inputTokens",
  OUTPUT_TOKENS: "outputTokens",
  TOTAL_TOKENS: "totalTokens",
  UNVERIFIED_CONTEXT_TOKENS: "unverifiedContextTokens",
  INPUT_TOKENS_CACHE_BASIS_UNKNOWN: "inputTokensCacheBasisUnknown",
} as const

/** Common denominator for prices displayed per million tokens. */
export const TOKENS_PER_MILLION = 1_000_000

/** Legacy and structured calculations share these result discriminants. */
export const CALCULATED_PRICE_KINDS = {
  TOKEN: "token",
  PER_CALL: "per-call",
  UNAVAILABLE: "unavailable",
} as const

export const PRICING_IMAGE_SIZES = {
  K1: "1k",
  K2: "2k",
  K3: "3k",
  K4: "4k",
} as const

export const PRICING_VIDEO_INPUTS = {
  WITH_VIDEO: "with-video",
  WITHOUT_VIDEO: "without-video",
} as const

export const PRICING_MEASUREMENT_AXES = {
  IMAGE_MEGAPIXELS: "imageMegapixels",
} as const
