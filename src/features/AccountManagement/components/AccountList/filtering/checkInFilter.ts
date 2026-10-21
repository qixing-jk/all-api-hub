import {
  getSiteCheckInDisplayState,
  SITE_CHECK_IN_DISPLAY_KINDS,
} from "~/features/AccountManagement/checkInStatus"
import type { DisplaySiteData } from "~/types"

export const ACCOUNT_CHECK_IN_FILTER_VALUES = {
  CheckedIn: "checked-in",
  NotCheckedIn: "not-checked-in",
  Outdated: "outdated",
  Pending: "pending",
  QueryFailed: "query-failed",
  Manual: "manual",
  Configuration: "configuration",
  SiteDisabled: "site-disabled",
  Unsupported: "unsupported",
} as const
export type AccountCheckInFilterValue =
  (typeof ACCOUNT_CHECK_IN_FILTER_VALUES)[keyof typeof ACCOUNT_CHECK_IN_FILTER_VALUES]

export const ACCOUNT_CHECK_IN_FILTER_OPTION_ORDER: AccountCheckInFilterValue[] =
  [
    ACCOUNT_CHECK_IN_FILTER_VALUES.CheckedIn,
    ACCOUNT_CHECK_IN_FILTER_VALUES.NotCheckedIn,
    ACCOUNT_CHECK_IN_FILTER_VALUES.Outdated,
    ACCOUNT_CHECK_IN_FILTER_VALUES.Pending,
    ACCOUNT_CHECK_IN_FILTER_VALUES.QueryFailed,
    ACCOUNT_CHECK_IN_FILTER_VALUES.Manual,
    ACCOUNT_CHECK_IN_FILTER_VALUES.Configuration,
    ACCOUNT_CHECK_IN_FILTER_VALUES.SiteDisabled,
    ACCOUNT_CHECK_IN_FILTER_VALUES.Unsupported,
  ]

/**
 * Maps combined site/custom check-in state into one stable filter bucket.
 */
export function getAccountCheckInFilterValue(
  account: DisplaySiteData,
): AccountCheckInFilterValue {
  const hasCustomCheckIn =
    typeof account.checkIn.customCheckIn?.url === "string" &&
    account.checkIn.customCheckIn.url.trim() !== ""
  const siteState = getSiteCheckInDisplayState(account)
  const siteCheckedInToday =
    siteState?.kind === SITE_CHECK_IN_DISPLAY_KINDS.Current
      ? siteState.checkedIn
      : undefined
  const siteStatusKnown = siteCheckedInToday !== undefined
  const customCheckedIn =
    account.checkIn.customCheckIn?.isCheckedInToday === true
  switch (siteState?.kind) {
    case SITE_CHECK_IN_DISPLAY_KINDS.Outdated:
      return ACCOUNT_CHECK_IN_FILTER_VALUES.Outdated
    case SITE_CHECK_IN_DISPLAY_KINDS.Pending:
      return ACCOUNT_CHECK_IN_FILTER_VALUES.Pending
    case SITE_CHECK_IN_DISPLAY_KINDS.Failed:
      return ACCOUNT_CHECK_IN_FILTER_VALUES.QueryFailed
    case SITE_CHECK_IN_DISPLAY_KINDS.Manual:
      return ACCOUNT_CHECK_IN_FILTER_VALUES.Manual
    case SITE_CHECK_IN_DISPLAY_KINDS.Configuration:
      return ACCOUNT_CHECK_IN_FILTER_VALUES.Configuration
    case SITE_CHECK_IN_DISPLAY_KINDS.SiteDisabled:
      return ACCOUNT_CHECK_IN_FILTER_VALUES.SiteDisabled
  }
  if (!siteState && !hasCustomCheckIn)
    return ACCOUNT_CHECK_IN_FILTER_VALUES.Unsupported

  const siteFlowChecked = !siteStatusKnown || siteCheckedInToday === true
  const customFlowChecked = !hasCustomCheckIn || customCheckedIn

  return siteFlowChecked && customFlowChecked
    ? ACCOUNT_CHECK_IN_FILTER_VALUES.CheckedIn
    : ACCOUNT_CHECK_IN_FILTER_VALUES.NotCheckedIn
}
