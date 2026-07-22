import { ACCOUNT_SITE_ADAPTER_FAMILIES, SITE_TYPES } from "~/constants/siteType"
import type { SiteTypeCapabilities } from "~/services/apiAdapters/contracts/siteTypeCapabilities"

import { voApiV2AccountBootstrap } from "./accountBootstrap"
import { voApiV2AccountCompletion } from "./accountCompletion"
import { voApiV2AccountData } from "./accountData"
import { voApiV2AccountRefresh } from "./accountRefresh"
import { voApiV2InviteLink } from "./inviteLink"
import { voApiV2KeyManagement } from "./keyManagement"
import { voApiV2TokenProvisioning } from "./tokenProvisioning"

export const voApiV2Capabilities: SiteTypeCapabilities = {
  siteType: SITE_TYPES.VO_API_V2,
  family: ACCOUNT_SITE_ADAPTER_FAMILIES.VoApiV2,
  account: {
    data: voApiV2AccountData,
    bootstrap: voApiV2AccountBootstrap,
    completion: voApiV2AccountCompletion,
    inviteLink: voApiV2InviteLink,
    keyManagement: voApiV2KeyManagement,
    tokenProvisioning: voApiV2TokenProvisioning,
    refresh: voApiV2AccountRefresh,
  },
}
