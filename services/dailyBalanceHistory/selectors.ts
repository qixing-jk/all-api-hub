import type { DailyBalanceHistoryStore } from "~/types/dailyBalanceHistory"

import { listDayKeysInRange } from "./dayKeys"

export interface DailyBalanceHistoryCoverage {
  totalAccounts: number
  snapshotAccounts: number
  cashflowAccounts: number
}

/**
 * Build aggregated (sum) daily series for a selection of accounts.
 *
 * Missing snapshots and missing cashflow values are treated as gaps by
 * returning `null` values for those days.
 */
export function buildAggregatedDailyBalanceSeries(params: {
  store: DailyBalanceHistoryStore | null
  accountIds: string[]
  startDayKey: string
  endDayKey: string
}): {
  dayKeys: string[]
  quotaTotals: Array<number | null>
  incomeTotals: Array<number | null>
  outcomeTotals: Array<number | null>
  coverage: DailyBalanceHistoryCoverage[]
} {
  const { store, accountIds, startDayKey, endDayKey } = params

  const dayKeys = listDayKeysInRange({ startDayKey, endDayKey })
  const totalAccounts = accountIds.length

  if (!store || totalAccounts === 0 || dayKeys.length === 0) {
    return {
      dayKeys,
      quotaTotals: dayKeys.map(() => null),
      incomeTotals: dayKeys.map(() => null),
      outcomeTotals: dayKeys.map(() => null),
      coverage: dayKeys.map(() => ({
        totalAccounts,
        snapshotAccounts: 0,
        cashflowAccounts: 0,
      })),
    }
  }

  const quotaTotals: Array<number | null> = []
  const incomeTotals: Array<number | null> = []
  const outcomeTotals: Array<number | null> = []
  const coverage: DailyBalanceHistoryCoverage[] = []

  for (const dayKey of dayKeys) {
    let snapshotAccounts = 0
    let cashflowAccounts = 0
    let quotaSum = 0
    let incomeSum = 0
    let outcomeSum = 0

    for (const accountId of accountIds) {
      const snapshot = store.snapshotsByAccountId[accountId]?.[dayKey]
      if (!snapshot) {
        continue
      }

      snapshotAccounts += 1
      quotaSum += snapshot.quota

      if (
        typeof snapshot.today_income === "number" &&
        typeof snapshot.today_quota_consumption === "number"
      ) {
        cashflowAccounts += 1
        incomeSum += snapshot.today_income
        outcomeSum += snapshot.today_quota_consumption
      }
    }

    coverage.push({
      totalAccounts,
      snapshotAccounts,
      cashflowAccounts,
    })

    quotaTotals.push(snapshotAccounts === totalAccounts ? quotaSum : null)
    incomeTotals.push(cashflowAccounts === totalAccounts ? incomeSum : null)
    outcomeTotals.push(cashflowAccounts === totalAccounts ? outcomeSum : null)
  }

  return { dayKeys, quotaTotals, incomeTotals, outcomeTotals, coverage }
}

