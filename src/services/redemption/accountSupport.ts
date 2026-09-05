import {
  ACCOUNT_USER_FEATURE_IDS,
  resolveAccountUserFeatureAvailability,
} from "~/services/apiAdapters/accountCapabilitySupport"
import { getSiteTypeCapabilities } from "~/services/apiAdapters/registry"
import type { DisplaySiteData } from "~/types"

/** Resolves the automatic-redemption feature and its adapter in one place. */
export function resolveAutomaticRedemptionAvailability(
  account: Pick<DisplaySiteData, "siteType">,
) {
  return resolveAccountUserFeatureAvailability(
    account.siteType,
    ACCOUNT_USER_FEATURE_IDS.AutomaticRedemption,
    getSiteTypeCapabilities(account.siteType),
  )
}
