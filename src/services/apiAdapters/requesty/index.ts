import { ACCOUNT_SITE_ADAPTER_FAMILIES, SITE_TYPES } from "~/constants/siteType"
import { requestyAccountBootstrap } from "~/services/apiAdapters/requesty/account/accountBootstrap"
import { requestyAccountCompletion } from "~/services/apiAdapters/requesty/account/accountCompletion"
import { requestyAccountData } from "~/services/apiAdapters/requesty/account/accountData"
import { requestyAccountPersistence } from "~/services/apiAdapters/requesty/account/accountPersistence"
import { requestyAccountRefresh } from "~/services/apiAdapters/requesty/account/accountRefresh"
import { requestyAccountKeyResources } from "~/services/apiAdapters/requesty/keys/accountKeyResource"
import { requestyProviderModelCatalog } from "~/services/apiAdapters/requesty/models/providerModelCatalog"

import type { SiteTypeCapabilities } from "../contracts/siteTypeCapabilities"

export const requestyCapabilities: SiteTypeCapabilities = {
  siteType: SITE_TYPES.REQUESTY,
  family: ACCOUNT_SITE_ADAPTER_FAMILIES.Requesty,
  account: {
    data: requestyAccountData,
    bootstrap: requestyAccountBootstrap,
    completion: requestyAccountCompletion,
    persistence: requestyAccountPersistence,
    keyResourceManagement: requestyAccountKeyResources,
    refresh: requestyAccountRefresh,
    providerModelCatalog: requestyProviderModelCatalog,
  },
}
