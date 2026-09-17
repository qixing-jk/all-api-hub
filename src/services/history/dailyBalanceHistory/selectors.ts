import { DEFAULT_USD_TO_CNY_RATE, QUOTA_PER_USD } from "~/constants/money"
import { listDayKeysInRange } from "~/services/history/dailyBalanceHistory/dayKeys"
import { estimateTodayIncomeForAccount } from "~/services/history/dailyBalanceHistory/todayIncomeEstimate"
import type { CurrencyType } from "~/types"
import {
  TODAY_INCOME_ESTIMATE_STATUS,
  type DailyBalanceHistoryStore,
} from "~/types/dailyBalanceHistory"

interface DailyBalanceHistoryCoverage {
  totalAccounts: number
  snapshotAccounts: number
  cashflowAccounts: number
  incomeAccounts: number
  outcomeAccounts: number
  estimatedIncomeAccounts: number
}

type ExchangeRateLookup = Record<string, number> | Map<string, number>

/**
 * Checks whether a nullable history metric is a trustworthy numeric value.
 */
function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value)
}

export type DailyBalanceHistoryMetric =
  | "balance"
  | "income"
  | "estimatedIncome"
  | "outcome"
  | "net"

interface PerAccountDailyBalanceMoneySeries {
  balance: Array<number | null>
  income: Array<number | null>
  estimatedIncome: Array<number | null>
  outcome: Array<number | null>
  net: Array<number | null>
}

interface AccountRangeSummary {
  accountId: string
  startBalance: number | null
  endBalance: number | null
  incomeTotal: number | null
  estimatedIncomeTotal: number | null
  outcomeTotal: number | null
  netTotal: number | null
  snapshotDays: number
  cashflowDays: number
  incomeDays: number
  outcomeDays: number
  estimatedIncomeDays: number
  totalDays: number
}

/**
 * Resolves the applicable exchange rate.
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
    : DEFAULT_USD_TO_CNY_RATE
}

/**
 * Builds the minimal account shape required by the today-income estimate helper.
 */
function buildEstimateAccount(params: {
  accountId: string
  manualBalanceAccountIds?: Set<string>
}): {
  id: string
  manualBalanceUsd?: string
} {
  const { accountId, manualBalanceAccountIds } = params

  return {
    id: accountId,
    manualBalanceUsd:
      manualBalanceAccountIds?.has(accountId) === true ? "manual" : undefined,
  }
}

/**
 * Converts a quota-unit value into the requested chart currency.
 */
function convertQuotaToSelectedMoney(params: {
  quota: number
  conversionFactor: number
  exchangeRate: number
}): number {
  const { quota, conversionFactor, exchangeRate } = params

  return (quota / conversionFactor) * exchangeRate
}

/**
 * Build per-account (non-aggregated) daily series, returning values in the requested currency.
 *
 * Missing snapshots are treated as per-account gaps and do not prevent other
 * accounts' series from rendering.
 */
