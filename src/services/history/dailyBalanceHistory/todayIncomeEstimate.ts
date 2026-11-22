import type { BalancePosition } from "~/services/amounts/balance"
import {
  BALANCE_ROLES,
  OBSERVATION_STATUSES,
} from "~/services/amounts/financialConstants"
import {
  compareFinancialHistorySnapshots,
  getFinancialSeriesKey,
} from "~/services/history/dailyBalanceHistory/identity"
import {
  estimateNetInflow,
  getSoleAccountBalance,
  NET_INFLOW_MAX_CLOCK_SKEW_MS,
  NET_INFLOW_STATUSES,
} from "~/services/history/dailyBalanceHistory/netInflow"
import type { SiteAccount } from "~/types"
import type {
  DailyBalanceHistoryStore,
  NetInflowEstimateItem,
  TodayIncomeEstimateResult,
  TodayIncomeEstimateStatus,
} from "~/types/dailyBalanceHistory"
import { TODAY_INCOME_ESTIMATE_STATUS } from "~/types/dailyBalanceHistory"
import {
  getDayKeyFromUnixSeconds,
  parseDayKey,
  subtractDaysFromDayKey,
} from "~/utils/core/dayKey"

type TodayIncomeEstimateAccount = Pick<
  SiteAccount,
  "id" | "manualBalanceUsd"
> & {
  account_info?: Pick<
    SiteAccount["account_info"],
    "balance" | "nativeBalance" | "balanceUnavailable"
  >
}

/** Keep old DTO numeric fields empty; unexplained changes never supplement income. */
function unavailable(
  status: TodayIncomeEstimateStatus,
): TodayIncomeEstimateResult {
  return {
    reportedTodayIncome: null,
    estimatedTodayIncome: null,
    compensation: null,
    estimates: [],
    status,
  }
}

/** Detects an explicit manual display selection. */
function hasManualBalance(
  account: Pick<SiteAccount, "manualBalanceUsd">,
): boolean {
  return (
    typeof account.manualBalanceUsd === "string" &&
    account.manualBalanceUsd.trim() !== ""
  )
}

/** Accepts a nearby observation on either side of midnight. */
function startsDay(
  position: BalancePosition,
  dayKey: string,
  timeZone: string,
): boolean {
  if (position.amount.status !== OBSERVATION_STATUSES.Known) return false
  const at = position.amount.observedAt
  return (
    getDayKeyFromUnixSeconds(
      (at + NET_INFLOW_MAX_CLOCK_SKEW_MS) / 1000,
      timeZone,
    ) === dayKey &&
    getDayKeyFromUnixSeconds(
      (at - NET_INFLOW_MAX_CLOCK_SKEW_MS) / 1000,
      timeZone,
    ) === subtractDaysFromDayKey(dayKey, 1)
  )
}

