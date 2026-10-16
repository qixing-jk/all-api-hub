/**
 * Shared read/write path; only the GET carries the dashboard's timezone.
 *
 * `CheckInView` loads the status with GET and claims the reward with POST on
 * this one path, unlike the Clawhud sibling whose read lives on
 * `/api/v1/user/checkin/status`.
 */
export const FREE_API_CHECK_IN_ENDPOINT = "/api/v1/user/checkin"

/** Resolve the native dashboard timezone independently of path construction. */
export function resolveFreeApiCheckInTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC"
  } catch {
    return "UTC"
  }
}

/** Pure route builder shared by execution and diagnostic feedback. */
export function createFreeApiDailyCheckInStatusEndpoint(
  timezone: string,
): string {
  return `${FREE_API_CHECK_IN_ENDPOINT}?timezone=${encodeURIComponent(timezone)}`
}
