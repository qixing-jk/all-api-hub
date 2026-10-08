import { isAccountTodayMetricAvailable } from "~/services/accounts/accountTodayStats"
import type { AccountMetricCoverage } from "~/types"

interface UsagePercentShareOptions {
  todayCoverage?: AccountMetricCoverage
  hasTotalData?: boolean
}

/**
 * Calculates today's bounded share of a recent usage total.
 */
export function getUsagePercentShare(
  today: number,
  total: number,
  options: UsagePercentShareOptions = {},
): number | null {
  if (options.hasTotalData === false) {
    return null
  }
  if (
    options.todayCoverage &&
    !isAccountTodayMetricAvailable(options.todayCoverage)
  ) {
    return null
  }
  if (!Number.isFinite(today) || !Number.isFinite(total) || total <= 0) {
    return 0
  }

  return Math.min(100, Math.max(0, Math.round((today / total) * 100)))
}
