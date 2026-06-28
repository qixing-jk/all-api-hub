import type { AccountSiteType } from "~/constants/siteType"
import type {
  AccessTokenInfo,
  SiteStatusInfo,
  UserInfo,
} from "~/services/accountBootstrap/model"
import type { ApiServiceRequest } from "~/services/apiTransport/type"

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

export type AccountBootstrapCapability = {
  fetchUserInfo(request: ApiServiceRequest): Promise<UserInfo>
  getOrCreateAccessToken(request: ApiServiceRequest): Promise<AccessTokenInfo>
  fetchSiteStatus(request: ApiServiceRequest): Promise<SiteStatusInfo | null>
  fetchCheckInSupport(request: ApiServiceRequest): Promise<boolean | undefined>
  extractDefaultExchangeRate(siteStatus: SiteStatusInfo | null): number | null
  resolveRoutePath(
    target: AccountBootstrapRouteTarget,
    route: AccountBootstrapRouteKind,
  ): Promise<string>
}
