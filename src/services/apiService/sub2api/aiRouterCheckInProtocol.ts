/** Pure protocol metadata shared by execution and read-only feedback. */
export const AI_ROUTER_DAILY_CHECK_IN_ENDPOINT = "/api/v1/user/daily-checkin"

/**
 * The deployment scopes a check-in to a calendar day, and its own dashboard
 * sends the browser timezone on every GET so the server resolves `checkin_date`
 * the same way the user sees it.
 */
export const createAiRouterCheckInStatusEndpoint = (): string => {
  let timezone = "UTC"
  try {
    timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC"
  } catch {
    // A runtime without timezone data keeps the UTC fallback.
  }
  return `${AI_ROUTER_DAILY_CHECK_IN_ENDPOINT}?timezone=${encodeURIComponent(timezone)}`
}
