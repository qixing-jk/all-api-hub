import { SITE_TYPES, type AccountSiteType } from "~/constants/siteType"
import { fetchSiteNotice } from "~/services/apiService/newApiFamily/default/siteNotice"
import { fetchLaoZhangSiteNotice } from "~/services/apiService/newApiFamily/variants/laozhangSiteNotice"

import type { SiteNoticeCapability } from "../contracts/siteNotice"

export const newApiSiteNotice: SiteNoticeCapability = {
  fetch: fetchSiteNotice,
}

const laoZhangSiteNotice: SiteNoticeCapability = {
  fetch: fetchLaoZhangSiteNotice,
}

/** Binds the public notice protocol to the registered account site type. */
export function createNewApiSiteNotice(
  siteType: AccountSiteType,
): SiteNoticeCapability {
  return siteType === SITE_TYPES.LAOZHANG
    ? laoZhangSiteNotice
    : newApiSiteNotice
}
