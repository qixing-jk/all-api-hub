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

export const NEW_API_DASHBOARD_TRANSIENT_AUTH_KIND = "new_api_dashboard_bearer"

/**
 * Completion-only New API dashboard authentication. This must never be
 * persisted as `account_info.access_token`, which is reserved for the PAT.
 */
export type NewApiDashboardTransientAuth = {
  kind: typeof NEW_API_DASHBOARD_TRANSIENT_AUTH_KIND
  token: string
  expiresAt: number
  sessionId: string
  origin: string
}

export type ContentSessionTransientAuth = NewApiDashboardTransientAuth

export type ContentSessionExtractionResult = {
  userId: string | number
  user: Record<string, unknown>
  accessToken?: string
  siteTypeHint?: AccountSiteType
  transientAuth?: ContentSessionTransientAuth
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
