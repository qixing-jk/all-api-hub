import { normalizeHistoryRetentionDays } from "~/services/history/retention"
import { DEFAULT_BALANCE_HISTORY_PREFERENCES } from "~/types/dailyBalanceHistory"

/**
 * Normalize balance-history retention without shortening valid saved periods.
 *
 * The UI may provide arbitrary input and older preference versions could contain invalid data.
 * Keeping this centralized prevents drift between UI and background scheduler behavior.
 */
export function clampBalanceHistoryRetentionDays(value: unknown): number {
  return normalizeHistoryRetentionDays(
    value,
    DEFAULT_BALANCE_HISTORY_PREFERENCES.retentionDays,
  )
}
