import type { TFunction } from "i18next"

import type { AccountMetricCoverage } from "~/types/accountTodayStats"

/** Keep partial and pending-refresh account counts consistent across financial details. */
export function formatAccountMetricCoverage(
  coverage: AccountMetricCoverage,
  t: TFunction,
  pendingRefresh = Boolean(coverage.legacyUnclassifiedCount),
): string {
  return t(
    pendingRefresh
      ? "account:todayMetricAvailability.coverageWithRefresh"
      : "account:todayMetricAvailability.coverage",
    {
      complete: coverage.completeCount,
      partial: coverage.partialCount,
      refresh: coverage.legacyUnclassifiedCount,
      eligible: coverage.eligibleCount,
    },
  )
}
