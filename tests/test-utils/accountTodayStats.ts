import type {
  AccountStats,
  AccountTodayStatsAvailability,
  AccountTodayStatsCoverage,
} from "~/types"
import {
  ACCOUNT_TODAY_METRIC_REASONS,
  ACCOUNT_TODAY_METRIC_STATUSES,
} from "~/types/accountTodayStats"

export function buildCompleteTodayStatsAvailability(
  overrides: Partial<AccountTodayStatsAvailability> = {},
): AccountTodayStatsAvailability {
  const complete = { status: ACCOUNT_TODAY_METRIC_STATUSES.Complete } as const
  return {
    consumption: { ...complete, ...overrides.consumption },
    requests: { ...complete, ...overrides.requests },
    tokens: { ...complete, ...overrides.tokens },
    income: { ...complete, ...overrides.income },
  }
}

export function buildTodayStatsAvailabilityReplacementCases() {
  const legacyUnavailable = {
    status: ACCOUNT_TODAY_METRIC_STATUSES.Unavailable,
    reason: ACCOUNT_TODAY_METRIC_REASONS.LegacyUnclassified,
  } as const

  return [
    {
      label: "missing availability",
      availability: undefined,
      expected: undefined,
    },
    {
      label: "availability missing metric groups",
      availability: {
        requests: { status: ACCOUNT_TODAY_METRIC_STATUSES.Complete },
      },
      expected: {
        consumption: legacyUnavailable,
        requests: { status: ACCOUNT_TODAY_METRIC_STATUSES.Complete },
        tokens: legacyUnavailable,
        income: legacyUnavailable,
      },
    },
    {
      label: "reasonless partial availability",
      availability: buildCompleteTodayStatsAvailability({
        consumption: {
          status: ACCOUNT_TODAY_METRIC_STATUSES.Partial,
        },
      }),
      expected: buildCompleteTodayStatsAvailability({
        consumption: legacyUnavailable,
      }),
    },
    {
      label: "reasonless unavailable availability",
      availability: buildCompleteTodayStatsAvailability({
        consumption: {
          status: ACCOUNT_TODAY_METRIC_STATUSES.Unavailable,
        },
      }),
      expected: buildCompleteTodayStatsAvailability({
        consumption: legacyUnavailable,
      }),
    },
  ] as const
}

function buildCompleteAccountTodayStatsCoverage(): AccountTodayStatsCoverage {
  const complete = {
    status: ACCOUNT_TODAY_METRIC_STATUSES.Complete,
    completeCount: 1,
    partialCount: 0,
    eligibleCount: 1,
    legacyUnclassifiedCount: 0,
  } as const
  return {
    consumption: { ...complete },
    requests: { ...complete },
    tokens: { ...complete },
    income: { ...complete },
  }
}

export function buildAccountStats(
  overrides: Partial<AccountStats> = {},
): AccountStats {
  return {
    total_quota: 0,
    today_total_consumption: 0,
    today_total_requests: 0,
    today_total_prompt_tokens: 0,
    today_total_completion_tokens: 0,
    today_total_income: 0,
    todayStatsCoverage: buildCompleteAccountTodayStatsCoverage(),
    ...overrides,
  }
}
