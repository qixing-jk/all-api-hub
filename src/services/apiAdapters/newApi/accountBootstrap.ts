import { SITE_TYPES, type AccountSiteType } from "~/constants/siteType"
import type { AccountBootstrapCapability } from "~/services/apiAdapters/contracts/accountBootstrap"
import * as accountBootstrap from "~/services/apiService/newApiFamily/default/accountBootstrap"
import * as anyrouter from "~/services/apiService/newApiFamily/variants/anyrouter"
import * as veloera from "~/services/apiService/newApiFamily/variants/veloera"
import * as wong from "~/services/apiService/newApiFamily/variants/wong"

import { resolveStaticAccountRoutePath } from "../accountRoutes"

type AccountBootstrapImplementation =
  typeof accountBootstrap.defaultAccountBootstrapImplementation

interface NewApiAccountBootstrapOptions {
  accessTokenCreationPolicy?: Parameters<
    typeof accountBootstrap.getOrCreateAccessToken
  >[1]
}

const accountBootstrapOverrides: Partial<
  Record<AccountSiteType, Partial<AccountBootstrapImplementation>>
> = {
  [SITE_TYPES.ANYROUTER]: {
    fetchSupportCheckIn: anyrouter.fetchSupportCheckIn,
  },
  [SITE_TYPES.VELOERA]: {
    fetchSupportCheckIn: veloera.fetchSupportCheckIn,
  },
  [SITE_TYPES.WONG_GONGYI]: {
    fetchSupportCheckIn: wong.fetchSupportCheckIn,
  },
}

/**
 * Create account-bootstrap operations bound to the New API-family site type.
 */
export function createNewApiAccountBootstrap(
  siteType: AccountSiteType,
  options?: NewApiAccountBootstrapOptions,
): AccountBootstrapCapability {
  const implementation = {
    ...accountBootstrap.defaultAccountBootstrapImplementation,
    ...accountBootstrapOverrides[siteType],
  }

  return {
    fetchUserInfo: (request) => implementation.fetchUserInfo(request),
    getOrCreateAccessToken: (request) =>
      options?.accessTokenCreationPolicy
        ? implementation.getOrCreateAccessToken(
            request,
            options.accessTokenCreationPolicy,
          )
        : implementation.getOrCreateAccessToken(request),
    fetchSiteStatus: (request) => implementation.fetchSiteStatus(request),
    fetchCheckInSupport: (request) =>
      implementation.fetchSupportCheckIn(request),
    extractDefaultExchangeRate: (siteStatus) =>
      implementation.extractDefaultExchangeRate(siteStatus),
    resolveRoutePath: async (target, route) =>
      resolveStaticAccountRoutePath(target, route),
  }
}
