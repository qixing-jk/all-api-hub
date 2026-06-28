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
}

export interface AccessTokenInfo {
  username: string
  access_token: string
}

export interface SiteStatusInfo {
  price?: number
  stripe_unit_price?: number
  PaymentUSDRate?: number
  system_name?: string
  theme?: string
  /**
   * 是否启用签到功能
   */
  checkin_enabled?: boolean
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
