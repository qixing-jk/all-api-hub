import type {
  AccountMetricCoverage,
  AccountStats,
  AccountTodayMetricAvailability,
  AccountTodayMetricReason,
  AccountTodayStatsAvailability,
  AccountTodayStatsCoverage,
} from "~/types"
import {
  ACCOUNT_TODAY_METRIC_REASONS,
  ACCOUNT_TODAY_METRIC_STATUSES,
} from "~/types/accountTodayStats"

const PARTIAL_REASONS = new Set<AccountTodayMetricReason>([
  ACCOUNT_TODAY_METRIC_REASONS.SourcePartial,
  ACCOUNT_TODAY_METRIC_REASONS.PageLimit,
  ACCOUNT_TODAY_METRIC_REASONS.RequestFailed,
])

const UNAVAILABLE_REASON_VALUES = [
  ACCOUNT_TODAY_METRIC_REASONS.LegacyUnclassified,
  ACCOUNT_TODAY_METRIC_REASONS.NotCollected,
  ACCOUNT_TODAY_METRIC_REASONS.Unsupported,
  ACCOUNT_TODAY_METRIC_REASONS.WrongPeriod,
  ACCOUNT_TODAY_METRIC_REASONS.RequestFailed,
  ACCOUNT_TODAY_METRIC_REASONS.InvalidPayload,
] as const
type AccountTodayUnavailableMetricReason =
  (typeof UNAVAILABLE_REASON_VALUES)[number]
const UNAVAILABLE_REASONS = new Set<AccountTodayMetricReason>(
  UNAVAILABLE_REASON_VALUES,
)

const isPlainObject = (value: unknown): value is Record<string, unknown> => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false

  const prototype = Object.getPrototypeOf(value)
  return prototype === Object.prototype || prototype === null
}

const createUnavailableMetric = (
  reason: AccountTodayUnavailableMetricReason,
): AccountTodayMetricAvailability => ({
  status: ACCOUNT_TODAY_METRIC_STATUSES.Unavailable,
  reason,
})

export const createUnavailableTodayStatsAvailability = (
  reason: AccountTodayUnavailableMetricReason,
): AccountTodayStatsAvailability => ({
  consumption: createUnavailableMetric(reason),
  requests: createUnavailableMetric(reason),
  tokens: createUnavailableMetric(reason),
  income: createUnavailableMetric(reason),
})

export const createLegacyTodayStatsAvailability =
  (): AccountTodayStatsAvailability =>
    createUnavailableTodayStatsAvailability(
      ACCOUNT_TODAY_METRIC_REASONS.LegacyUnclassified,
    )

export const createUnsupportedTodayStatsAvailability =
  (): AccountTodayStatsAvailability =>
    createUnavailableTodayStatsAvailability(
      ACCOUNT_TODAY_METRIC_REASONS.Unsupported,
    )

const normalizeDefinedMetricAvailability = (
  value: unknown,
): AccountTodayMetricAvailability | undefined => {
  if (!isPlainObject(value)) return undefined

  const { status, reason } = value as Partial<AccountTodayMetricAvailability>

  if (status === ACCOUNT_TODAY_METRIC_STATUSES.Complete) {
    return { status }
  }

  if (
    status === ACCOUNT_TODAY_METRIC_STATUSES.Partial &&
    reason !== undefined &&
    PARTIAL_REASONS.has(reason)
  ) {
    return { status, reason }
  }

  if (
    status === ACCOUNT_TODAY_METRIC_STATUSES.Unavailable &&
    reason !== undefined &&
    UNAVAILABLE_REASONS.has(reason)
  ) {
    return { status, reason }
  }

  return undefined
}

export const normalizeAccountTodayMetricAvailability = (
  value: unknown,
  fallback: AccountTodayMetricAvailability = createUnavailableMetric(
    ACCOUNT_TODAY_METRIC_REASONS.LegacyUnclassified,
  ),
): AccountTodayMetricAvailability => {
  if (value === undefined) {
    return (
      normalizeDefinedMetricAvailability(fallback) ??
      createUnavailableMetric(ACCOUNT_TODAY_METRIC_REASONS.LegacyUnclassified)
    )
  }

  return (
    normalizeDefinedMetricAvailability(value) ??
    createUnavailableMetric(ACCOUNT_TODAY_METRIC_REASONS.LegacyUnclassified)
  )
}

