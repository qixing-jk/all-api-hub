import { fetchSiteNotice } from "~/services/apiService/common"

import type { SiteNoticeCapability } from "../contracts/siteNotice"

export const newApiSiteNotice: SiteNoticeCapability = {
  fetch: fetchSiteNotice,
}
