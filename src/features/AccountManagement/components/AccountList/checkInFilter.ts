import { getDayKeyFromUnixSeconds } from "~/services/history/usageHistory/core"
import type { DisplaySiteData } from "~/types"

export type AccountCheckInFilterValue =
  | "checked-in"
  | "not-checked-in"
  | "outdated"
  | "unsupported"

export const ACCOUNT_CHECK_IN_FILTER_OPTION_ORDER: AccountCheckInFilterValue[] =
  ["checked-in", "not-checked-in", "outdated", "unsupported"]

/**
 * Checks whether a persisted site check-in detection timestamp belongs to today.
 */
function isCheckInStatusDetectedToday(detectedAt?: number): boolean {
  if (typeof detectedAt !== "number" || !Number.isFinite(detectedAt)) {
    return false
  }

  const todayKey = getDayKeyFromUnixSeconds(Math.floor(Date.now() / 1000))
  const detectedKey = getDayKeyFromUnixSeconds(Math.floor(detectedAt / 1000))
  return detectedKey === todayKey
}

/**
 * Maps combined site/custom check-in state into one stable filter bucket.
 */
export function getAccountCheckInFilterValue(
  account: DisplaySiteData,
): AccountCheckInFilterValue {
  const hasCustomCheckIn =
    typeof account.checkIn?.customCheckIn?.url === "string" &&
    account.checkIn.customCheckIn.url.trim() !== ""
  const siteCheckInEnabled = account.checkIn?.enableDetection === true
  const siteCheckedInToday = account.checkIn?.siteStatus?.isCheckedInToday
  const siteStatusKnown = typeof siteCheckedInToday === "boolean"
  const siteStatusOutdated =
    siteCheckInEnabled &&
    siteStatusKnown &&
    !isCheckInStatusDetectedToday(account.checkIn?.siteStatus?.lastDetectedAt)
  const customCheckedIn =
    account.checkIn?.customCheckIn?.isCheckedInToday === true

  if (siteStatusOutdated) {
    return "outdated"
  }

  // Detection can be disabled, or enabled without any detected status yet.
  // Both states are unsupported when there is no custom check-in fallback.
  if (!siteCheckInEnabled && !hasCustomCheckIn) {
    return "unsupported"
  }

  if (!siteStatusKnown && !hasCustomCheckIn) {
    return "unsupported"
  }

  const siteFlowChecked = !siteStatusKnown || siteCheckedInToday === true
  const customFlowChecked = !hasCustomCheckIn || customCheckedIn

  return siteFlowChecked && customFlowChecked ? "checked-in" : "not-checked-in"
}
