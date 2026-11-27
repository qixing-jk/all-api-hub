export const LINXI_CHECK_IN_ENDPOINT = "/api/v1/check-in"
export const LINXI_CHECK_IN_STATUS_ENDPOINT = "/api/v1/check-in/status"
export const LINXI_DEFAULT_RESET_TIME_ZONE = "Asia/Shanghai"

/** Match the parser's fallback when the server honors the query but omits its timezone. */
export function linxiStatusRoute() {
  return `${LINXI_CHECK_IN_STATUS_ENDPOINT}?timezone=${encodeURIComponent(LINXI_DEFAULT_RESET_TIME_ZONE)}`
}
