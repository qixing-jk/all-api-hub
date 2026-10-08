import { ACCOUNT_SITE_ADAPTER_FAMILIES, SITE_TYPES } from "~/constants/siteType"
import { rightCodeAccountBootstrap } from "~/services/apiAdapters/rightcode/account/accountBootstrap"
import { rightCodeAccountCompletion } from "~/services/apiAdapters/rightcode/account/accountCompletion"
import { rightCodeAccountData } from "~/services/apiAdapters/rightcode/account/accountData"
import { rightCodeAccountRefresh } from "~/services/apiAdapters/rightcode/account/accountRefresh"
import { rightCodeInviteLink } from "~/services/apiAdapters/rightcode/account/inviteLink"
import { rightCodeAccountKeyResources } from "~/services/apiAdapters/rightcode/keys/accountKeyResource"
import { rightCodeModelPricing } from "~/services/apiAdapters/rightcode/models/modelPricing"

import type { SiteTypeCapabilities } from "../contracts/siteTypeCapabilities"

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
