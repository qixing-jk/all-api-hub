export const CHATFLOWS_CHECK_IN_STATUS_ENDPOINT = "/api/checkin/status"
export const CHATFLOWS_CHECK_IN_ENDPOINT = "/api/checkin"

const DAY_MS = 24 * 60 * 60 * 1_000
const RESET_UTC_OFFSET_MS = 4 * 60 * 60 * 1_000

/** The native page defines periods at 12:00 Asia/Shanghai, i.e. 04:00 UTC. */
export function getChatflowsCheckInPeriod(timestamp: number) {
  return Math.floor((timestamp - RESET_UTC_OFFSET_MS) / DAY_MS)
}
