import { SITE_TYPES, type AccountSiteType } from "~/constants/siteType"
import * as anyrouterBootstrap from "~/services/apiService/anyrouter"
import * as commonBootstrap from "~/services/apiService/common"
import type {
  ApiServiceRequest,
  SiteStatusInfo,
} from "~/services/apiService/common/type"
import * as wongBootstrap from "~/services/apiService/wong"

interface AccountBootstrapImplementation {
  fetchUserInfo: typeof commonBootstrap.fetchUserInfo
  getOrCreateAccessToken: typeof commonBootstrap.getOrCreateAccessToken
  fetchSiteStatus: typeof commonBootstrap.fetchSiteStatus
  fetchSupportCheckIn: (
    request: ApiServiceRequest,
  ) => Promise<boolean | undefined>
  extractDefaultExchangeRate: (
    siteStatus: SiteStatusInfo | null,
  ) => number | null
}

const defaultAccountBootstrapImplementation: AccountBootstrapImplementation = {
  fetchUserInfo: commonBootstrap.fetchUserInfo,
  getOrCreateAccessToken: commonBootstrap.getOrCreateAccessToken,
  fetchSiteStatus: commonBootstrap.fetchSiteStatus,
  fetchSupportCheckIn: commonBootstrap.fetchSupportCheckIn,
  extractDefaultExchangeRate: commonBootstrap.extractDefaultExchangeRate,
}

const accountBootstrapOverrides: Partial<
  Record<AccountSiteType, Partial<AccountBootstrapImplementation>>
> = {
  [SITE_TYPES.ANYROUTER]: {
    fetchSupportCheckIn: anyrouterBootstrap.fetchSupportCheckIn,
  },
  [SITE_TYPES.WONG_GONGYI]: {
    fetchSupportCheckIn: wongBootstrap.fetchSupportCheckIn,
  },
}

const getAccountBootstrapImplementation = (
  siteType: AccountSiteType,
): AccountBootstrapImplementation => ({
  ...defaultAccountBootstrapImplementation,
  ...accountBootstrapOverrides[siteType],
})

/**
 * Create account-bootstrap operations bound to a New API-family site type.
 */
export function createAccountBootstrapImplementation(
  siteType: AccountSiteType,
): AccountBootstrapImplementation {
  const implementation = getAccountBootstrapImplementation(siteType)

  return {
    fetchUserInfo: (request) => implementation.fetchUserInfo(request),
    getOrCreateAccessToken: (request) =>
      implementation.getOrCreateAccessToken(request),
    fetchSiteStatus: (request) => implementation.fetchSiteStatus(request),
    fetchSupportCheckIn: (request) =>
      implementation.fetchSupportCheckIn(request),
    extractDefaultExchangeRate: (siteStatus) =>
      implementation.extractDefaultExchangeRate(siteStatus),
  }
}
