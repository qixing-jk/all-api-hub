import type { TFunction } from "i18next"

import {
  type BalanceHistoryQuickRangeId,
  type BalanceHistoryTrendSeriesScope,
  type BalanceHistoryVisibleMetric,
} from "~/features/BalanceHistory/contracts"
import { assertNever } from "~/utils/core/assert"

/** Return the localized label for a visible balance-history metric. */
export function getBalanceHistoryMetricLabel(
  t: TFunction,
  metric: BalanceHistoryVisibleMetric,
) {
  switch (metric) {
    case "balance":
      return t("balanceHistory:metrics.balance")
    case "income":
      return t("balanceHistory:metrics.income")
    case "estimatedIncome":
      return t("balanceHistory:metrics.estimatedIncome")
    case "outcome":
      return t("balanceHistory:metrics.outcome")
    case "net":
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
    case "accounts":
      return t("balanceHistory:trend.scopes.accounts")
    case "total":
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
    case "7d":
      return t("balanceHistory:filters.quickRanges.7d")
    case "30d":
      return t("balanceHistory:filters.quickRanges.30d")
    case "90d":
      return t("balanceHistory:filters.quickRanges.90d")
    case "180d":
      return t("balanceHistory:filters.quickRanges.180d")
    case "365d":
      return t("balanceHistory:filters.quickRanges.365d")
    default:
      return assertNever(rangeId, `Unexpected quick range id: ${rangeId}`)
  }
}
