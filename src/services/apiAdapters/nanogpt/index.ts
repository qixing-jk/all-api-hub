import { ACCOUNT_SITE_ADAPTER_FAMILIES, SITE_TYPES } from "~/constants/siteType"
import { API_ERROR_CODES, ApiError } from "~/services/apiTransport/errors"
import { t } from "~/utils/i18n/core"

import type { SiteTypeCapabilities } from "../contracts/siteTypeCapabilities"
import { nanoGptAccountBootstrap } from "./accountBootstrap"
import { nanoGptAccountCompletion } from "./accountCompletion"
import { nanoGptAccountData } from "./accountData"
import { nanoGptAccountPersistence } from "./accountPersistence"
import { nanoGptAccountRefresh } from "./accountRefresh"
import { nanoGptKeyResources } from "./keyResources"
import { nanoGptProviderModelCatalog } from "./providerModelCatalog"
import { nanoGptServiceCredential } from "./serviceCredential"

/** Account data uses inference credentials; scoped management tokens own native key CRUD. */
export const nanoGptCapabilities: SiteTypeCapabilities = {
  siteType: SITE_TYPES.NANOGPT,
  family: ACCOUNT_SITE_ADAPTER_FAMILIES.NanoGPT,
  account: {
    usageHistory: {
      // NanoGPT exposes aggregate key usage, not timestamped consumption logs.
      fetchPage: async () => {
        throw new ApiError(
          t("accountDialog:nanoGptCredentials.eventHistoryUnsupported"),
          undefined,
          undefined,
          API_ERROR_CODES.FEATURE_UNSUPPORTED,
        )
      },
    },
    serviceCredential: nanoGptServiceCredential,
    keyResourceManagement: nanoGptKeyResources,
    persistence: nanoGptAccountPersistence,
    bootstrap: nanoGptAccountBootstrap,
    completion: nanoGptAccountCompletion,
    data: nanoGptAccountData,
    refresh: nanoGptAccountRefresh,
    providerModelCatalog: nanoGptProviderModelCatalog,
  },
}
