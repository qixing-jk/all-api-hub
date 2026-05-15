export const SETTINGS_SNAPSHOT_INTERVAL_MS = 3 * 24 * 60 * 60 * 1000

/**
 * Checks whether the three-day settings snapshot cadence has elapsed.
 */
export function shouldSendSettingsSnapshot(
  lastSentAt: number | undefined,
  now = Date.now(),
): boolean {
  if (typeof lastSentAt !== "number" || !Number.isFinite(lastSentAt)) {
    return true
  }
  return now - lastSentAt >= SETTINGS_SNAPSHOT_INTERVAL_MS
}
