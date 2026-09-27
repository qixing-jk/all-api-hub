import { SITE_TYPES, type AccountSiteType } from "~/constants/siteType"
import type {
  AccountBootstrapCapability,
  AccountBootstrapFacts,
} from "~/services/apiAdapters/contracts/accountBootstrap"
import * as accountBootstrap from "~/services/apiService/newApiFamily/default/accountBootstrap"
import * as anyrouter from "~/services/apiService/newApiFamily/variants/anyrouter"
import * as apiyi from "~/services/apiService/newApiFamily/variants/apiyi"
import * as veloeraCheckIn from "~/services/apiService/newApiFamily/variants/veloeraCheckIn"
import * as wong from "~/services/apiService/newApiFamily/variants/wong"

import { resolveNewApiAccountRoutePath } from "./accountRoutes"

type AccountBootstrapImplementation = Omit<
  typeof accountBootstrap.defaultAccountBootstrapImplementation,
  "fetchSupportCheckIn"
> & {
  extractCheckInSupport: typeof accountBootstrap.extractCheckInSupport
  probeCheckInSupport?: typeof accountBootstrap.fetchSupportCheckIn
}

type NewApiAccountBootstrapOptions = Parameters<
  typeof accountBootstrap.getOrCreateAccessToken
>[1]

const accountBootstrapOverrides: Partial<
  Record<AccountSiteType, Partial<AccountBootstrapImplementation>>
> = {
  [SITE_TYPES.APIYI]: {
    getOrCreateAccessToken: apiyi.getAccessToken,
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
  const implementation: AccountBootstrapImplementation = {
    ...accountBootstrap.defaultAccountBootstrapImplementation,
    extractCheckInSupport: accountBootstrap.extractCheckInSupport,
    ...accountBootstrapOverrides[siteType],
  }

  const loadBootstrapFacts: AccountBootstrapCapability["loadBootstrapFacts"] =
    async (request) => {
      const status = await implementation.fetchSiteStatus(request)
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
        ? implementation.fetchUserInfo(request, options.expectedUserId)
        : implementation.fetchUserInfo(request),
    getOrCreateAccessToken: (request) =>
      options
        ? implementation.getOrCreateAccessToken(request, options)
        : implementation.getOrCreateAccessToken(request),
    loadBootstrapFacts,
    fetchCheckInSupport: async (request, facts) =>
      facts.checkInSupported ?? implementation.probeCheckInSupport?.(request),
    resolveRoutePath: async (target, route) =>
      resolveNewApiAccountRoutePath(target, route, { loadBootstrapFacts }),
  }
}