export function buildPerAccountDailyBalanceMoneySeries(params: {
  store: DailyBalanceHistoryStore | null
  accountIds: string[]
  startDayKey: string
  endDayKey: string
  currencyType: CurrencyType
  exchangeRateByAccountId?: ExchangeRateLookup
  estimatedTodayIncomeEnabled?: boolean
  manualBalanceAccountIds?: Set<string>
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
    estimatedTodayIncomeEnabled = false,
    manualBalanceAccountIds,
  } = params

  const dayKeys = listDayKeysInRange({ startDayKey, endDayKey })
  const totalAccounts = accountIds.length

  const coverageByDay: DailyBalanceHistoryCoverage[] = dayKeys.map(() => ({
    totalAccounts,
    snapshotAccounts: 0,
    cashflowAccounts: 0,
    incomeAccounts: 0,
    outcomeAccounts: 0,
    estimatedIncomeAccounts: 0,
  }))

  const seriesByAccountId: Record<string, PerAccountDailyBalanceMoneySeries> =
    {}

  if (totalAccounts === 0 || dayKeys.length === 0) {
    return { dayKeys, seriesByAccountId, coverageByDay }
  }

  const conversionFactor = QUOTA_PER_USD

  for (const accountId of accountIds) {
    const exchangeRate = resolveExchangeRate({
      accountId,
      currencyType,
      exchangeRateByAccountId,
    })

    const balance = dayKeys.map(() => null) as Array<number | null>
    const income = dayKeys.map(() => null) as Array<number | null>
    const estimatedIncome = dayKeys.map(() => null) as Array<number | null>
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

        const reportedIncome = snapshot.today_income
        const reportedOutcome = snapshot.today_quota_consumption
        const hasIncome = isFiniteNumber(reportedIncome)
        const hasOutcome = isFiniteNumber(reportedOutcome)

        if (hasIncome) {
          coverageByDay[index].incomeAccounts += 1
          income[index] = (reportedIncome / conversionFactor) * exchangeRate
        }
        if (hasOutcome) {
          coverageByDay[index].outcomeAccounts += 1
          outcome[index] = (reportedOutcome / conversionFactor) * exchangeRate
        }
        if (hasIncome && hasOutcome) {
          coverageByDay[index].cashflowAccounts += 1
          net[index] =
            ((reportedIncome - reportedOutcome) / conversionFactor) *
            exchangeRate
        }
      }
    }

    if (estimatedTodayIncomeEnabled) {
      for (let index = 0; index < dayKeys.length; index += 1) {
        const estimate = estimateTodayIncomeForAccount({
          enabled: true,
          store,
          account: buildEstimateAccount({ accountId, manualBalanceAccountIds }),
          currentDayKey: dayKeys[index],
        })

        if (
          estimate.status !== TODAY_INCOME_ESTIMATE_STATUS.available ||
          estimate.estimatedTodayIncome === null
        ) {
          continue
        }

        estimatedIncome[index] = convertQuotaToSelectedMoney({
          quota: estimate.estimatedTodayIncome,
          conversionFactor,
          exchangeRate,
        })
        coverageByDay[index].estimatedIncomeAccounts += 1
      }
    }

    seriesByAccountId[accountId] = {
      balance,
      income,
      estimatedIncome,
      outcome,
      net,
    }
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
  estimatedTodayIncomeEnabled?: boolean
  manualBalanceAccountIds?: Set<string>
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
    estimatedTodayIncomeEnabled = false,
    manualBalanceAccountIds,
  } = params

  const dayKeys = listDayKeysInRange({ startDayKey, endDayKey })
  const totalDays = dayKeys.length

  if (accountIds.length === 0 || totalDays === 0) {
    return { dayKeys, summaries: [] }
  }

  const conversionFactor = QUOTA_PER_USD

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
    let incomeDays = 0
    let outcomeDays = 0
    let estimatedIncomeDays = 0
    let incomeSum = 0
    let estimatedIncomeSum = 0
    let outcomeSum = 0
    let netSum = 0

    for (const dayKey of dayKeys) {
      if (perDay) {
        const snapshot = perDay[dayKey]
        if (snapshot) {
          snapshotDays += 1

          const incomeValue = snapshot.today_income
          const outcomeValue = snapshot.today_quota_consumption
          const hasIncome = isFiniteNumber(incomeValue)
          const hasOutcome = isFiniteNumber(outcomeValue)

          if (hasIncome) {
            incomeDays += 1
            incomeSum += (incomeValue / conversionFactor) * exchangeRate
          }
          if (hasOutcome) {
            outcomeDays += 1
            outcomeSum += (outcomeValue / conversionFactor) * exchangeRate
          }
          if (hasIncome && hasOutcome) {
            cashflowDays += 1
            netSum +=
              ((incomeValue - outcomeValue) / conversionFactor) * exchangeRate
          }
        }
      }

      if (estimatedTodayIncomeEnabled) {
        const estimate = estimateTodayIncomeForAccount({
          enabled: true,
          store,
          account: buildEstimateAccount({ accountId, manualBalanceAccountIds }),
          currentDayKey: dayKey,
        })

        if (
          estimate.status !== TODAY_INCOME_ESTIMATE_STATUS.available ||
          estimate.estimatedTodayIncome === null
        ) {
          continue
        }

        estimatedIncomeDays += 1
        estimatedIncomeSum += convertQuotaToSelectedMoney({
          quota: estimate.estimatedTodayIncome,
          conversionFactor,
          exchangeRate,
        })
      }
    }

    const incomeTotal = incomeDays > 0 ? incomeSum : null
    const estimatedIncomeTotal =
      estimatedIncomeDays > 0 ? estimatedIncomeSum : null
    const outcomeTotal = outcomeDays > 0 ? outcomeSum : null
    const netTotal = cashflowDays > 0 ? netSum : null

    summaries.push({
      accountId,
      startBalance,
      endBalance,
      incomeTotal,
      estimatedIncomeTotal,
      outcomeTotal,
      netTotal,
      snapshotDays,
      cashflowDays,
      incomeDays,
      outcomeDays,
      estimatedIncomeDays,
      totalDays,
    })
  }

  return { dayKeys, summaries }
}
