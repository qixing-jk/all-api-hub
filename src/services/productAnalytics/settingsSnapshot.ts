export const SETTINGS_SNAPSHOT_INTERVAL_MS = 3 * 24 * 60 * 60 * 1000

/** Snapshot name for the automatic-bypass master, not a total bypass kill switch. */
export const SETTINGS_SNAPSHOT_AUTOMATIC_BYPASS_ENABLED_PROPERTY =
  "temp_window_fallback_automatic_bypass_enabled" as const

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
