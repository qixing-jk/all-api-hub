import {
  ACCOUNT_USER_FEATURE_IDS,
  resolveAccountUserFeatureAvailability,
} from "~/services/apiAdapters/accountCapabilitySupport"
import { getSiteTypeCapabilities } from "~/services/apiAdapters/registry"
import type { DisplaySiteData } from "~/types"

export const REDEMPTION_ACCOUNT_SUPPORT_STATUSES = {
  Supported: "supported",
  Unsupported: "unsupported",
} as const

type RedemptionAccountSupportStatus =
  (typeof REDEMPTION_ACCOUNT_SUPPORT_STATUSES)[keyof typeof REDEMPTION_ACCOUNT_SUPPORT_STATUSES]

export interface RedemptionAccountCandidate extends DisplaySiteData {
  automaticRedemptionSupport: {
    status: RedemptionAccountSupportStatus
    reason?: "capability-missing"
  }
}

/** Adds serializable product support metadata for the content-script picker. */
export function toRedemptionAccountCandidate(
  account: DisplaySiteData,
): RedemptionAccountCandidate {
  const availability = resolveAccountUserFeatureAvailability(
    account.siteType,
    ACCOUNT_USER_FEATURE_IDS.AutomaticRedemption,
    getSiteTypeCapabilities(account.siteType),
  )

  return {
    ...account,
    automaticRedemptionSupport:
      availability.status === "supported"
        ? { status: REDEMPTION_ACCOUNT_SUPPORT_STATUSES.Supported }
        : {
            status: REDEMPTION_ACCOUNT_SUPPORT_STATUSES.Unsupported,
            reason: availability.reason,
          },
  }
}
