import { ACCOUNT_SITE_ADAPTER_FAMILIES, SITE_TYPES } from "~/constants/siteType"
import type { SiteTypeCapabilities } from "~/services/apiAdapters/contracts/siteTypeCapabilities"
import { novitaAccountBootstrap } from "~/services/apiAdapters/novita/accountBootstrap"
import { novitaAccountCompletion } from "~/services/apiAdapters/novita/accountCompletion"
import { novitaAccountData } from "~/services/apiAdapters/novita/accountData"
import { novitaAccountPersistence } from "~/services/apiAdapters/novita/accountPersistence"
import { novitaAccountRefresh } from "~/services/apiAdapters/novita/accountRefresh"
import { novitaAccountKeyResources } from "~/services/apiAdapters/novita/keyResources"
import {
  novitaAccountModelPricing,
  novitaProviderModelCatalog,
} from "~/services/apiAdapters/novita/providerModelCatalog"

export const novitaCapabilities: SiteTypeCapabilities = {
  siteType: SITE_TYPES.NOVITA,
  family: ACCOUNT_SITE_ADAPTER_FAMILIES.Novita,
  account: {
    data: novitaAccountData,
    persistence: novitaAccountPersistence,
    bootstrap: novitaAccountBootstrap,
    completion: novitaAccountCompletion,
    refresh: novitaAccountRefresh,
    keyResourceManagement: novitaAccountKeyResources,
    providerModelCatalog: novitaProviderModelCatalog,
    modelPricing: novitaAccountModelPricing,
  },
}
