import { getAccountSiteDefinition } from "~/services/accountSiteDefinitions"
import {
  ACCOUNT_USER_FEATURE_IDS,
  resolveAccountUserFeatureAvailability,
} from "~/services/apiAdapters/accountCapabilitySupport"
import { getSiteTypeCapabilities } from "~/services/apiAdapters/registry"
import type { DisplaySiteData } from "~/types"

import {
  getRedemptionCodeKind,
  REDEMPTION_CODE_KINDS,
} from "./utils/redemptionCode"

/** Shared by account selection and final dispatch; a code prefix is not a site identity. */
export function acceptsRedemptionCode(
  account: Pick<DisplaySiteData, "siteType">,
  code: string,
): boolean {
  return (
    getAccountSiteDefinition(account.siteType)?.redemptionCodeKinds ?? [
      REDEMPTION_CODE_KINDS.Generic,
    ]
  ).includes(getRedemptionCodeKind(code))
}

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
