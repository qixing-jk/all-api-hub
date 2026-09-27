import type { AccountLoginProvider } from "~/constants/accountLogin"
import type { AccountSiteType } from "~/constants/siteType"
import type { ApiServiceRequest } from "~/services/apiTransport/type"
import type { AccountIdentity } from "~/types"

export const ACCOUNT_BOOTSTRAP_ROUTE_KINDS = {
  Login: "login",
  Usage: "usage",
  CheckIn: "checkIn",
  AdminCredentials: "adminCredentials",
  Redeem: "redeem",
  SiteAnnouncements: "siteAnnouncements",
} as const

export type AccountBootstrapRouteKind =
  (typeof ACCOUNT_BOOTSTRAP_ROUTE_KINDS)[keyof typeof ACCOUNT_BOOTSTRAP_ROUTE_KINDS]

export type AccountBootstrapRouteTarget = {
  baseUrl: string
  siteType: AccountSiteType
}

export interface UserInfo {
  id: AccountIdentity
  username: string
  access_token: string | null
  /**
   * Browser login identities the remote account is bound to, when the
   * deployment exposes them. Absent means "not observed", not "none bound".
   */
  loginProviders?: readonly AccountLoginProvider[]
}

export interface AccessTokenInfo {
  username: string
  access_token: string
  /** See {@link UserInfo.loginProviders}. */
  loginProviders?: readonly AccountLoginProvider[]
}

/** Optional product facts from one provider-native bootstrap snapshot. */
export type AccountBootstrapFacts = {
  displayName?: string
  defaultExchangeRate?: number
  /** Undefined means unknown, not explicitly unsupported. */
  checkInSupported?: boolean
  frontendTheme?: string
}

export type AccountBootstrapCapability = {
  fetchUserInfo(request: ApiServiceRequest): Promise<UserInfo>
  getOrCreateAccessToken(request: ApiServiceRequest): Promise<AccessTokenInfo>
  loadBootstrapFacts(request: ApiServiceRequest): Promise<AccountBootstrapFacts>
  /** Reuse supplied facts; only independent support probes may perform another read. */
  fetchCheckInSupport(
    request: ApiServiceRequest,
    facts: AccountBootstrapFacts,
  ): Promise<boolean | undefined>
  resolveRoutePath(
    target: AccountBootstrapRouteTarget,
    route: AccountBootstrapRouteKind,
  ): Promise<string | null>
}
