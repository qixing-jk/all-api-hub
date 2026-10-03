/** Pure ToolCode protocol metadata shared by execution and read-only feedback. */
export const TOOLCODE_CHECK_IN_STATUS_ENDPOINT =
  "/api/v1/engagement/checkin/status"
export const TOOLCODE_DAILY_CHECK_IN_ENDPOINT = "/api/v1/engagement/checkin"

/** Match the growth center's browser timezone when reading today's status. */
export function createToolcodeCheckInStatusEndpoint(): string {
  let timezone = "UTC"
  try {
    timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC"
  } catch {
    /* Optional runtime timezone. */
  }
  return `${TOOLCODE_CHECK_IN_STATUS_ENDPOINT}?timezone=${encodeURIComponent(timezone)}`
}
