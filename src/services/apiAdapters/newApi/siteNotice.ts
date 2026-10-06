import type { AccountSiteType } from "~/constants/siteType"
import { fetchSiteNotice } from "~/services/apiService/newApiFamily/default/siteNotice"

import type { SiteNoticeCapability } from "../contracts/siteNotice"
import { getNewApiVariantRegistration } from "./variantRegistration"

export const newApiSiteNotice: SiteNoticeCapability = { fetch: fetchSiteNotice }
/** Binds the public notice protocol to the selected account site. */
export function createNewApiSiteNotice(
  siteType: AccountSiteType,
): SiteNoticeCapability {
  return getNewApiVariantRegistration(siteType).notice ?? newApiSiteNotice
}
