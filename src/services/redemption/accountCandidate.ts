import {
  ACCOUNT_USER_FEATURE_IDS,
  resolveAccountUserFeatureAvailability,
} from "~/services/apiAdapters/accountCapabilitySupport"
import { getSiteTypeCapabilities } from "~/services/apiAdapters/registry"
import type { DisplaySiteData } from "~/types"

import {
  REDEMPTION_ACCOUNT_SUPPORT_STATUSES,
  type RedemptionAccountCandidate,
} from "./contracts"

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
      availability.status === REDEMPTION_ACCOUNT_SUPPORT_STATUSES.Supported
        ? { status: REDEMPTION_ACCOUNT_SUPPORT_STATUSES.Supported }
        : {
            status: REDEMPTION_ACCOUNT_SUPPORT_STATUSES.Unsupported,
            reason: availability.reason,
          },
  }
}
