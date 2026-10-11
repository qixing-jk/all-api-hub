/** Shared paths for the Clawhud and Genius Programmer user check-in contracts. */
export const USER_CHECK_IN_STATUS_ENDPOINT = "/api/v1/user/checkin/status"

/** Resolve the native dashboard timezone independently of path construction. */
export function resolveUserCheckInTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC"
  } catch {
    return "UTC"
  }
}

/** Build the read-only status path without reading runtime state. */
export function createUserCheckInStatusEndpoint(timezone: string): string {
  return `${USER_CHECK_IN_STATUS_ENDPOINT}?timezone=${encodeURIComponent(timezone)}`
}
