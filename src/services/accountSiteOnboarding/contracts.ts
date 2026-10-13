import type { AccountSiteType } from "~/services/accountSiteDefinitions"
import type {
  AccountSiteBackendFamily,
  AccountSiteDetectionMetadata,
  AccountSiteRouteConfig,
} from "~/services/accountSiteDefinitions/contracts"
import type { KimiOpenPlatformAuthConfig } from "~/types"

import type { AccountDetectionDiagnostics } from "./diagnostics"

export type ContentSessionExtractionContext = {
  url?: string
  siteTypeHint?: AccountSiteType
  /** Allows explicit onboarding to try registered session probes for unknown sites. */
  allowSessionProbe?: boolean
  diagnostics?: AccountDetectionDiagnostics
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
  kimiOpenPlatformAuth?: KimiOpenPlatformAuthConfig
}

/** Untrusted session payload context; probe permission never implies permission to persist auth. */
export type ContentSessionTransientAuthContext = {
  baseUrl: string
  siteType: AccountSiteType
  siteTypeHint?: AccountSiteType
  allowSessionProbe?: boolean
}

/** A recognized protocol failed; speculative fallback must not replace its identity. */
export class ContentSessionProtocolError extends Error {}

export type ContentSessionExtractor = {
  id: string
  /** Cached generic identity only; defer it and never use it to hide a failed probe. */
  isUnverifiedFallback?: boolean
  /** Optional protocol-aware discovery. Called only for explicit unknown-site onboarding. */
  probe?(
    context: ContentSessionExtractionContext,
  ): Promise<ContentSessionExtractionResult | null>
  canExtract(context: ContentSessionExtractionContext): boolean
  extract(
    context: ContentSessionExtractionContext,
  ): Promise<ContentSessionExtractionResult | null>
}

export type AccountSiteOnboardingMetadata = {
  siteType: AccountSiteType
  adapterFamily: AccountSiteBackendFamily
  detection?: AccountSiteDetectionMetadata
  routes: AccountSiteRouteConfig
}

/**
 * A provider's trusted-URL policy for read-only account detection. Failure
 * messages use local copy and logs contain only structured status diagnostics;
 * this registration does not grant permission to create credentials.
 */
export type AccountDetectionPrivacyPolicy = {
  siteType: AccountSiteType
  matchesUrl(url: string): boolean
  getFailureMessage(): string
}
