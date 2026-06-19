import type { AccountSiteType } from "./siteTypes"

export type AccountSiteRouteConfig = {
  loginPath?: string
  usagePath?: string
  checkInPath?: string
  adminCredentialsPath?: string
  redeemPath?: string
  siteAnnouncementsPath?: string
}

export type AccountSiteDetectionMetadata = {
  titlePatterns?: readonly RegExp[]
  hostnames?: readonly string[]
  compatUserIdHeaderNames?: readonly string[]
}

export type ContentSessionExtractionContext = {
  url?: string
  siteTypeHint?: AccountSiteType
}

export type ContentSessionExtractionResult = {
  userId: string | number
  user: Record<string, unknown>
  accessToken?: string
  siteTypeHint?: AccountSiteType
  sub2apiAuth?: {
    refreshToken: string
    tokenExpiresAt?: number
  }
}

export type ContentSessionExtractor = {
  id: string
  canExtract(context: ContentSessionExtractionContext): boolean
  extract(
    context: ContentSessionExtractionContext,
  ): Promise<ContentSessionExtractionResult | null>
}

export type AccountSiteOnboardingMetadata = {
  siteType: AccountSiteType
  detection?: AccountSiteDetectionMetadata
  routes?: AccountSiteRouteConfig
}
