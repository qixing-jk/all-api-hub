import { ACCOUNT_SITE_ADAPTER_FAMILIES, SITE_TYPES } from "~/constants/siteType"

import type { SiteTypeCapabilities } from "../contracts/siteTypeCapabilities"
import { aihubmixAccountBootstrap } from "./accountBootstrap"
import { aihubmixAccountCompletion } from "./accountCompletion"
import { aihubmixAccountData } from "./accountData"
import { aihubmixAccountKeyResources } from "./accountKeyResource"
import { aihubmixAccountRefresh } from "./accountRefresh"
import { aihubmixInviteLink } from "./inviteLink"
import { aihubmixModelPricing } from "./modelPricing"

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
