/**
 * Pure route builders shared by execution and diagnostic feedback.
 *
 * The deployment's dashboard appends `?timezone=<IANA>` to every GET, so its
 * status read carries the reader's day boundary; keeping these free of transport
 * imports lets the registry and the feedback scanner use them without pulling
 * the API transport into those consumers.
 */
export const BAI_API_CHECK_IN_STATUS_ENDPOINT =
  "/api/v1/daily-rewards/checkin/status"
export const BAI_API_CHECK_IN_ENDPOINT = "/api/v1/daily-rewards/checkin"

/** Builds the read-only status path without reading runtime state. */
export function createBaiApiCheckInStatusEndpoint(timezone: string): string {
  return `${BAI_API_CHECK_IN_STATUS_ENDPOINT}?timezone=${encodeURIComponent(timezone)}`
}

/** Uses the same browser timezone fallback as sibling Sub2API methods. */
export { resolveUserCheckInTimezone as resolveBaiApiCheckInTimezone } from "./userCheckInProtocol"
