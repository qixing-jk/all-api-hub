import { CURRENCIES, QUOTA_PER_USD } from "~/constants/money"
import { isAccountTodayMetricComplete } from "~/services/accounts/metrics/accountTodayStats"
import {
  BALANCE_PURPOSES,
  getDisplayBalancePositions,
  projectBalance,
} from "~/services/accounts/metrics/balanceProjection"
import {
  getDisplayConsumptionProjection,
  getDisplayIncomeProjection,
} from "~/services/accounts/metrics/consumptionProjection"
import { supportsMonetaryBalance } from "~/services/accounts/metrics/monetaryBalancePolicy"
import {
  ASSET_KINDS,
  BALANCE_ROLES,
} from "~/services/amounts/financialConstants"
import type {
  AccountNativeBalance,
  AccountTodayStatsAvailability,
  SiteAccount,
} from "~/types"
import { ACCOUNT_TODAY_METRIC_STATUSES } from "~/types/accountTodayStats"
import type {
  BalanceHistoryPreferences,
  DailyBalanceHistoryCaptureSource,
  DailyBalanceSnapshot,
} from "~/types/dailyBalanceHistory"
import { DEFAULT_BALANCE_HISTORY_PREFERENCES } from "~/types/dailyBalanceHistory"
import { getDayKeyFromUnixSeconds } from "~/utils/core/dayKey"
import { getErrorMessage } from "~/utils/core/error"
import { createLogger } from "~/utils/core/logger"

import { dailyBalanceHistoryStorage } from "./storage"

const logger = createLogger("DailyBalanceHistoryCapture")

/**
 * Best-effort snapshot upsert used by refresh-driven and alarm-driven capture.
 *
 * Cashflow fields are stored independently only when their refreshed metric is
 * complete, avoiding placeholder or partial values in historical estimates.
 */
export async function maybeCaptureDailyBalanceSnapshot(params: {
  config?: BalanceHistoryPreferences
  accountId: string
  quota: number
  nativeBalance?: AccountNativeBalance
  balanceUnavailable?: boolean
  today_income: number
  today_quota_consumption: number
  todayStatsAvailability: AccountTodayStatsAvailability
  source: DailyBalanceHistoryCaptureSource
  capturedAtMs?: number
  timeZone?: string
}): Promise<boolean> {
  const config = params.config ?? DEFAULT_BALANCE_HISTORY_PREFERENCES
  if (
    !config.enabled ||
    !supportsMonetaryBalance(params.nativeBalance, params.balanceUnavailable)
  ) {
    return false
  }

  const capturedAtMs =
    typeof params.capturedAtMs === "number" &&
    Number.isFinite(params.capturedAtMs)
      ? params.capturedAtMs
      : Date.now()

  const dayKey = getDayKeyFromUnixSeconds(
    Math.floor(capturedAtMs / 1000),
    params.timeZone,
  )

  const snapshot: DailyBalanceSnapshot = {
    quota: params.quota,
    today_income: isAccountTodayMetricComplete(
      params.todayStatsAvailability.income,
    )
      ? params.today_income
      : null,
    today_quota_consumption: isAccountTodayMetricComplete(
      params.todayStatsAvailability.consumption,
    )
      ? params.today_quota_consumption
      : null,
    capturedAt: capturedAtMs,
    source: params.source,
  }

  try {
    return await dailyBalanceHistoryStorage.upsertSnapshot({
      accountId: params.accountId,
      dayKey,
      snapshot,
      retentionDays: config.retentionDays,
      timeZone: params.timeZone,
    })
  } catch (error) {
    logger.error(
      `Failed to upsert daily balance snapshot (accountId=${params.accountId}, dayKey=${dayKey})`,
      getErrorMessage(error),
    )
    return false
  }
}

/** Keep the existing history series populated from fresh, compatible USD observations. */
export async function maybeCaptureAccountReferenceBalance({
  config,
  account,
  source,
  asOf = Date.now(),
}: {
  config?: BalanceHistoryPreferences
  account: SiteAccount
  source: DailyBalanceHistoryCaptureSource
  asOf?: number
}): Promise<boolean> {
  if (!(config ?? DEFAULT_BALANCE_HISTORY_PREFERENCES).enabled) return false
  const info = account.account_info
  if (!info.balance) return false
  // Unreadable independent wallets still identify separate balances.
  if (
    getDisplayBalancePositions(info.balance).filter(
      (position) => position.role !== BALANCE_ROLES.Allowance,
    ).length !== 1
  )
    return false
  const { amounts, conflicts, positions } = projectBalance(
    info.balance,
    BALANCE_PURPOSES.Available,
    asOf,
  )
  const [balance] = amounts
  if (
    positions.length !== 1 ||
    amounts.length !== 1 ||
    conflicts.length ||
    balance?.asset.kind !== ASSET_KINDS.Currency ||
    balance.asset.code !== CURRENCIES.USD
  )
    return false
  const quota = Number(balance.value) * QUOTA_PER_USD
  if (!Number.isFinite(quota)) return false
  const display = {
    id: account.id,
    exchangeRate: account.exchange_rate,
    disabled: account.disabled,
    excludeFromTodayIncome: false,
    settledConsumption: info.settledConsumption,
    reportedIncome: info.reportedIncome,
    todayStatsAvailability: info.todayStatsAvailability,
  }
  const spending = getDisplayConsumptionProjection([display], asOf)
  const income = getDisplayIncomeProjection([display], asOf)
  const consumptionQuota = spending.amount.USD * QUOTA_PER_USD
  const incomeQuota = income.amount.USD * QUOTA_PER_USD
  const consumption = Number.isFinite(consumptionQuota)
    ? spending.coverageByCurrency.USD.status
    : ACCOUNT_TODAY_METRIC_STATUSES.Unavailable
  const received = Number.isFinite(incomeQuota)
    ? income.coverageByCurrency.USD.status
    : ACCOUNT_TODAY_METRIC_STATUSES.Unavailable
  const unavailable = {
    status: ACCOUNT_TODAY_METRIC_STATUSES.Unavailable,
  } as const
  return maybeCaptureDailyBalanceSnapshot({
    config,
    accountId: account.id,
    quota,
    today_income: incomeQuota,
    today_quota_consumption: consumptionQuota,
    todayStatsAvailability: {
      consumption: { status: consumption },
      income: { status: received },
      requests: unavailable,
      tokens: unavailable,
    },
    capturedAtMs: asOf,
    source,
  })
}
