import { UI_CONSTANTS } from "~/constants/ui"
import { subtractDaysFromDayKey } from "~/services/history/dailyBalanceHistory/dayKeys"
import type { CurrencyAmount, SiteAccount } from "~/types"
import type {
  DailyBalanceHistoryStore,
  TodayIncomeEstimateResult,
} from "~/types/dailyBalanceHistory"
import { TODAY_INCOME_ESTIMATE_STATUS } from "~/types/dailyBalanceHistory"

type TodayIncomeEstimateAccount = Pick<SiteAccount, "id" | "manualBalanceUsd">

type TodayIncomeMoneyTotalsAccount = Pick<
  SiteAccount,
  "id" | "manualBalanceUsd" | "exchange_rate"
>

const NULL_RESULT_BY_STATUS = {
  disabled: {
    reportedTodayIncome: null,
    estimatedTodayIncome: null,
    compensation: null,
    status: TODAY_INCOME_ESTIMATE_STATUS.disabled,
  },
  missing_current_snapshot: {
    reportedTodayIncome: null,
    estimatedTodayIncome: null,
    compensation: null,
    status: TODAY_INCOME_ESTIMATE_STATUS.missingCurrentSnapshot,
  },
  manual_balance: {
    reportedTodayIncome: null,
    estimatedTodayIncome: null,
    compensation: null,
    status: TODAY_INCOME_ESTIMATE_STATUS.manualBalance,
  },
} as const satisfies Record<string, TodayIncomeEstimateResult>

/**
 * Detects accounts whose balance is user-entered rather than snapshot-derived.
 */
export function hasManualBalance(
  account: Pick<SiteAccount, "manualBalanceUsd">,
): boolean {
  return (
    typeof account.manualBalanceUsd === "string" &&
    account.manualBalanceUsd.trim() !== ""
  )
}

/**
 * Estimates today's income from today's snapshot and exactly yesterday's baseline.
 */
export function estimateTodayIncomeForAccount(params: {
  enabled: boolean
  store: DailyBalanceHistoryStore | null
  account: TodayIncomeEstimateAccount
  currentDayKey: string
}): TodayIncomeEstimateResult {
  const { enabled, store, account, currentDayKey } = params

  if (!enabled) return NULL_RESULT_BY_STATUS.disabled
  if (hasManualBalance(account)) return NULL_RESULT_BY_STATUS.manual_balance

  const currentSnapshot =
    store?.snapshotsByAccountId[account.id]?.[currentDayKey]
  if (!currentSnapshot) return NULL_RESULT_BY_STATUS.missing_current_snapshot

  const reportedTodayIncome = Number.isFinite(currentSnapshot.today_income)
    ? currentSnapshot.today_income
    : null

  const previousDayKey = subtractDaysFromDayKey(currentDayKey, 1)
  const previousDayBaseline =
    store?.snapshotsByAccountId[account.id]?.[previousDayKey]
  if (!previousDayBaseline) {
    return {
      reportedTodayIncome,
      estimatedTodayIncome: null,
      compensation: null,
      status: TODAY_INCOME_ESTIMATE_STATUS.missingBaseline,
    }
  }

  if (typeof currentSnapshot.today_quota_consumption !== "number") {
    return {
      reportedTodayIncome,
      estimatedTodayIncome: null,
      compensation: null,
      status: TODAY_INCOME_ESTIMATE_STATUS.missingCashflow,
    }
  }

  const estimatedTodayIncome =
    currentSnapshot.quota -
    previousDayBaseline.quota +
    currentSnapshot.today_quota_consumption

  if (!Number.isFinite(estimatedTodayIncome) || estimatedTodayIncome < 0) {
    return {
      reportedTodayIncome,
      estimatedTodayIncome: null,
      compensation: null,
      status: TODAY_INCOME_ESTIMATE_STATUS.invalidEstimate,
    }
  }

  return {
    reportedTodayIncome,
    estimatedTodayIncome,
    compensation:
      reportedTodayIncome === null
        ? null
        : estimatedTodayIncome - reportedTodayIncome,
    status: TODAY_INCOME_ESTIMATE_STATUS.available,
  }
}

/**
 * Converts raw quota units into both supported money totals.
 */
export function convertQuotaToMoney(params: {
  quota: number
  exchangeRate: number
}): CurrencyAmount {
  const usd = params.quota / UI_CONSTANTS.EXCHANGE_RATE.CONVERSION_FACTOR
  return {
    USD: usd,
    CNY: usd * params.exchangeRate,
  }
}

/**
 * Builds aggregate reported and estimated today-income money totals.
 */
export function buildEstimatedTodayIncomeMoneyTotals(params: {
  enabled: boolean
  store: DailyBalanceHistoryStore | null
  accounts: TodayIncomeMoneyTotalsAccount[]
  currentDayKey: string
}): {
  trusted: CurrencyAmount
  estimated: CurrencyAmount | null
  availableAccounts: number
  totalAccounts: number
} {
  const { enabled, store, accounts, currentDayKey } = params
  const trusted = { USD: 0, CNY: 0 }
  const estimated = { USD: 0, CNY: 0 }
  let availableAccounts = 0

  for (const account of accounts) {
    const result = estimateTodayIncomeForAccount({
      enabled,
      store,
      account,
      currentDayKey,
    })

    if (result.reportedTodayIncome !== null) {
      const trustedMoney = convertQuotaToMoney({
        quota: result.reportedTodayIncome,
        exchangeRate: account.exchange_rate,
      })
      trusted.USD += trustedMoney.USD
      trusted.CNY += trustedMoney.CNY
    }

    if (
      result.status !== TODAY_INCOME_ESTIMATE_STATUS.available ||
      result.estimatedTodayIncome === null
    ) {
      continue
    }

    const estimatedMoney = convertQuotaToMoney({
      quota: result.estimatedTodayIncome,
      exchangeRate: account.exchange_rate,
    })
    estimated.USD += estimatedMoney.USD
    estimated.CNY += estimatedMoney.CNY
    availableAccounts += 1
  }

  return {
    trusted,
    estimated: availableAccounts > 0 ? estimated : null,
    availableAccounts,
    totalAccounts: accounts.length,
  }
}
