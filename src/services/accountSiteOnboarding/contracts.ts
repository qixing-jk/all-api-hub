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

export const ACCOUNT_SITE_ADAPTER_FAMILIES = {
  NewApiFamily: "newApiFamily",
  Sub2Api: "sub2api",
  Aihubmix: "aihubmix",
  Unsupported: "unsupported",
} as const

export type AccountSiteAdapterFamily =
  (typeof ACCOUNT_SITE_ADAPTER_FAMILIES)[keyof typeof ACCOUNT_SITE_ADAPTER_FAMILIES]

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
  adapterFamily: AccountSiteAdapterFamily
  detection?: AccountSiteDetectionMetadata
  routes?: AccountSiteRouteConfig
}
