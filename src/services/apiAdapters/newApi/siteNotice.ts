import { siteNotice } from "~/services/apiService/newApiFamily"

import type { SiteNoticeCapability } from "../contracts/siteNotice"

export const newApiSiteNotice: SiteNoticeCapability = {
  fetch: siteNotice.fetchSiteNotice,
}
