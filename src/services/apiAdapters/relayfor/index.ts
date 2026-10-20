import { ACCOUNT_SITE_ADAPTER_FAMILIES, SITE_TYPES } from "~/constants/siteType"
import { relayForAccountBootstrap } from "~/services/apiAdapters/relayfor/accountBootstrap"
import { relayForAccountCompletion } from "~/services/apiAdapters/relayfor/accountCompletion"
import { relayForAccountData } from "~/services/apiAdapters/relayfor/accountData"
import { relayForAccountKeyResources } from "~/services/apiAdapters/relayfor/accountKeyResource"
import { relayForAccountRefresh } from "~/services/apiAdapters/relayfor/accountRefresh"
import { relayForModelPricing } from "~/services/apiAdapters/relayfor/modelPricing"
import { fetchRelayForAnnouncement } from "~/services/apiService/relayfor"

import type { SiteTypeCapabilities } from "../contracts/siteTypeCapabilities"
import { relayForRedemption } from "./redemption"
import { relayForUsageHistory } from "./usageHistory"

export const relayForCapabilities: SiteTypeCapabilities = {
  siteType: SITE_TYPES.RELAYFOR,
  family: ACCOUNT_SITE_ADAPTER_FAMILIES.RelayFor,
  site: {
    announcements: {
      async fetch(request) {
        const announcement = await fetchRelayForAnnouncement(request)
        return announcement.content.trim()
          ? [
              {
                content: announcement.content,
                ...(announcement.title ? { title: announcement.title } : {}),
              },
            ]
          : []
      },
    },
  },
  account: {
    redemption: relayForRedemption,
    usageHistory: relayForUsageHistory,
    data: relayForAccountData,
    bootstrap: relayForAccountBootstrap,
    completion: relayForAccountCompletion,
    keyResourceManagement: relayForAccountKeyResources,
    refresh: relayForAccountRefresh,
    modelPricing: relayForModelPricing,
  },
}
