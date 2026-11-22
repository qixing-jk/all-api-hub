import { OBSERVATION_STATUSES } from "~/services/amounts/financialConstants"
import { DAILY_BALANCE_HISTORY_METRICS } from "~/services/history/dailyBalanceHistory/constants"
import type {
  buildAccountRangeSummaries,
  buildPerAccountDailyBalanceMoneySeries,
  DailyBalanceHistoryMetric,
  FinancialHistorySeries,
} from "~/services/history/dailyBalanceHistory/selectors"
import { getDayKeyFromUnixSeconds } from "~/utils/core/dayKey"

import type { BalanceHistoryAccountSummaryRow } from "./accountSummary"
import type { presentNativeHistoryActivity } from "./nativeHistoryActivity"

type PerAccountSeries = ReturnType<
  typeof buildPerAccountDailyBalanceMoneySeries
>
type RangeSummaries = ReturnType<typeof buildAccountRangeSummaries>

/** Sum available accounts while leaving wholly unobserved days as gaps. */
export function buildHistoryTrendTotals(
  effectiveAccountIds: string[],
  effectiveTrendMetric: DailyBalanceHistoryMetric,
  perAccountSeries: PerAccountSeries,
) {
  // Best-effort aggregation: sum accounts that have data for each day.
  // Keep gaps only when no selected accounts have a value for that day.
  const totals: Array<number | null> = perAccountSeries.dayKeys.map(() => null)

  for (let index = 0; index < perAccountSeries.dayKeys.length; index += 1) {
    let sum = 0
    let covered = 0

    for (const accountId of effectiveAccountIds) {
      const value =
        perAccountSeries.seriesByAccountId[accountId]?.[effectiveTrendMetric]?.[
          index
        ]

      if (typeof value !== "number" || !Number.isFinite(value)) continue
      covered += 1
      sum += value
    }

    totals[index] = covered > 0 ? sum : null
  }

  return totals
}

/** Coverage extrema describe recorded days, independently of missing days. */
export function buildHistoryTrendCoverage(
  totalAccounts: number,
  effectiveTrendMetric: DailyBalanceHistoryMetric,
  coverageByDay: PerAccountSeries["coverageByDay"],
) {
  const coverageCounts = coverageByDay.map((coverage) => {
    if (effectiveTrendMetric === DAILY_BALANCE_HISTORY_METRICS.Balance)
      return coverage.snapshotAccounts
    if (effectiveTrendMetric === DAILY_BALANCE_HISTORY_METRICS.EstimatedIncome)
      return coverage.estimatedIncomeAccounts
    if (effectiveTrendMetric === DAILY_BALANCE_HISTORY_METRICS.Income)
      return coverage.incomeAccounts
    if (effectiveTrendMetric === DAILY_BALANCE_HISTORY_METRICS.Outcome)
      return coverage.outcomeAccounts
    return coverage.cashflowAccounts
  })

  const availableCoverage = coverageCounts.filter((count) => count > 0)
  const availableDays = availableCoverage.length

  const minCovered = availableDays > 0 ? Math.min(...availableCoverage) : 0
  const maxCovered = availableDays > 0 ? Math.max(...availableCoverage) : 0

  const partialDays = availableCoverage.filter(
    (count) => count < totalAccounts,
  ).length

  return {
    totalAccounts,
    minCovered,
    maxCovered,
    partialDays,
  }
}

/** Each reference metric keeps its own count; absent totals stay null. */
export function buildHistoryOverviewTotals(
  totalAccounts: number,
  summaries: RangeSummaries["summaries"],
) {
  let endBalanceCovered = 0
  let endBalanceSum = 0
  let netCovered = 0
  let netSum = 0
  let incomeCovered = 0
  let incomeSum = 0
  let outcomeCovered = 0
  let outcomeSum = 0

  for (const summary of summaries) {
    if (typeof summary.endBalance === "number") {
      endBalanceCovered += 1
      endBalanceSum += summary.endBalance
    }

    if (typeof summary.netTotal === "number") {
      netCovered += 1
      netSum += summary.netTotal
    }

    if (typeof summary.incomeTotal === "number") {
      incomeCovered += 1
      incomeSum += summary.incomeTotal
    }

    if (typeof summary.outcomeTotal === "number") {
      outcomeCovered += 1
      outcomeSum += summary.outcomeTotal
    }
  }

  return {
    totalAccounts,
    endBalance: endBalanceCovered ? endBalanceSum : null,
    endBalanceCovered,
    rangeNet: netCovered ? netSum : null,
    rangeNetCovered: netCovered,
    incomeTotal: incomeCovered ? incomeSum : null,
    incomeCovered,
    outcomeTotal: outcomeCovered ? outcomeSum : null,
    outcomeCovered,
  }
}

/** Count known native and archived days once per account, across all positions. */
export function buildHistoryAccountSummaryRows(
  financialSeries: FinancialHistorySeries[],
  perAccountSeries: PerAccountSeries,
  summaries: RangeSummaries["summaries"],
  accountDisplayLabelById: Map<string, string>,
  accountEntries: ReturnType<
    typeof presentNativeHistoryActivity
  >["accountEntries"],
): BalanceHistoryAccountSummaryRow[] {
  const recordedDays = new Map<string, Set<string>>()
  for (const item of financialSeries) {
    const days = recordedDays.get(item.accountId) ?? new Set<string>()
    for (const observation of item.observations) {
      if (observation.status === OBSERVATION_STATUSES.Known) {
        days.add(getDayKeyFromUnixSeconds(observation.at / 1000))
      }
    }
    recordedDays.set(item.accountId, days)
  }
  for (const [accountId, days] of recordedDays) {
    perAccountSeries.seriesByAccountId[accountId]?.balance.forEach(
      (value, index) => {
        const day = perAccountSeries.dayKeys[index]
        if (day && value !== null) days.add(day)
      },
    )
  }
  return summaries.map((summary) => ({
    id: summary.accountId,
    label: accountDisplayLabelById.get(summary.accountId) ?? summary.accountId,
    startBalance: summary.startBalance,
    endBalance: summary.endBalance,
    netTotal: summary.netTotal,
    incomeTotal: summary.incomeTotal,
    estimatedIncomeTotal: summary.estimatedIncomeTotal,
    outcomeTotal: summary.outcomeTotal,
    nativeActivity: accountEntries.get(summary.accountId),
    snapshotDays:
      recordedDays.get(summary.accountId)?.size ?? summary.snapshotDays,
    cashflowDays: summary.cashflowDays,
    estimatedIncomeDays: summary.estimatedIncomeDays,
    totalDays: summary.totalDays,
  }))
}
