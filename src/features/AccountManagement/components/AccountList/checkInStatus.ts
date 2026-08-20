import { getDayKeyFromUnixSeconds } from "~/services/history/usageHistory/core"

/** Returns whether a persisted check-in detection belongs to the current local day. */
export function isCheckInStatusDetectedToday(detectedAt?: number): boolean {
  if (typeof detectedAt !== "number" || !Number.isFinite(detectedAt)) {
    return false
  }

  const todayKey = getDayKeyFromUnixSeconds(Math.floor(Date.now() / 1000))
  const detectedKey = getDayKeyFromUnixSeconds(Math.floor(detectedAt / 1000))
  return detectedKey === todayKey
}
