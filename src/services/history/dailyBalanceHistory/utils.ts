import { DEFAULT_BALANCE_HISTORY_PREFERENCES } from "~/types/dailyBalanceHistory"

/**
 * Clamp balance-history retention days to a safe integer range.
 *
 * The UI may provide arbitrary input and older preference versions could contain invalid data.
 * Keeping this centralized prevents drift between UI and background scheduler behavior.
 */
export function clampBalanceHistoryRetentionDays(value: unknown): number {
  const parsed = Number(value)
  if (!Number.isFinite(parsed))
    return DEFAULT_BALANCE_HISTORY_PREFERENCES.retentionDays
  return Math.min(3650, Math.max(1, Math.trunc(parsed)))
}
