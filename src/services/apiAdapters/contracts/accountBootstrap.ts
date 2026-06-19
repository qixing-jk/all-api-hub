import type { AccountSiteType } from "~/constants/siteType"
import type {
  AccessTokenInfo,
  ApiServiceRequest,
  SiteStatusInfo,
  UserInfo,
} from "~/services/apiService/common/type"

export type AccountBootstrapRouteKind =
  | "login"
  | "usage"
  | "checkIn"
  | "adminCredentials"
  | "redeem"
  | "siteAnnouncements"

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
