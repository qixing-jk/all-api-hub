import { SITE_TYPES } from "~/constants/siteType"

import type { SiteTypeCapabilities } from "../contracts/siteTypeCapabilities"
import { windhubAccountData } from "./accountData"

export const windhubCapabilities: SiteTypeCapabilities = {
  siteType: SITE_TYPES.WINDHUB,
  account: { data: windhubAccountData },
}
