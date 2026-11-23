import type { AccountSiteType } from "~/constants/siteType"
import { getCompatibleAccountVariant } from "~/services/apiAdapters/compatibleAccountVariant"
import type { SiteNoticeCapability } from "~/services/apiAdapters/contracts/siteNotice"
import { fetchSiteNotice } from "~/services/apiService/newApiFamily/default/siteNotice"

export const newApiSiteNotice: SiteNoticeCapability = { fetch: fetchSiteNotice }
/** Binds the public notice protocol to the selected account site. */
export function createNewApiSiteNotice(
  siteType: AccountSiteType,
): SiteNoticeCapability {
  return getCompatibleAccountVariant(siteType).notice ?? newApiSiteNotice
}
