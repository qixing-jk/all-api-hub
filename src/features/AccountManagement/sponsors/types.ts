import type { AccountSiteType } from "~/constants/siteType"
import type { AuthTypeEnum } from "~/types"

export const SPONSOR_SUPPORT_STATUS = {
  Supported: "supported",
  Unsupported: "unsupported",
} as const

export type SponsorSupportStatus =
  (typeof SPONSOR_SUPPORT_STATUS)[keyof typeof SPONSOR_SUPPORT_STATUS]

export const SPONSOR_CATALOG_SOURCES = {
  Bundled: "bundled",
  Cached: "cached",
  Remote: "remote",
} as const

export type SponsorCatalogSource =
  (typeof SPONSOR_CATALOG_SOURCES)[keyof typeof SPONSOR_CATALOG_SOURCES]

export const SPONSOR_ADD_ACCOUNT_PREFILL_SOURCE = "sponsor" as const

export interface SponsorLocalizedContent {
  name: string
  tagline: string
  postClickNote?: string
}

export interface SponsorFallbackHints {
  bookmarkManager: boolean
  apiCredentialProfiles: boolean
}

export interface SponsorBookmarkFallbackPrefill {
  name: string
  url: string
}

export interface SponsorApiCredentialFallbackPrefill {
  name: string
  baseUrl: string
  apiKeyCreateUrl?: string
  apiKeyCreateHint?: string
}

export interface RawSponsorItem {
  id: string
  enabled: boolean
  rank?: number
  supportStatus: SponsorSupportStatus | string
  urls: {
    primaryAffiliate: string
    website?: string
    apiKeyCreate?: string
  }
  startsAt?: string
  endsAt?: string
  locales: Record<string, SponsorLocalizedContent>
  fallbackHints?: Partial<SponsorFallbackHints>
  accountPrefill?: {
    siteType: AccountSiteType | string
    siteUrl: string
    authType?: AuthTypeEnum | string
  }
}

export interface RawSponsorCatalog {
  schemaVersion: number
  items: RawSponsorItem[]
  _examples?: {
    devSponsors?: RawSponsorItem[]
  }
}

export interface SponsorRecommendation {
  id: string
  rank: number
  supportStatus: SponsorSupportStatus
  primaryAffiliateUrl: string
  websiteUrl?: string
  apiKeyCreateUrl?: string
  name: string
  tagline: string
  postClickNote?: string
  source: SponsorCatalogSource
  accountPrefill?: {
    siteType: AccountSiteType
    siteUrl: string
    authType?: AuthTypeEnum
  }
  fallbackHints: SponsorFallbackHints
}

export interface SponsorCatalogNormalizationResult {
  ok: boolean
  items: SponsorRecommendation[]
  errors: string[]
}

export interface AddAccountPrefill {
  source: typeof SPONSOR_ADD_ACCOUNT_PREFILL_SOURCE
  sponsorId: string
  siteType: AccountSiteType
  siteUrl: string
  authType?: AuthTypeEnum
}
