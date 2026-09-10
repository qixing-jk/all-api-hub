import { SITE_TYPES } from "~/constants/siteType"
import { MANAGED_RESOURCE_SECRET_VERIFICATION_KINDS } from "~/services/apiAdapters/contracts/managedResourceMatching"
import type { ManagedResourceSecretVerificationCapability } from "~/services/apiAdapters/contracts/managedResourceMatching"
import { getNewApiLoginAssistConfig } from "~/services/managedSites/providers/newApiChannelSecrets"
import {
  hasNewApiAuthenticatedBrowserSession,
  hasNewApiLoginAssistCredentials,
} from "~/services/managedSites/providers/newApiSession"
import { hasNewApiTotpSecret } from "~/services/managedSites/providers/newApiTotp"
import type { NewApiConfig } from "~/types/newApiConfig"

/** New API owns session readiness; React owns interactive verification execution. */
export const newApiSecretVerification: ManagedResourceSecretVerificationCapability<NewApiConfig> =
  {
    kind: MANAGED_RESOURCE_SECRET_VERIFICATION_KINDS.NEW_API_SESSION,
    async getRecovery(config, searchBaseUrl) {
      if (!("adminToken" in config) || !("userId" in config)) return undefined
      const loginAssistConfig = await getNewApiLoginAssistConfig()
      return {
        siteType: SITE_TYPES.NEW_API,
        managedBaseUrl: config.baseUrl,
        searchBaseUrl,
        loginCredentialsConfigured:
          hasNewApiLoginAssistCredentials(loginAssistConfig),
        authenticatedBrowserSessionExists:
          await hasNewApiAuthenticatedBrowserSession({
            baseUrl: config.baseUrl,
            userId: config.userId,
          }),
        automaticCodeConfigured: hasNewApiTotpSecret(
          loginAssistConfig?.totpSecret,
        ),
      }
    },
    getUnavailableHint: (t) =>
      t("keyManagement:managedSiteStatus.descriptions.newApiRetrieveKeyHint"),
  }