export const normalizeAccountTodayStatsAvailability = (
  value: unknown,
  fallback: AccountTodayStatsAvailability = createLegacyTodayStatsAvailability(),
): AccountTodayStatsAvailability => {
  if (value !== undefined && !isPlainObject(value)) {
    return createLegacyTodayStatsAvailability()
  }

  const availability = (value ?? {}) as Partial<AccountTodayStatsAvailability>

  return {
    consumption: normalizeAccountTodayMetricAvailability(
      availability.consumption,
      fallback.consumption,
    ),
    requests: normalizeAccountTodayMetricAvailability(
      availability.requests,
      fallback.requests,
    ),
    tokens: normalizeAccountTodayMetricAvailability(
      availability.tokens,
      fallback.tokens,
    ),
    income: normalizeAccountTodayMetricAvailability(
      availability.income,
      fallback.income,
    ),
  }
}

export const isAccountTodayMetricAvailable = (
  availability: AccountTodayMetricAvailability,
): boolean => availability.status !== ACCOUNT_TODAY_METRIC_STATUSES.Unavailable

export const isAccountTodayMetricComplete = (
  availability: AccountTodayMetricAvailability,
): boolean => availability.status === ACCOUNT_TODAY_METRIC_STATUSES.Complete

export const isAccountTodayMetricLegacyUnclassified = (
  availability: AccountTodayMetricAvailability,
): boolean =>
  availability.status === ACCOUNT_TODAY_METRIC_STATUSES.Unavailable &&
  availability.reason === ACCOUNT_TODAY_METRIC_REASONS.LegacyUnclassified

export const collectAccountMetricContributors = <T>(
  items: readonly T[],
  getValue: (item: T) => number,
  getAvailability: (item: T) => AccountTodayMetricAvailability,
): { value: number; coverage: AccountMetricCoverage } => {
  let value = 0
  let completeCount = 0
  let partialCount = 0
  let legacyUnclassifiedCount = 0

  for (const item of items) {
    const availability = getAvailability(item)
    if (isAccountTodayMetricComplete(availability)) {
      value += getValue(item)
      completeCount += 1
    } else if (isAccountTodayMetricAvailable(availability)) {
      value += getValue(item)
      partialCount += 1
    } else if (isAccountTodayMetricLegacyUnclassified(availability)) {
      legacyUnclassifiedCount += 1
    }
  }

  const eligibleCount = items.length
  const status =
    eligibleCount > 0 && completeCount === eligibleCount
      ? ACCOUNT_TODAY_METRIC_STATUSES.Complete
      : completeCount + partialCount > 0
        ? ACCOUNT_TODAY_METRIC_STATUSES.Partial
        : ACCOUNT_TODAY_METRIC_STATUSES.Unavailable

  return {
    value,
    coverage: {
      status,
      completeCount,
      partialCount,
      eligibleCount,
      legacyUnclassifiedCount,
    },
  }
}

const createEmptyMetricCoverage = (): AccountMetricCoverage => ({
  status: ACCOUNT_TODAY_METRIC_STATUSES.Unavailable,
  completeCount: 0,
  partialCount: 0,
  eligibleCount: 0,
  legacyUnclassifiedCount: 0,
})

export const createEmptyAccountTodayStatsCoverage =
  (): AccountTodayStatsCoverage => ({
    consumption: createEmptyMetricCoverage(),
    requests: createEmptyMetricCoverage(),
    tokens: createEmptyMetricCoverage(),
    income: createEmptyMetricCoverage(),
  })

export const createEmptyAccountStats = (): AccountStats => ({
  total_quota: 0,
  today_total_consumption: 0,
  today_total_requests: 0,
  today_total_prompt_tokens: 0,
  today_total_completion_tokens: 0,
  today_total_income: 0,
  todayStatsCoverage: createEmptyAccountTodayStatsCoverage(),
})
