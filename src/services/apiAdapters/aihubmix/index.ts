import { ACCOUNT_SITE_ADAPTER_FAMILIES, SITE_TYPES } from "~/constants/siteType"
import { aihubmixAccountBootstrap } from "~/services/apiAdapters/aihubmix/account/accountBootstrap"
import { aihubmixAccountCompletion } from "~/services/apiAdapters/aihubmix/account/accountCompletion"
import { aihubmixAccountData } from "~/services/apiAdapters/aihubmix/account/accountData"
import { aihubmixAccountRefresh } from "~/services/apiAdapters/aihubmix/account/accountRefresh"
import { aihubmixInviteLink } from "~/services/apiAdapters/aihubmix/account/inviteLink"
import { aihubmixAccountKeyResources } from "~/services/apiAdapters/aihubmix/keys/accountKeyResource"
import { aihubmixModelPricing } from "~/services/apiAdapters/aihubmix/models/modelPricing"

import type { SiteTypeCapabilities } from "../contracts/siteTypeCapabilities"

export const aihubmixCapabilities: SiteTypeCapabilities = {
  siteType: SITE_TYPES.AIHUBMIX,
  family: ACCOUNT_SITE_ADAPTER_FAMILIES.Aihubmix,
  account: {
    data: aihubmixAccountData,
    bootstrap: aihubmixAccountBootstrap,
    completion: aihubmixAccountCompletion,
    keyResourceManagement: aihubmixAccountKeyResources,
    refresh: aihubmixAccountRefresh,
    modelPricing: aihubmixModelPricing,
    inviteLink: aihubmixInviteLink,
  },
}
