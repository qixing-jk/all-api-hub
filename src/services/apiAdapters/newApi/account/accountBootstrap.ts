import { type AccountSiteType } from "~/constants/siteType"
import type {
  AccountBootstrapCapability,
  AccountBootstrapFacts,
} from "~/services/apiAdapters/contracts/accountBootstrap"
import { resolveNewApiAccountCredentialVariant } from "~/services/apiAdapters/newApi/account/accountCredentialVariant"
import { resolveNewApiAccountRoutePath } from "~/services/apiAdapters/newApi/account/accountRoutes"
import type { AccountBootstrapMetadataImplementation } from "~/services/apiAdapters/newApi/variantOperations/bootstrap"
import { getNewApiVariantRegistration } from "~/services/apiAdapters/newApi/variantRegistration"
import * as accountBootstrap from "~/services/apiService/newApiFamily/default/accountBootstrap"

type NewApiAccountBootstrapOptions = Parameters<
  typeof accountBootstrap.getOrCreateAccessToken
>[1]

/**
 * Create account-bootstrap operations bound to the New API-family site type.
 */
export function createNewApiAccountBootstrap(
  siteType: AccountSiteType,
  options?: NewApiAccountBootstrapOptions,
): AccountBootstrapCapability {
  const credentials = resolveNewApiAccountCredentialVariant(siteType)
  const implementation: AccountBootstrapMetadataImplementation = {
    fetchSiteStatus:
      accountBootstrap.defaultAccountBootstrapImplementation.fetchSiteStatus,
    extractDefaultExchangeRate:
      accountBootstrap.defaultAccountBootstrapImplementation
        .extractDefaultExchangeRate,
    extractCheckInSupport: accountBootstrap.extractCheckInSupport,
    ...getNewApiVariantRegistration(siteType).bootstrap,
  }

  const loadBootstrapFacts: AccountBootstrapCapability["loadBootstrapFacts"] =
    async (request) => {
      const status = await implementation.fetchSiteStatus(request)
      implementation.observeSiteStatus?.(request, status)
      const facts: AccountBootstrapFacts = {}
      if (typeof status?.system_name === "string")
        facts.displayName = status.system_name
      if (typeof status?.theme === "string") facts.frontendTheme = status.theme
      const rate = implementation.extractDefaultExchangeRate(status)
      if (rate != null) facts.defaultExchangeRate = rate
      const supported = implementation.extractCheckInSupport(status)
      if (typeof supported === "boolean") facts.checkInSupported = supported
      return facts
    }

  return {
    fetchUserInfo: (request) =>
      options?.expectedUserId
        ? credentials.fetchUserInfo(request, options.expectedUserId)
        : credentials.fetchUserInfo(request),
    getOrCreateAccessToken: (request) =>
      options
        ? credentials.getOrCreateAccessToken(request, options)
        : credentials.getOrCreateAccessToken(request),
    loadBootstrapFacts,
    fetchCheckInSupport: async (request, facts) =>
      facts.checkInSupported ?? implementation.probeCheckInSupport?.(request),
    resolveRoutePath: async (target, route) =>
      resolveNewApiAccountRoutePath(target, route, { loadBootstrapFacts }),
  }
}
