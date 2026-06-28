import { fetchSiteNotice } from "~/services/apiService/newApiFamily/default/siteNotice"

import type { SiteNoticeCapability } from "../contracts/siteNotice"

export const newApiSiteNotice: SiteNoticeCapability = {
  fetch: fetchSiteNotice,
}
