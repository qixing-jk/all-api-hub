import type { AccountRuntimeKeyLocator } from "~/services/accounts/accountRuntimeKeys"
import type { ApiVerificationApiType } from "~/services/verification/aiApiVerification"
import type { HealthStatus, TokenUsage } from "~/types"

/**
 * Current schema version for the API credential profiles storage payload.
 */
export const API_CREDENTIAL_PROFILES_CONFIG_VERSION = 6

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
  GlmQuota: "glmQuota",
  KimiQuota: "kimiQuota",
  KimiOpenPlatformBalance: "kimiOpenPlatformBalance",
  OpenAiBilling: "openaiBilling",
  NewApiTokenUsage: "newApiTokenUsage",
  Sub2ApiUsage: "sub2apiUsage",
  CustomReadOnlyEndpoint: "customReadOnlyEndpoint",
} as const

export type ApiCredentialTelemetryCapabilityMode =
  (typeof API_CREDENTIAL_TELEMETRY_MODES)[keyof typeof API_CREDENTIAL_TELEMETRY_MODES]

export const API_CREDENTIAL_TELEMETRY_SOURCES = {
  Models: "models",
  DeepSeekBalance: "deepSeekBalance",
  GlmQuota: "glmQuota",
  KimiQuota: "kimiQuota",
  KimiOpenPlatformBalance: "kimiOpenPlatformBalance",
  OpenAiBilling: "openaiBilling",
  NewApiTokenUsage: "newApiTokenUsage",
  Sub2ApiUsage: "sub2apiUsage",
  CustomReadOnlyEndpoint: "customReadOnlyEndpoint",
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

/** Stable product-owned reasons for telemetry health warnings. */
export const API_CREDENTIAL_TELEMETRY_HEALTH_REASONS = {
  InsufficientBalance: "insufficient-balance",
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

export const API_CREDENTIAL_TELEMETRY_QUOTA_WINDOW_TYPES = {
  FiveHour: "fiveHour",
  Weekly: "weekly",
  Total: "total",
} as const

export type ApiCredentialTelemetryQuotaWindowType =
  (typeof API_CREDENTIAL_TELEMETRY_QUOTA_WINDOW_TYPES)[keyof typeof API_CREDENTIAL_TELEMETRY_QUOTA_WINDOW_TYPES]

/** Provider-native quota window normalized to remaining-capacity semantics. */
export type ApiCredentialTelemetryQuotaWindow = {
  type: ApiCredentialTelemetryQuotaWindowType
  /** @deprecated Transient provider unit hint used while adapting v5 payloads. */
  unit?: "percent" | "provider"
  used: number
  limit: number
  remaining: number
  percentRemaining: number
  resetTime?: number
}

/** Time-window quota facts shared by GLM and Kimi providers. */
export type ApiCredentialTelemetryQuota = {
  windows: ApiCredentialTelemetryQuotaWindow[]
  membershipLevel?: string
}

export type ApiCredentialTelemetryUnit =
  | {
      kind: "money"
      currency: string
      decimalPlaces: number
    }
  | {
      kind: "quota"
      code: string
      label: string
    }
  | {
      kind: "count"
      code: string
    }
  | {
      kind: "percent"
    }

export type ApiCredentialTelemetryAmount = {
  value: number
  unit: ApiCredentialTelemetryUnit
}

export type ApiCredentialTelemetryBalanceFact = {
  amount: number
  unit: Extract<ApiCredentialTelemetryUnit, { kind: "money" | "quota" }>
  semantics: "cash" | "provider-wallet" | "budget-equivalent" | "legacy"
  grantedAmount?: number
  toppedUpAmount?: number
  isAvailable?: boolean
}

export type ApiCredentialTelemetryQuotaWindowFact = {
  type: ApiCredentialTelemetryQuotaWindowType
  unit: Extract<ApiCredentialTelemetryUnit, { kind: "quota" | "percent" }>
  used?: number
  limit?: number
  remaining?: number
  remainingPercent: number
  resetTime?: number
}

export type ApiCredentialTelemetryUsageFacts = {
  todayCost?: ApiCredentialTelemetryAmount
  todayRequests?: ApiCredentialTelemetryAmount
  todayTokens?: {
    upload: number
    download: number
    unit: Extract<ApiCredentialTelemetryUnit, { kind: "count" }>
  }
  totalUsed?: ApiCredentialTelemetryAmount
  totalGranted?: ApiCredentialTelemetryAmount
  totalAvailable?: ApiCredentialTelemetryAmount
  expiresAt?: number
  unlimited?: boolean
}

export type ApiCredentialTelemetryFacts = {
  balances?: ApiCredentialTelemetryBalanceFact[]
  quota?: {
    windows: ApiCredentialTelemetryQuotaWindowFact[]
    membershipLevel?: string
  }
  usage?: ApiCredentialTelemetryUsageFacts
  models?: ApiCredentialModelTelemetry
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
  /** Canonical v6 product facts. New snapshots always populate this field. */
  facts?: ApiCredentialTelemetryFacts
  /** @deprecated Legacy v5 flat balance field; only used during migration. */
  balance?: ApiCredentialTelemetryBalance
  /** @deprecated Legacy v5 flat quota field; only used during migration. */
  quota?: ApiCredentialTelemetryQuota
  /** @deprecated Legacy v5 fields; use facts instead. */
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
