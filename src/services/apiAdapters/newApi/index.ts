import { SITE_TYPES } from "~/constants/siteType"

import type { SiteAdapter } from "../contracts/siteAdapter"
import { newApiSiteNotice } from "./siteNotice"

export const newApiAdapter: SiteAdapter = {
  siteType: SITE_TYPES.NEW_API,
  family: "newApiFamily",
  siteNotice: newApiSiteNotice,
}
