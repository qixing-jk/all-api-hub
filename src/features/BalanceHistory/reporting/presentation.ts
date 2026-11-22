import type { TFunction } from "i18next"

import {
  BALANCE_HISTORY_QUICK_RANGE_IDS,
  BALANCE_HISTORY_TREND_SERIES_SCOPES,
  type BalanceHistoryQuickRangeId,
  type BalanceHistoryTrendSeriesScope,
  type BalanceHistoryVisibleMetric,
} from "~/features/BalanceHistory/contracts"
import { DAILY_BALANCE_HISTORY_METRICS } from "~/services/history/dailyBalanceHistory/constants"
import { assertNever } from "~/utils/core/assert"

/** Return the localized label for a visible balance-history metric. */
export function getBalanceHistoryMetricLabel(
  t: TFunction,
  metric: BalanceHistoryVisibleMetric,
) {
  switch (metric) {
    case DAILY_BALANCE_HISTORY_METRICS.Balance:
      return t("balanceHistory:metrics.balance")
    case DAILY_BALANCE_HISTORY_METRICS.Income:
      return t("balanceHistory:metrics.income")
    case DAILY_BALANCE_HISTORY_METRICS.EstimatedIncome:
      return t("balanceHistory:metrics.estimatedIncome")
    case DAILY_BALANCE_HISTORY_METRICS.Outcome:
      return t("balanceHistory:metrics.outcome")
    case DAILY_BALANCE_HISTORY_METRICS.Net:
      return t("balanceHistory:metrics.net")
    default:
      return assertNever(metric, `Unexpected balance history metric: ${metric}`)
  }
}

/**
 * Returns the localized label for the current trend aggregation scope.
 */
export function getBalanceHistoryTrendScopeLabel(
  t: TFunction,
  scope: BalanceHistoryTrendSeriesScope,
) {
  switch (scope) {
    case BALANCE_HISTORY_TREND_SERIES_SCOPES.Accounts:
      return t("balanceHistory:trend.scopes.accounts")
    case BALANCE_HISTORY_TREND_SERIES_SCOPES.Total:
      return t("balanceHistory:trend.scopes.total")
    default:
      return assertNever(scope, `Unexpected trend scope: ${scope}`)
  }
}

/**
 * Returns the localized label for a preset date range chip.
 */
export function getBalanceHistoryQuickRangeLabel(
  t: TFunction,
  rangeId: BalanceHistoryQuickRangeId,
) {
  switch (rangeId) {
    case BALANCE_HISTORY_QUICK_RANGE_IDS.Days7:
      return t("balanceHistory:filters.quickRanges.7d")
    case BALANCE_HISTORY_QUICK_RANGE_IDS.Days30:
      return t("balanceHistory:filters.quickRanges.30d")
    case BALANCE_HISTORY_QUICK_RANGE_IDS.Days90:
      return t("balanceHistory:filters.quickRanges.90d")
    case BALANCE_HISTORY_QUICK_RANGE_IDS.Days180:
      return t("balanceHistory:filters.quickRanges.180d")
    case BALANCE_HISTORY_QUICK_RANGE_IDS.Days365:
      return t("balanceHistory:filters.quickRanges.365d")
    default:
      return assertNever(rangeId, `Unexpected quick range id: ${rangeId}`)
  }
}
