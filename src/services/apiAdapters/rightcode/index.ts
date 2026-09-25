import { ACCOUNT_SITE_ADAPTER_FAMILIES, SITE_TYPES } from "~/constants/siteType"

import type { SiteTypeCapabilities } from "../contracts/siteTypeCapabilities"
import { rightCodeAccountBootstrap } from "./accountBootstrap"
import { rightCodeAccountCompletion } from "./accountCompletion"
import { rightCodeAccountData } from "./accountData"
import { rightCodeAccountKeyResources } from "./accountKeyResource"
import { rightCodeAccountRefresh } from "./accountRefresh"
import { rightCodeInviteLink } from "./inviteLink"
import { rightCodeModelPricing } from "./modelPricing"

export const rightCodeCapabilities: SiteTypeCapabilities = {
  siteType: SITE_TYPES.RIGHT_CODE,
  family: ACCOUNT_SITE_ADAPTER_FAMILIES.RightCode,
  account: {
    data: rightCodeAccountData,
    bootstrap: rightCodeAccountBootstrap,
    completion: rightCodeAccountCompletion,
    keyResourceManagement: rightCodeAccountKeyResources,
    refresh: rightCodeAccountRefresh,
    modelPricing: rightCodeModelPricing,
    inviteLink: rightCodeInviteLink,
  },
}
