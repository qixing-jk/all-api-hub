/** Keep the user's retention period within the safe integer range. */
export function normalizeHistoryRetentionDays(
  value: unknown,
  defaultDays: number,
): number {
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) return defaultDays
  return Math.min(Number.MAX_SAFE_INTEGER, Math.max(1, Math.trunc(parsed)))
}

/**
 * Calculate a retention cutoff without overflowing Date for very long periods.
 * Nonnegative Unix timestamps can fall on the day before the epoch in local time.
 * UTC arithmetic on day keys preserves calendar days across timezone changes.
 */
export function getHistoryRetentionCutoffDayKey(
  todayKey: string,
  retentionDays: number,
): string {
  const days = normalizeHistoryRetentionDays(retentionDays, 1)
  const today = Date.parse(`${todayKey}T00:00:00.000Z`)
  const cutoff = Math.max(-86_400_000, today - (days - 1) * 86_400_000)
  return new Date(cutoff).toISOString().slice(0, 10)
}
