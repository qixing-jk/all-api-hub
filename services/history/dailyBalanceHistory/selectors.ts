import { UI_CONSTANTS } from "~/constants/ui"
import type { CurrencyType } from "~/types"
import type { DailyBalanceHistoryStore } from "~/types/dailyBalanceHistory"

import { listDayKeysInRange } from "./dayKeys"

export interface DailyBalanceHistoryCoverage {
  totalAccounts: number
  snapshotAccounts: number
  cashflowAccounts: number
}

type ExchangeRateLookup = Record<string, number> | Map<string, number>

export type DailyBalanceHistoryMetric = "balance" | "income" | "outcome" | "net"

export interface PerAccountDailyBalanceMoneySeries {
  balance: Array<number | null>
  income: Array<number | null>
  outcome: Array<number | null>
  net: Array<number | null>
}

export interface AccountRangeSummary {
  accountId: string
  startBalance: number | null
  endBalance: number | null
  incomeTotal: number | null
  outcomeTotal: number | null
  netTotal: number | null
  snapshotDays: number
  cashflowDays: number
  totalDays: number
}

/**
 *
 */
function resolveExchangeRate(params: {
  accountId: string
  currencyType: CurrencyType
  exchangeRateByAccountId?: ExchangeRateLookup
}): number {
  const { accountId, currencyType, exchangeRateByAccountId } = params

  if (currencyType !== "CNY") return 1

  let value: unknown
  if (exchangeRateByAccountId instanceof Map) {
    value = exchangeRateByAccountId.get(accountId)
  } else {
    value = exchangeRateByAccountId?.[accountId]
  }

  return typeof value === "number" && Number.isFinite(value) && value > 0
    ? value
    : UI_CONSTANTS.EXCHANGE_RATE.DEFAULT
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

/**
 * Build aggregated (sum) daily series for a selection of accounts, returning values
 * in the requested currency (USD/CNY) instead of the raw quota unit.
 *
 * Notes:
 * - The underlying snapshots are stored in the extension's quota unit, which maps to USD
 *   via {@link UI_CONSTANTS.EXCHANGE_RATE.CONVERSION_FACTOR}.
 * - For CNY, each account can have its own exchange rate (CNY per USD). When missing/invalid,
 *   {@link UI_CONSTANTS.EXCHANGE_RATE.DEFAULT} is used.
 * - Missing snapshots and missing cashflow values are treated as gaps by returning `null`
 *   values for those days (same behavior as {@link buildAggregatedDailyBalanceSeries}).
 */
export function buildAggregatedDailyBalanceMoneySeries(params: {
  store: DailyBalanceHistoryStore | null
  accountIds: string[]
  startDayKey: string
  endDayKey: string
  currencyType: CurrencyType
  exchangeRateByAccountId?: ExchangeRateLookup
}): {
  dayKeys: string[]
  balanceTotals: Array<number | null>
  incomeTotals: Array<number | null>
  outcomeTotals: Array<number | null>
  coverage: DailyBalanceHistoryCoverage[]
} {
  const {
    store,
    accountIds,
    startDayKey,
    endDayKey,
    currencyType,
    exchangeRateByAccountId,
  } = params

  const dayKeys = listDayKeysInRange({ startDayKey, endDayKey })
  const totalAccounts = accountIds.length

  if (!store || totalAccounts === 0 || dayKeys.length === 0) {
    return {
      dayKeys,
      balanceTotals: dayKeys.map(() => null),
      incomeTotals: dayKeys.map(() => null),
      outcomeTotals: dayKeys.map(() => null),
      coverage: dayKeys.map(() => ({
        totalAccounts,
        snapshotAccounts: 0,
        cashflowAccounts: 0,
      })),
    }
  }

  const conversionFactor = UI_CONSTANTS.EXCHANGE_RATE.CONVERSION_FACTOR

  const balanceTotals: Array<number | null> = []
  const incomeTotals: Array<number | null> = []
  const outcomeTotals: Array<number | null> = []
  const coverage: DailyBalanceHistoryCoverage[] = []

  for (const dayKey of dayKeys) {
    let snapshotAccounts = 0
    let cashflowAccounts = 0
    let balanceSum = 0
    let incomeSum = 0
    let outcomeSum = 0

    for (const accountId of accountIds) {
      const snapshot = store.snapshotsByAccountId[accountId]?.[dayKey]
      if (!snapshot) {
        continue
      }

      const exchangeRate = resolveExchangeRate({
        accountId,
        currencyType,
        exchangeRateByAccountId,
      })

      snapshotAccounts += 1
      balanceSum += (snapshot.quota / conversionFactor) * exchangeRate

      if (
        typeof snapshot.today_income === "number" &&
        typeof snapshot.today_quota_consumption === "number"
      ) {
        cashflowAccounts += 1
        incomeSum += (snapshot.today_income / conversionFactor) * exchangeRate
        outcomeSum +=
          (snapshot.today_quota_consumption / conversionFactor) * exchangeRate
      }
    }

    coverage.push({
      totalAccounts,
      snapshotAccounts,
      cashflowAccounts,
    })

    balanceTotals.push(snapshotAccounts === totalAccounts ? balanceSum : null)
    incomeTotals.push(cashflowAccounts === totalAccounts ? incomeSum : null)
    outcomeTotals.push(cashflowAccounts === totalAccounts ? outcomeSum : null)
  }

  return { dayKeys, balanceTotals, incomeTotals, outcomeTotals, coverage }
}

/**
 * Build per-account (non-aggregated) daily series, returning values in the requested currency.
 *
 * Unlike {@link buildAggregatedDailyBalanceMoneySeries}, missing snapshots are treated as per-account
 * gaps and do not prevent other accounts' series from rendering.
 */
export function buildPerAccountDailyBalanceMoneySeries(params: {
  store: DailyBalanceHistoryStore | null
  accountIds: string[]
  startDayKey: string
  endDayKey: string
  currencyType: CurrencyType
  exchangeRateByAccountId?: ExchangeRateLookup
}): {
  dayKeys: string[]
  seriesByAccountId: Record<string, PerAccountDailyBalanceMoneySeries>
  coverageByDay: DailyBalanceHistoryCoverage[]
} {
  const {
    store,
    accountIds,
    startDayKey,
    endDayKey,
    currencyType,
    exchangeRateByAccountId,
  } = params

  const dayKeys = listDayKeysInRange({ startDayKey, endDayKey })
  const totalAccounts = accountIds.length

  const coverageByDay: DailyBalanceHistoryCoverage[] = dayKeys.map(() => ({
    totalAccounts,
    snapshotAccounts: 0,
    cashflowAccounts: 0,
  }))

  const seriesByAccountId: Record<string, PerAccountDailyBalanceMoneySeries> =
    {}

  if (totalAccounts === 0 || dayKeys.length === 0) {
    return { dayKeys, seriesByAccountId, coverageByDay }
  }

  const conversionFactor = UI_CONSTANTS.EXCHANGE_RATE.CONVERSION_FACTOR

  for (const accountId of accountIds) {
    const exchangeRate = resolveExchangeRate({
      accountId,
      currencyType,
      exchangeRateByAccountId,
    })

    const balance = dayKeys.map(() => null) as Array<number | null>
    const income = dayKeys.map(() => null) as Array<number | null>
    const outcome = dayKeys.map(() => null) as Array<number | null>
    const net = dayKeys.map(() => null) as Array<number | null>

    const perDay = store?.snapshotsByAccountId[accountId]
    if (perDay) {
      for (let index = 0; index < dayKeys.length; index += 1) {
        const dayKey = dayKeys[index]
        const snapshot = perDay[dayKey]
        if (!snapshot) continue

        coverageByDay[index].snapshotAccounts += 1
        balance[index] = (snapshot.quota / conversionFactor) * exchangeRate

        if (
          typeof snapshot.today_income === "number" &&
          typeof snapshot.today_quota_consumption === "number"
        ) {
          coverageByDay[index].cashflowAccounts += 1

          const incomeValue =
            (snapshot.today_income / conversionFactor) * exchangeRate
          const outcomeValue =
            (snapshot.today_quota_consumption / conversionFactor) * exchangeRate

          income[index] = incomeValue
          outcome[index] = outcomeValue
          net[index] = incomeValue - outcomeValue
        }
      }
    }

    seriesByAccountId[accountId] = { balance, income, outcome, net }
  }

  return { dayKeys, seriesByAccountId, coverageByDay }
}

/**
 * Build per-account summary values for a selected date range.
 *
 * This is intended for the Balance History overview KPIs and the unified per-account table.
 */
export function buildAccountRangeSummaries(params: {
  store: DailyBalanceHistoryStore | null
  accountIds: string[]
  startDayKey: string
  endDayKey: string
  currencyType: CurrencyType
  exchangeRateByAccountId?: ExchangeRateLookup
}): {
  dayKeys: string[]
  summaries: AccountRangeSummary[]
} {
  const {
    store,
    accountIds,
    startDayKey,
    endDayKey,
    currencyType,
    exchangeRateByAccountId,
  } = params

  const dayKeys = listDayKeysInRange({ startDayKey, endDayKey })
  const totalDays = dayKeys.length

  if (accountIds.length === 0 || totalDays === 0) {
    return { dayKeys, summaries: [] }
  }

  const conversionFactor = UI_CONSTANTS.EXCHANGE_RATE.CONVERSION_FACTOR

  const summaries: AccountRangeSummary[] = []

  for (const accountId of accountIds) {
    const exchangeRate = resolveExchangeRate({
      accountId,
      currencyType,
      exchangeRateByAccountId,
    })

    const perDay = store?.snapshotsByAccountId[accountId]
    const startSnapshot = perDay?.[startDayKey]
    const endSnapshot = perDay?.[endDayKey]

    const startBalance =
      typeof startSnapshot?.quota === "number"
        ? (startSnapshot.quota / conversionFactor) * exchangeRate
        : null

    const endBalance =
      typeof endSnapshot?.quota === "number"
        ? (endSnapshot.quota / conversionFactor) * exchangeRate
        : null

    let snapshotDays = 0
    let cashflowDays = 0
    let incomeSum = 0
    let outcomeSum = 0

    if (perDay) {
      for (const dayKey of dayKeys) {
        const snapshot = perDay[dayKey]
        if (!snapshot) continue
        snapshotDays += 1

        if (
          typeof snapshot.today_income === "number" &&
          typeof snapshot.today_quota_consumption === "number"
        ) {
          cashflowDays += 1
          incomeSum += (snapshot.today_income / conversionFactor) * exchangeRate
          outcomeSum +=
            (snapshot.today_quota_consumption / conversionFactor) * exchangeRate
        }
      }
    }

    const incomeTotal = cashflowDays > 0 ? incomeSum : null
    const outcomeTotal = cashflowDays > 0 ? outcomeSum : null
    const netTotal =
      cashflowDays > 0 && incomeTotal !== null && outcomeTotal !== null
        ? incomeTotal - outcomeTotal
        : null

    summaries.push({
      accountId,
      startBalance,
      endBalance,
      incomeTotal,
      outcomeTotal,
      netTotal,
      snapshotDays,
      cashflowDays,
      totalDays,
    })
  }

  return { dayKeys, summaries }
}
