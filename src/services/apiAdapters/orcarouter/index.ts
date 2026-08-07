import { ACCOUNT_SITE_ADAPTER_FAMILIES, SITE_TYPES } from "~/constants/siteType"

import type { SiteTypeCapabilities } from "../contracts/siteTypeCapabilities"
import { orcaRouterAccountData } from "./accountData"
import { orcaRouterAccountRefresh } from "./accountRefresh"

export const orcaRouterCapabilities: SiteTypeCapabilities = {
  siteType: SITE_TYPES.ORCAROUTER,
  family: ACCOUNT_SITE_ADAPTER_FAMILIES.OrcaRouter,
  account: {
    data: orcaRouterAccountData,
    refresh: orcaRouterAccountRefresh,
  },
}
