export const ACCOUNT_TODAY_METRIC_STATUSES = {
  Complete: "complete",
  Partial: "partial",
  Unavailable: "unavailable",
} as const

export const ACCOUNT_TODAY_METRIC_REASONS = {
  LegacyUnclassified: "legacy_unclassified",
  NotCollected: "not_collected",
  Unsupported: "unsupported",
  WrongPeriod: "wrong_period",
  RequestFailed: "request_failed",
  InvalidPayload: "invalid_payload",
  SourcePartial: "source_partial",
  PageLimit: "page_limit",
} as const

export type AccountTodayMetricStatus =
  (typeof ACCOUNT_TODAY_METRIC_STATUSES)[keyof typeof ACCOUNT_TODAY_METRIC_STATUSES]

export type AccountTodayMetricReason =
  (typeof ACCOUNT_TODAY_METRIC_REASONS)[keyof typeof ACCOUNT_TODAY_METRIC_REASONS]

export interface AccountTodayMetricAvailability {
  status: AccountTodayMetricStatus
  reason?: AccountTodayMetricReason
}

export interface AccountTodayStatsAvailability {
  consumption: AccountTodayMetricAvailability
  requests: AccountTodayMetricAvailability
  tokens: AccountTodayMetricAvailability
  income: AccountTodayMetricAvailability
}

export interface AccountMetricCoverage {
  status: AccountTodayMetricStatus
  completeCount: number
  partialCount: number
  eligibleCount: number
  legacyUnclassifiedCount: number
}

export interface AccountTodayStatsCoverage {
  consumption: AccountMetricCoverage
  requests: AccountMetricCoverage
  tokens: AccountMetricCoverage
  income: AccountMetricCoverage
}
