import { SITE_TYPES, type AccountSiteType } from "~/constants/siteType"
import type {
  AccountBootstrapCapability,
  AccountBootstrapFacts,
} from "~/services/apiAdapters/contracts/accountBootstrap"
import * as accountBootstrap from "~/services/apiService/newApiFamily/default/accountBootstrap"
import * as anyrouter from "~/services/apiService/newApiFamily/variants/anyrouter"
import * as veloeraCheckIn from "~/services/apiService/newApiFamily/variants/veloeraCheckIn"
import * as wong from "~/services/apiService/newApiFamily/variants/wong"

import { resolveNewApiAccountCredentialVariant } from "./accountCredentialVariant"
import { resolveNewApiAccountRoutePath } from "./accountRoutes"

type AccountBootstrapMetadataImplementation = Pick<
  typeof accountBootstrap.defaultAccountBootstrapImplementation,
  "fetchSiteStatus" | "extractDefaultExchangeRate"
> & {
  extractCheckInSupport: typeof accountBootstrap.extractCheckInSupport
  probeCheckInSupport?: typeof accountBootstrap.fetchSupportCheckIn
}

type NewApiAccountBootstrapOptions = Parameters<
  typeof accountBootstrap.getOrCreateAccessToken
>[1]

const accountBootstrapMetadataOverrides: Partial<
  Record<AccountSiteType, Partial<AccountBootstrapMetadataImplementation>>
> = {
  [SITE_TYPES.LAOZHANG]: {
    extractCheckInSupport: (status) =>
      status &&
      "CheckinEnabled" in status &&
      typeof status.CheckinEnabled === "boolean"
        ? status.CheckinEnabled
        : undefined,
  },
  [SITE_TYPES.ANYROUTER]: {
    probeCheckInSupport: anyrouter.fetchSupportCheckIn,
  },
  [SITE_TYPES.VELOERA]: {
    extractCheckInSupport: veloeraCheckIn.extractCheckInSupport,
  },
  [SITE_TYPES.WONG_GONGYI]: {
    probeCheckInSupport: wong.fetchSupportCheckIn,
  },
}

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
    ...accountBootstrapMetadataOverrides[siteType],
  }

  const loadBootstrapFacts: AccountBootstrapCapability["loadBootstrapFacts"] =
    async (request) => {
      const status = await implementation.fetchSiteStatus(request)
      credentials.observeSiteStatus(request, status)
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
