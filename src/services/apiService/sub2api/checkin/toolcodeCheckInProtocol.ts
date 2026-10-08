/** ToolCode protocol metadata shared by execution and read-only feedback. */
export const TOOLCODE_CHECK_IN_STATUS_ENDPOINT =
  "/api/v1/engagement/checkin/status"
export const TOOLCODE_DAILY_CHECK_IN_ENDPOINT = "/api/v1/engagement/checkin"

/** Resolve the growth center's browser timezone, falling back to UTC. */
export function resolveToolcodeCheckInTimezone(): string {
  let timezone = "UTC"
  try {
    timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC"
  } catch {
    /* Optional runtime timezone. */
  }
  return timezone
}

/** Build a status path from an explicit timezone without reading runtime state. */
export function createToolcodeCheckInStatusEndpoint(timezone: string): string {
  return `${TOOLCODE_CHECK_IN_STATUS_ENDPOINT}?timezone=${encodeURIComponent(timezone)}`
}
