/** The native /check-in page uses the same route for status (GET) and claim (POST). */
export const LOXO_CHECK_IN_ENDPOINT = "/api/v1/user/check-in"

/** The native shared Axios interceptor appends the browser timezone to every GET. */
export function createLoxoCheckInStatusEndpoint(timezone: string): string {
  return `${LOXO_CHECK_IN_ENDPOINT}?timezone=${encodeURIComponent(timezone)}`
}