/** Estimates native net change only when balance and settled-use intervals prove today's coverage. */
export function estimateTodayIncomeForAccount(params: {
  enabled: boolean
  store: DailyBalanceHistoryStore | null
  account: TodayIncomeEstimateAccount
  currentDayKey: string
  timeZone?: string
  historyUnavailable?: boolean
}): TodayIncomeEstimateResult {
  const {
    enabled,
    store,
    account,
    currentDayKey,
    timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone,
    historyUnavailable = false,
  } = params
  if (!enabled) return unavailable(TODAY_INCOME_ESTIMATE_STATUS.disabled)
  if (hasManualBalance(account))
    return unavailable(TODAY_INCOME_ESTIMATE_STATUS.manualBalance)
  if (!parseDayKey(currentDayKey))
    return unavailable(TODAY_INCOME_ESTIMATE_STATUS.invalidEstimate)
  try {
    new Intl.DateTimeFormat("en", { timeZone })
  } catch {
    return unavailable(TODAY_INCOME_ESTIMATE_STATUS.invalidEstimate)
  }
  const entries = store?.financialSnapshotsByAccountId?.[account.id] ?? []
  const missingStatus = historyUnavailable
    ? TODAY_INCOME_ESTIMATE_STATUS.historyUnavailable
    : !entries.length && store?.referenceSnapshotsByAccountId[account.id]
      ? TODAY_INCOME_ESTIMATE_STATUS.legacy
      : TODAY_INCOME_ESTIMATE_STATUS.missingCurrentSnapshot
  const positions = account.account_info?.balance?.positions ?? []
  const soleAccountBalance = getSoleAccountBalance(positions)
  const allowAccountBalance =
    soleAccountBalance?.role === BALANCE_ROLES.Available
  const balances = allowAccountBalance
    ? [soleAccountBalance!]
    : positions.filter((position) => position.role === BALANCE_ROLES.Ledger)
  // A later acceptance may preserve an older observation; capturedAt alone is not its order.
  const newestFirst = [...entries]
    .sort(compareFinancialHistorySnapshots)
    .reverse()
  const estimates = balances.map((end): NetInflowEstimateItem => {
    const seriesKey = getFinancialSeriesKey(end)
    const item = (
      status: TodayIncomeEstimateStatus,
    ): NetInflowEstimateItem => ({
      seriesKey,
      position: end,
      status,
    })
    if (historyUnavailable) return item(missingStatus)
    if (
      end.amount.status !== OBSERVATION_STATUSES.Known ||
      getDayKeyFromUnixSeconds(end.amount.observedAt / 1000, timeZone) !==
        currentDayKey
    )
      return item(missingStatus)
    const currentAmount = end.amount
    const latest = newestFirst.find((entry) =>
      entry.balance?.positions.some(
        (position) =>
          getFinancialSeriesKey(position) === seriesKey &&
          position.amount.status === OBSERVATION_STATUSES.Known &&
          position.amount.observedAt === currentAmount.observedAt &&
          position.amount.value === currentAmount.value &&
          JSON.stringify(position.amount.source.inputs) ===
            JSON.stringify(currentAmount.source.inputs),
      ),
    )
    if (!latest) return item(missingStatus)
    let start: BalancePosition | undefined
    for (const entry of newestFirst.slice(newestFirst.indexOf(latest))) {
      // Reappearance starts a new series segment even when the upstream reuses its ID.
      if (entry.endedPositionKeys?.includes(seriesKey)) break
      if (
        allowAccountBalance &&
        entry.balance &&
        !getSoleAccountBalance(entry.balance.positions)
      )
        break
      start = entry.balance?.positions.find(
        (position) =>
          getFinancialSeriesKey(position) === seriesKey &&
          startsDay(position, currentDayKey, timeZone) &&
          position.amount.status === OBSERVATION_STATUSES.Known &&
          position.amount.observedAt < currentAmount.observedAt,
      )
      if (start) break
    }
    if (!start) return item(TODAY_INCOME_ESTIMATE_STATUS.missingBaseline)
    if (!latest.settledConsumption?.length)
      return item(TODAY_INCOME_ESTIMATE_STATUS.missingCashflow)
    const netInflow = estimateNetInflow({
      start,
      end,
      consumption: latest.settledConsumption,
      allowAccountBalance,
    })
    if (
      netInflow.status === NET_INFLOW_STATUSES.Available &&
      netInflow.window.timeZone !== timeZone
    )
      return item(TODAY_INCOME_ESTIMATE_STATUS.intervalMismatch)
    return {
      ...item(
        netInflow.status === NET_INFLOW_STATUSES.Available
          ? TODAY_INCOME_ESTIMATE_STATUS.available
          : TODAY_INCOME_ESTIMATE_STATUS.invalidEstimate,
      ),
      netInflow,
    }
  })
  return {
    ...unavailable(
      estimates.some(
        (item) => item.status === TODAY_INCOME_ESTIMATE_STATUS.available,
      )
        ? TODAY_INCOME_ESTIMATE_STATUS.available
        : (estimates[0]?.status ?? missingStatus),
    ),
    estimates,
  }
}
