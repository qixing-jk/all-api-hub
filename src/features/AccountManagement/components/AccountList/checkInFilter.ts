import {
  CHECK_IN_METHOD_STATUS_EVIDENCE_SOURCES,
  CHECK_IN_METHOD_STATUS_OUTCOMES,
  CHECK_IN_METHOD_TODAY_STATUSES,
  CHECK_IN_SELECTION_STATUSES,
} from "~/constants/checkIn"
import {
  getSelectedCheckInStatus,
  inspectAccountCheckIn,
} from "~/services/checkin/autoCheckin/inspection"
import { getDayKeyFromUnixSeconds } from "~/services/history/usageHistory/core"
import type { DisplaySiteData } from "~/types"

import { isCheckInStatusDetectedToday } from "./checkInStatus"

export type AccountCheckInFilterValue =
  | "checked-in"
  | "not-checked-in"
  | "outdated"
  | "status-unavailable"
  | "unsupported"

export const ACCOUNT_CHECK_IN_FILTER_OPTION_ORDER: AccountCheckInFilterValue[] =
  [
    "checked-in",
    "not-checked-in",
    "outdated",
    "status-unavailable",
    "unsupported",
  ]

/** Returns whether the selected method status was observed for the current day. */
export function isSelectedCheckInStatusCurrent(
  account: Pick<DisplaySiteData, "checkIn" | "siteType">,
): boolean {
  const status = getSelectedCheckInStatus({
    config: account.checkIn,
    siteType: account.siteType,
  })
  if (!status || status.outcome !== CHECK_IN_METHOD_STATUS_OUTCOMES.Known) {
    return false
  }

  if (
    status.evidence.source === CHECK_IN_METHOD_STATUS_EVIDENCE_SOURCES.Probe ||
    status.evidence.source === CHECK_IN_METHOD_STATUS_EVIDENCE_SOURCES.Execution
  ) {
    return isCheckInStatusDetectedToday(status.evidence.observedAt)
  }

  if (status.evidence.legacyObservedAt !== undefined) {
    return isCheckInStatusDetectedToday(status.evidence.legacyObservedAt)
  }

  const todayKey = getDayKeyFromUnixSeconds(Math.floor(Date.now() / 1000))
  return status.evidence.legacyDayKey === todayKey
}

/**
 * Maps combined site/custom check-in state into one stable filter bucket.
 */
export function getAccountCheckInFilterValue(
  account: DisplaySiteData,
): AccountCheckInFilterValue {
  const hasCustomCheckIn =
    typeof account.checkIn.customCheckIn?.url === "string" &&
    account.checkIn.customCheckIn.url.trim() !== ""
  const selectedStatus = getSelectedCheckInStatus({
    config: account.checkIn,
    siteType: account.siteType,
  })
  const siteCheckedInToday =
    selectedStatus?.outcome === CHECK_IN_METHOD_STATUS_OUTCOMES.Known
      ? selectedStatus.today === CHECK_IN_METHOD_TODAY_STATUSES.Checked
        ? true
        : selectedStatus.today === CHECK_IN_METHOD_TODAY_STATUSES.NotChecked
          ? false
          : undefined
      : undefined
  const siteStatusKnown = siteCheckedInToday !== undefined
  const siteStatusOutdated =
    siteStatusKnown && !isSelectedCheckInStatusCurrent(account)
  const customCheckedIn =
    account.checkIn.customCheckIn?.isCheckedInToday === true

  if (siteStatusOutdated) {
    return "outdated"
  }

  if (!siteStatusKnown) {
    const selectionState = inspectAccountCheckIn({
      config: account.checkIn,
      siteType: account.siteType,
    }).selectionState

    if (selectionState.status === CHECK_IN_SELECTION_STATUSES.Selected) {
      return "status-unavailable"
    }

    if (!hasCustomCheckIn) {
      return "unsupported"
    }
  }

  const siteFlowChecked = !siteStatusKnown || siteCheckedInToday === true
  const customFlowChecked = !hasCustomCheckIn || customCheckedIn

  return siteFlowChecked && customFlowChecked ? "checked-in" : "not-checked-in"
}
