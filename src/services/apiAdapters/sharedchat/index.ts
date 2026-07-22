import { ACCOUNT_SITE_ADAPTER_FAMILIES, SITE_TYPES } from "~/constants/siteType"
import type { SiteTypeCapabilities } from "~/services/apiAdapters/contracts/siteTypeCapabilities"

import { sharedChatAccountCompletion } from "./accountCompletion"
import { sharedChatAccountData } from "./accountData"
import { sharedChatAccountRefresh } from "./accountRefresh"
import { sharedChatInviteLink } from "./inviteLink"
import { sharedChatModelCatalog } from "./modelCatalog"
import { sharedChatServiceCredential } from "./serviceCredential"

export const sharedChatCapabilities: SiteTypeCapabilities = {
  siteType: SITE_TYPES.SHAREDCHAT,
  family: ACCOUNT_SITE_ADAPTER_FAMILIES.SharedChat,
  account: {
    completion: sharedChatAccountCompletion,
    data: sharedChatAccountData,
    refresh: sharedChatAccountRefresh,
    modelCatalog: sharedChatModelCatalog,
    serviceCredential: sharedChatServiceCredential,
    inviteLink: sharedChatInviteLink,
  },
}
