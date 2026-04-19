import type { ApiVerificationApiType } from "~/services/verification/aiApiVerification"
import type { HealthStatus, TokenUsage } from "~/types"

/**
 * Current schema version for the API credential profiles storage payload.
 */
export const API_CREDENTIAL_PROFILES_CONFIG_VERSION = 3

export type ApiCredentialTelemetryCapabilityMode =
  | "disabled"
  | "auto"
  | "openaiBilling"
  | "newApiTokenUsage"
  | "sub2apiUsage"
  | "customReadOnlyEndpoint"

export type ApiCredentialTelemetryJsonPathMap = {
  balanceUsd?: string
  todayCostUsd?: string
  todayRequests?: string
  todayPromptTokens?: string
  todayCompletionTokens?: string
  todayTotalTokens?: string
  totalUsedUsd?: string
  totalGrantedUsd?: string
  totalAvailableUsd?: string
  expiresAt?: string
}

export type ApiCredentialTelemetryCustomEndpoint = {
  /**
   * Read-only endpoint path or URL under the profile base URL origin.
   */
  endpoint: string
  jsonPaths: ApiCredentialTelemetryJsonPathMap
}

export type ApiCredentialTelemetryConfig = {
  mode: ApiCredentialTelemetryCapabilityMode
  customEndpoint?: ApiCredentialTelemetryCustomEndpoint
}

export type ApiCredentialTelemetryAttemptStatus =
  | "success"
  | "unsupported"
  | "error"

export type ApiCredentialTelemetryAttempt = {
  source: ApiCredentialTelemetryCapabilityMode | "models"
  endpoint: string
  status: ApiCredentialTelemetryAttemptStatus
  message?: string
}

export type ApiCredentialModelTelemetry = {
  count: number
  preview: string[]
}

export type ApiCredentialTelemetrySnapshot = {
  health: HealthStatus
  lastSyncTime: number
  lastSuccessTime?: number
  lastError?: string
  source?: ApiCredentialTelemetryCapabilityMode | "models"
  balanceUsd?: number
  todayCostUsd?: number
  todayRequests?: number
  todayTokens?: TokenUsage
  unlimitedQuota?: boolean
  totalUsedUsd?: number
  totalGrantedUsd?: number
  totalAvailableUsd?: number
  expiresAt?: number
  models?: ApiCredentialModelTelemetry
  attempts: ApiCredentialTelemetryAttempt[]
}

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
  telemetryConfig?: ApiCredentialTelemetryConfig
  telemetrySnapshot?: ApiCredentialTelemetrySnapshot
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
