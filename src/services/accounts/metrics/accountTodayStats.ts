import { ACCOUNT_USAGE_SCOPES } from "~/constants/accountUsage"
import { getDisplayConsumptionProjection } from "~/services/accounts/metrics/consumptionProjection"
import { assetIdentity } from "~/services/amounts/assets"
import {
  isKnownOrStaleObservation,
  usageScopeKey,
} from "~/services/amounts/balance"
import {
  ASSET_KINDS,
  FINANCIAL_SETTLEMENT_STATUSES,
  FINANCIAL_SUBJECT_KINDS,
  OBSERVATION_STATUSES,
} from "~/services/amounts/financialConstants"
import type { FinancialConsumptionFact } from "~/services/amounts/usage"
import type {
  AccountMetricCoverage,
  AccountStats,
  AccountTodayMetricAvailability,
  AccountTodayMetricReason,
  AccountTodayStatsAvailability,
  AccountTodayStatsCoverage,
  AccountUsageSummary,
} from "~/types"
import {
  ACCOUNT_TODAY_METRIC_REASONS,
  ACCOUNT_TODAY_METRIC_STATUSES,
} from "~/types/accountTodayStats"
import {
  createUnixDayKeyFormatter,
  formatLocalDayKey,
} from "~/utils/core/dayKey"

/** Check that the observed interval begins at the provider's calendar boundary. */
function isProviderDayWindow({
  start,
  end,
  timeZone,
}: FinancialConsumptionFact["window"]) {
  if (end <= start) return false
  try {
    const dayKey = createUnixDayKeyFormatter(timeZone)
    const day = dayKey(start / 1000)
    return (
      dayKey((start - 1) / 1000) !== day && dayKey((end - 1) / 1000) === day
    )
  } catch {
    return false
  }
}

/** The provider's day can coexist with lifetime usage on the same account. */
export function getSiteDayUsages(
  account: {
    usage?: AccountUsageSummary
    usageObservations?: AccountUsageSummary[]
    settledConsumption?: FinancialConsumptionFact[]
  },
  asOf = Date.now(),
): AccountUsageSummary[] {
  const observations = [account.usage, ...(account.usageObservations ?? [])]
  const facts = account.settledConsumption ?? []
  const accountId =
    facts[0]?.scope.subject.kind === FINANCIAL_SUBJECT_KINDS.Account
      ? (facts[0].scope.subject.accountId ?? "")
      : ""
  const projected = getDisplayConsumptionProjection(
    [{ id: accountId, settledConsumption: facts }],
    asOf,
  )
  const seen = new Set<string>()
  return [
    ...observations,
    ...facts
      .filter(
        ({ window, settlement }) =>
          settlement === FINANCIAL_SETTLEMENT_STATUSES.Settled &&
          isProviderDayWindow(window),
      )
      .map((fact): AccountUsageSummary => ({
        scope: ACCOUNT_USAGE_SCOPES.Today,
        cost: {
          asset: fact.asset,
          amount: fact.amount,
          scope: fact.scope,
          window: fact.window,
          coverage: fact.coverage,
        },
      })),
  ].flatMap((usage) => {
    if (
      !usage ||
      (usage.scope !== ACCOUNT_USAGE_SCOPES.Today &&
        usage.scope !== ACCOUNT_USAGE_SCOPES.SiteToday)
    )
      return []
    const originalCost = usage.cost
    const duplicateCost =
      usage.scope === ACCOUNT_USAGE_SCOPES.Today &&
      originalCost &&
      projected.groups.some(
        ({ amount, window }) =>
          assetIdentity(amount.asset) === assetIdentity(originalCost.asset) &&
          JSON.stringify(window) === JSON.stringify(originalCost.window),
      )
    const cost = duplicateCost ? undefined : originalCost
    const hasCounters =
      usage.totalRequests !== undefined || usage.totalTokens !== undefined
    if (
      usage.scope !== ACCOUNT_USAGE_SCOPES.SiteToday &&
      (!cost ||
        cost.asset.kind === ASSET_KINDS.Unknown ||
        !isKnownOrStaleObservation(cost.amount)) &&
      !hasCounters
    )
      return []
    const key =
      cost && isKnownOrStaleObservation(cost.amount)
        ? JSON.stringify([
            assetIdentity(cost.asset),
            cost.amount.value,
            cost.amount.observedAt,
            cost.scope ? usageScopeKey(cost.scope) : undefined,
            cost.amount.source,
            cost.window,
            usage.reportedDay,
          ])
        : JSON.stringify([
            usage.totalRequests,
            usage.totalTokens,
            usage.reportedDay,
            originalCost?.window,
          ])
    if (seen.has(key)) return []
    seen.add(key)
    return [
      {
        ...usage,
        scope: ACCOUNT_USAGE_SCOPES.SiteToday,
        ...(duplicateCost
          ? {
              cost: undefined,
              observedAt:
                usage.observedAt ??
                (isKnownOrStaleObservation(originalCost.amount)
                  ? originalCost.amount.observedAt
                  : undefined),
            }
          : {}),
      },
    ]
  })
}

export interface SiteDayReading {
  usage: AccountUsageSummary
  observedAt?: number
  lastKnown: boolean
}

/** Shared freshness for rows, totals and exports; observation dates never redefine the provider's billing day. */
export function getSiteDayReadings(
  account: Parameters<typeof getSiteDayUsages>[0] & { last_sync_time?: number },
  asOf = Date.now(),
): SiteDayReading[] {
  return getSiteDayUsages(account, asOf).map((usage) => {
    const amount = usage.cost?.amount
    const at =
      usage.observedAt ??
      (isKnownOrStaleObservation(amount)
        ? amount.observedAt
        : usage.lastKnown
          ? undefined
          : account.last_sync_time)
    const observedAt =
      typeof at === "number" &&
      at > 0 &&
      Number.isFinite(new Date(at).getTime())
        ? at
        : undefined
    return {
      usage,
      ...(observedAt === undefined ? {} : { observedAt }),
      lastKnown:
        usage.lastKnown === true ||
        amount?.status === OBSERVATION_STATUSES.Stale ||
        observedAt === undefined ||
        observedAt > asOf ||
        formatLocalDayKey(new Date(observedAt)) !==
          formatLocalDayKey(new Date(asOf)),
    }
  })
}

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
