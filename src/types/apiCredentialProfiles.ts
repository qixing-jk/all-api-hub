import type { AccountRuntimeKeyLocator } from "~/services/accounts/accountRuntimeKeys"
import type { ApiVerificationApiType } from "~/services/verification/aiApiVerification"
import type { HealthStatus, TokenUsage } from "~/types"

/**
 * Current schema version for the API credential profiles storage payload.
 */
export const API_CREDENTIAL_PROFILES_CONFIG_VERSION = 5

export const API_CREDENTIAL_PROFILE_LINK_STATES = {
  Active: "active",
  NeedsConfirmation: "needs-confirmation",
} as const

export type ApiCredentialProfileLinkState =
  (typeof API_CREDENTIAL_PROFILE_LINK_STATES)[keyof typeof API_CREDENTIAL_PROFILE_LINK_STATES]

export const API_CREDENTIAL_PROFILE_LINK_SOURCES = {
  CreationResponse: "creation-response",
  ResolvedRuntimeKey: "resolved-runtime-key",
  User: "user",
} as const

export type ApiCredentialProfileLinkSource =
  (typeof API_CREDENTIAL_PROFILE_LINK_SOURCES)[keyof typeof API_CREDENTIAL_PROFILE_LINK_SOURCES]

/** Explicit local association between one credential and one account runtime key. */
export type ApiCredentialProfileLink = {
  id: string
  profileId: string
  locator: AccountRuntimeKeyLocator
  state: ApiCredentialProfileLinkState
  linkedBy: ApiCredentialProfileLinkSource
  createdAt: number
  updatedAt: number
}

/** Merge-safe deletion marker for a credential association. */
export type ApiCredentialProfileLinkTombstone = {
  id: string
  deletedAt: number
}

export const API_CREDENTIAL_TELEMETRY_MODES = {
  Disabled: "disabled",
  Auto: "auto",
  DeepSeekBalance: "deepSeekBalance",
  OpenAiBilling: "openaiBilling",
  NewApiTokenUsage: "newApiTokenUsage",
  Sub2ApiUsage: "sub2apiUsage",
  CustomReadOnlyEndpoint: "customReadOnlyEndpoint",
} as const

export type ApiCredentialTelemetryCapabilityMode =
  (typeof API_CREDENTIAL_TELEMETRY_MODES)[keyof typeof API_CREDENTIAL_TELEMETRY_MODES]

export const API_CREDENTIAL_TELEMETRY_SOURCES = {
  ...API_CREDENTIAL_TELEMETRY_MODES,
  Models: "models",
} as const

export type ApiCredentialTelemetrySource =
  (typeof API_CREDENTIAL_TELEMETRY_SOURCES)[keyof typeof API_CREDENTIAL_TELEMETRY_SOURCES]

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
   * Root-relative path or absolute HTTP(S) URL for a read-only endpoint.
   */
  endpoint: string
  /**
   * Optional dedicated Bearer token stored in extension local storage.
   * Same-origin requests fall back to the profile API key; cross-origin
   * requests remain unauthenticated when this is omitted. Never log it.
   */
  bearerToken?: string
  jsonPaths: ApiCredentialTelemetryJsonPathMap
}

export type ApiCredentialTelemetryConfig = {
  mode: ApiCredentialTelemetryCapabilityMode
  customEndpoint?: ApiCredentialTelemetryCustomEndpoint
}

export const API_CREDENTIAL_TELEMETRY_CAPABILITY_MODES = Object.values(
  API_CREDENTIAL_TELEMETRY_MODES,
)

export const DEFAULT_API_CREDENTIAL_TELEMETRY_CONFIG: ApiCredentialTelemetryConfig =
  {
    mode: API_CREDENTIAL_TELEMETRY_MODES.Auto,
  }

export const API_CREDENTIAL_TELEMETRY_ATTEMPT_STATUSES = {
  Success: "success",
  Unsupported: "unsupported",
  Error: "error",
} as const

export type ApiCredentialTelemetryAttemptStatus =
  (typeof API_CREDENTIAL_TELEMETRY_ATTEMPT_STATUSES)[keyof typeof API_CREDENTIAL_TELEMETRY_ATTEMPT_STATUSES]

export type ApiCredentialTelemetryAttempt = {
  source: ApiCredentialTelemetrySource
  endpoint: string
  status: ApiCredentialTelemetryAttemptStatus
  message?: string
}

/** Provider-native balance facts whose currency is not necessarily USD. */
export type ApiCredentialTelemetryBalance = {
  amount: number
  currency: string
  grantedAmount?: number
  toppedUpAmount?: number
  isAvailable?: boolean
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
  source?: ApiCredentialTelemetrySource
  balance?: ApiCredentialTelemetryBalance
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
  /**
   * Optional user-maintained credential expiration date, stored as a local
   * day-level timestamp from the API credential library form.
   */
  expiresAt?: number
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
  links: ApiCredentialProfileLink[]
  linkTombstones: ApiCredentialProfileLinkTombstone[]
  lastUpdated: number
}
