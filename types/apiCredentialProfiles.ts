import type { ApiVerificationApiType } from "~/services/aiApiVerification"

/**
 * Current schema version for the API credential profiles storage payload.
 */
export const API_CREDENTIAL_PROFILES_CONFIG_VERSION = 2

/**
 * Standalone persisted API credential bundle (baseUrl + apiKey) that is not tied
 * to a SiteAccount.
 *
 * Security: `apiKey` is a secret. UI must mask it by default and logs must never
 * include the raw value.
 */
export type ApiCredentialProfile = {
  id: string
  name: string
  apiType: ApiVerificationApiType
  /**
   * Canonical, normalized base URL (never includes provider `/v1` or `/v1beta`).
   */
  baseUrl: string
  /**
   * Secret API key (stored in extension local storage).
   */
  apiKey: string
  /**
   * Global tag ids (shared with SiteAccount / SiteBookmark).
   */
  tagIds: string[]
  notes: string
  createdAt: number
  updatedAt: number
}

/**
 * Persisted config payload holding all API credential profiles.
 */
export type ApiCredentialProfilesConfig = {
  version: number
  profiles: ApiCredentialProfile[]
  lastUpdated: number
}
