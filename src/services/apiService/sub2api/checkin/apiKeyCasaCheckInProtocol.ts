import { resolveUserCheckInTimezone } from "~/services/apiService/sub2api/checkin/userCheckInProtocol"

export const API_KEY_CASA_DAILY_CHECK_IN_ENDPOINT = "/api/v1/redeem/checkin"

/**
 * The redeem view calls `/redeem/checkin`; the shared API client adds its
 * `/api/v1` base path and appends the browser timezone to GET requests.
 * Source: https://apikey.casa/assets/index-D-5aWW75.js and
 * https://apikey.casa/assets/RedeemView-BnsB1fCw.js (2026-11-23).
 */
export function createApiKeyCasaDailyCheckInStatusEndpoint(
  timezone = resolveUserCheckInTimezone(),
): string {
  return `${API_KEY_CASA_DAILY_CHECK_IN_ENDPOINT}?timezone=${encodeURIComponent(timezone)}`
}
