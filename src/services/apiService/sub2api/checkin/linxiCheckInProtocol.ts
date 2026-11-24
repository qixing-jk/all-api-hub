import { resolveUserCheckInTimezone } from "./userCheckInProtocol"

export const LINXI_CHECK_IN_ENDPOINT = "/api/v1/check-in"
export const LINXI_CHECK_IN_STATUS_ENDPOINT = "/api/v1/check-in/status"

/** Both native dashboards append their browser timezone to status GETs. */
export function linxiStatusRoute(timezone = resolveUserCheckInTimezone()) {
  return `${LINXI_CHECK_IN_STATUS_ENDPOINT}?timezone=${encodeURIComponent(timezone)}`
}
