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

export const SPONSOR_VISIBILITY_BROWSER_FAMILIES = {
  Chromium: "chromium",
  Edge: "edge",
  Firefox: "firefox",
  Safari: "safari",
  Unknown: "unknown",
} as const

export type SponsorVisibilityBrowserFamily =
  (typeof SPONSOR_VISIBILITY_BROWSER_FAMILIES)[keyof typeof SPONSOR_VISIBILITY_BROWSER_FAMILIES]

export const SPONSOR_ADD_ACCOUNT_PREFILL_SOURCE = "sponsor" as const
export const BOOKMARK_IMPORT_ADD_ACCOUNT_PREFILL_SOURCE =
  "bookmark-import" as const

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

export interface SponsorRecommendationLinks {
  primary: string
}

export interface SponsorRecommendationActions {
  addAccount?: {
    siteType: AccountSiteType
    siteUrl: string
    authType?: AuthTypeEnum
  }
  bookmarkFallback?: {
    url: string
  }
  apiCredentialProfileFallback?: {
    baseUrl: string
    apiKeyCreateUrl?: string
    apiKeyCreateHint?: string
  }
}

export interface RawSponsorCatalog {
  schemaVersion: number
  items: RawSponsorCatalogItem[]
  _examples?: {
    devSponsors?: RawSponsorCatalogItem[]
  }
}

export interface RawSponsorCatalogItem {
  id: string
  locales: Record<string, RawSponsorLocaleCampaign>
}

export interface RawSponsorLocaleCampaign {
  enabled: boolean
  rank: number
  supportStatus: SponsorSupportStatus | string
  startsAt?: string
  endsAt?: string
  visibility?: {
    extensionVersions?: string
    excludedBrowserFamilies?: SponsorVisibilityBrowserFamily[] | string[]
  }
  name: string
  tagline: string
  postClickNote?: string
  links: {
    primary: string
  }
  actions?: {
    addAccount?: {
      siteType: AccountSiteType | string
      siteUrl: string
      authType?: AuthTypeEnum | string
    }
    bookmarkFallback?: {
      url: string
    }
    apiCredentialProfileFallback?: {
      baseUrl: string
      apiKeyCreateUrl?: string
      apiKeyCreateHint?: string
    }
  }
}

export interface SponsorRecommendation {
  id: string
  rank: number
  supportStatus: SponsorSupportStatus
  links: SponsorRecommendationLinks
  actions: SponsorRecommendationActions
  selectedLocale?: string
  schemaVersion: number
  name: string
  tagline: string
  postClickNote?: string
  source: SponsorCatalogSource
}

export interface SponsorCatalogNormalizationResult {
  ok: boolean
  items: SponsorRecommendation[]
  errors: string[]
}

export interface SponsorAddAccountPrefill {
  source: typeof SPONSOR_ADD_ACCOUNT_PREFILL_SOURCE
  sponsorId: string
  siteType: AccountSiteType
  siteUrl: string
  authType?: AuthTypeEnum
}

export interface BookmarkImportAddAccountPrefill {
  source: typeof BOOKMARK_IMPORT_ADD_ACCOUNT_PREFILL_SOURCE
  siteUrl: string
  siteType?: AccountSiteType
  authType?: AuthTypeEnum
}

export type AddAccountPrefill =
  | SponsorAddAccountPrefill
  | BookmarkImportAddAccountPrefill
