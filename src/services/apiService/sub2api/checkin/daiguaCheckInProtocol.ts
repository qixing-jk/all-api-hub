export const DAIGUA_CHECK_IN_ENDPOINT = "/api/v1/checkin"
export const DAIGUA_CHECK_IN_STATUS_ENDPOINT = "/api/v1/checkin/status"

/** Build the native read-only route; the server owns the daily boundary. */
export function createDaiguaCheckInStatusEndpoint(timezone: string): string {
  return `${DAIGUA_CHECK_IN_STATUS_ENDPOINT}?timezone=${encodeURIComponent(timezone)}`
}

/** Use the native browser timezone with a safe fallback when unavailable. */
export function resolveDaiguaCheckInTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC"
  } catch {
    return "UTC"
  }
}
