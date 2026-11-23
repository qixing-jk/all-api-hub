export const CHATFLOWS_CHECK_IN_STATUS_ENDPOINT = "/api/checkin/status"
export const CHATFLOWS_CHECK_IN_ENDPOINT = "/api/checkin"

const DAY_MS = 24 * 60 * 60 * 1_000
const RESET_UTC_OFFSET_MS = 4 * 60 * 60 * 1_000

/** The native page defines periods at 12:00 Asia/Shanghai, i.e. 04:00 UTC. */
export function getChatflowsCheckInPeriod(timestamp: number) {
  return Math.floor((timestamp - RESET_UTC_OFFSET_MS) / DAY_MS)
}

/** The period is named for its opening Beijing date and ends at the next noon. */
export function getChatflowsCheckInPeriodBounds(timestamp: number) {
  const period = getChatflowsCheckInPeriod(timestamp)
  return {
    periodKey: new Date(period * DAY_MS).toISOString().slice(0, 10),
    nextResetAt: (period + 1) * DAY_MS + RESET_UTC_OFFSET_MS,
  }
}
