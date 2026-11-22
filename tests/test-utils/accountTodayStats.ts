import type { Asset } from "~/services/amounts/assets"
import {
  ASSET_KINDS,
  EVIDENCE_KINDS,
  FINANCIAL_COVERAGE,
  FINANCIAL_SETTLEMENT_STATUSES,
  FINANCIAL_SUBJECT_KINDS,
  INCOME_CLASSIFICATIONS,
  OBSERVATION_STATUSES,
  SCOPE_SELECTION_KINDS,
} from "~/services/amounts/financialConstants"
import type { FinancialIncomeFact } from "~/services/amounts/income"
import type { FinancialConsumptionFact } from "~/services/amounts/usage"
import type {
  AccountStats,
  AccountTodayStatsAvailability,
  AccountTodayStatsCoverage,
} from "~/types"
import {
  ACCOUNT_TODAY_METRIC_REASONS,
  ACCOUNT_TODAY_METRIC_STATUSES,
} from "~/types/accountTodayStats"

/** Explicit same-period native fixture; no legacy currency conversion is inferred. */
export function buildFinancialPeriodFact({
  accountId,
  value,
  asset = { kind: ASSET_KINDS.Currency, code: "USD" },
  coverage = FINANCIAL_COVERAGE.Complete,
}: {
  accountId: string
  value: string
  asset?: Asset
  coverage?: FinancialConsumptionFact["coverage"]
}): FinancialConsumptionFact {
  const start = new Date()
  start.setHours(0, 0, 0, 0)
  const end = start.getTime() + 1
  return {
    asset,
    amount: {
      status: OBSERVATION_STATUSES.Known,
      value,
      observedAt: end,
      source: {
        adapter: "fixture",
        operation: "usage",
        contractVersion: "1",
        kind: EVIDENCE_KINDS.Reported,
      },
    },
    scope: {
      subject: { kind: FINANCIAL_SUBJECT_KINDS.Account, accountId },
      authority: `https://${accountId}.example`,
      walletId: accountId,
      projects: { kind: SCOPE_SELECTION_KINDS.All },
      keys: { kind: SCOPE_SELECTION_KINDS.All },
      models: { kind: SCOPE_SELECTION_KINDS.All },
      groups: { kind: SCOPE_SELECTION_KINDS.All },
    },
    window: {
      start: start.getTime(),
      end,
      timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    },
    coverage,
    settlement: FINANCIAL_SETTLEMENT_STATUSES.Settled,
  }
}

export function buildFinancialIncomeFact(
  options: Parameters<typeof buildFinancialPeriodFact>[0],
): FinancialIncomeFact {
  const { settlement: _settlement, ...fact } = buildFinancialPeriodFact(options)
  return {
    ...fact,
    classification: INCOME_CLASSIFICATIONS.Grant,
    amount: {
      ...fact.amount,
      source: { ...fact.amount.source, operation: "income" },
    },
  }
}

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
