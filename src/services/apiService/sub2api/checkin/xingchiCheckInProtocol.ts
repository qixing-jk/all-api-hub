/** The native Xingchi dashboard reads and claims on this path. */
export const XINGCHI_CHECK_IN_ENDPOINT = "/api/v1/user/checkin"

export { resolveUserCheckInTimezone as resolveXingchiCheckInTimezone } from "./userCheckInProtocol"

/** Its shared request interceptor supplies the browser timezone for GETs. */
export function createXingchiDailyCheckInStatusEndpoint(
  timezone: string,
): string {
  return `${XINGCHI_CHECK_IN_ENDPOINT}?timezone=${encodeURIComponent(timezone)}`
}
