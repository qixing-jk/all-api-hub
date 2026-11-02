import { ACCOUNT_SITE_ADAPTER_FAMILIES, SITE_TYPES } from "~/constants/siteType"
import type { UsageHistoryCapability } from "~/services/apiAdapters/contracts/usageHistory"
import { aimlApiAccountData } from "~/services/apiService/aimlapi/accountData"
import { fetchAimlApiKeyUsagePage } from "~/services/apiService/aimlapi/usage"

import type { SiteTypeCapabilities } from "../contracts/siteTypeCapabilities"
import { aimlApiAccountBootstrap } from "./accountBootstrap"
import { aimlApiAccountCompletion } from "./accountCompletion"
import { aimlApiAccountPersistence } from "./accountPersistence"
import { aimlApiAccountRefresh } from "./accountRefresh"
import { aimlApiKeyResources } from "./keyResources"
import {
  aimlApiModelPricing,
  aimlApiProviderModelCatalog,
} from "./modelCatalog"

const aimlApiUsageHistory: UsageHistoryCapability = {
  fetchPage: (request, query) => fetchAimlApiKeyUsagePage(request, query),
}

export const aimlApiCapabilities: SiteTypeCapabilities = {
  siteType: SITE_TYPES.AIMLAPI,
  family: ACCOUNT_SITE_ADAPTER_FAMILIES.AiMlApi,
  account: {
    data: aimlApiAccountData,
    bootstrap: aimlApiAccountBootstrap,
    completion: aimlApiAccountCompletion,
    persistence: aimlApiAccountPersistence,
    keyResourceManagement: aimlApiKeyResources,
    modelPricing: aimlApiModelPricing,
    providerModelCatalog: aimlApiProviderModelCatalog,
    refresh: aimlApiAccountRefresh,
    usageHistory: aimlApiUsageHistory,
  },
}
