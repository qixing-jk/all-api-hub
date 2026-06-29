import type { AccountSiteType } from "~/services/accountSiteDefinitions"
import type {
  AccountSiteBackendFamily,
  AccountSiteDetectionMetadata,
  AccountSiteRouteConfig,
} from "~/services/accountSiteDefinitions/contracts"

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
  adapterFamily: AccountSiteBackendFamily
  detection?: AccountSiteDetectionMetadata
  routes?: AccountSiteRouteConfig
}
