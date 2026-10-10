/** Native Hiyo status and claim share a path, but only GET is read-only. */
export const HIYO_CHECK_IN_ENDPOINT = "/api/v1/checkin"

/** Match the native dashboard's GET timezone without coupling path construction. */
export function resolveHiyoCheckInTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC"
  } catch {
    return "UTC"
  }
}

/** Pure route builder shared by execution and diagnostic feedback. */
export function createHiyoCheckInStatusEndpoint(timezone: string): string {
  return `${HIYO_CHECK_IN_ENDPOINT}?timezone=${encodeURIComponent(timezone)}`
}
