import { CURRENCIES } from "~/constants/money"
import type { AccountRuntimeKeyLocator } from "~/services/accounts/keys/accountRuntimeKeys"
import type { Asset, MeasurementUnit } from "~/services/amounts/assets"
import type {
  BalancePosition,
  BalanceSnapshot,
  EvidenceRef,
  UsageScope,
} from "~/services/amounts/balance"
import type { BudgetConstraint } from "~/services/amounts/budgets"
import {
  MEASUREMENT_UNIT_KINDS,
  type ASSET_KINDS,
  type FINANCIAL_COVERAGE,
  type OBSERVATION_STATUSES,
} from "~/services/amounts/financialConstants"
import type { ApiVerificationApiType } from "~/services/verification/aiApiVerification"
import type { HealthStatus } from "~/types"

export const TELEMETRY_FINANCIAL_ROLES = {
  Available: "available",
  BudgetRemaining: "budget-remaining",
} as const

export const TELEMETRY_FINANCIAL_SCOPES = {
  Credential: "credential",
  Unknown: "unknown",
} as const

/**
 * Current schema version for the API credential profiles storage payload.
 */
export const API_CREDENTIAL_PROFILES_CONFIG_VERSION = 8

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
  OpenCodeGoUsage: "openCodeGoUsage",
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
  OpenCodeGoUsage: "openCodeGoUsage",
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

export type ApiCredentialTelemetryFinancialMapping = {
  asset: Exclude<Asset, { kind: typeof ASSET_KINDS.Unknown }>
  role: (typeof TELEMETRY_FINANCIAL_ROLES)[keyof typeof TELEMETRY_FINANCIAL_ROLES]
  scope: (typeof TELEMETRY_FINANCIAL_SCOPES)[keyof typeof TELEMETRY_FINANCIAL_SCOPES]
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
  financialMapping?: ApiCredentialTelemetryFinancialMapping
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

/**
 * Legacy English health-reason strings persisted by earlier telemetry builds.
 * Kept as a shared constant so UI localization can still match old snapshots.
 */
export const LEGACY_INSUFFICIENT_BALANCE_REASONS: readonly string[] = [
  "Provider account is unavailable",
  "Provider balance is insufficient for API calls",
]

/** Runtime discriminators for normalized telemetry fact units and semantics. */
export const API_CREDENTIAL_TELEMETRY_FACT_UNITS = {
  kinds: {
    Money: MEASUREMENT_UNIT_KINDS.Money,
    Quota: MEASUREMENT_UNIT_KINDS.Quota,
    Count: MEASUREMENT_UNIT_KINDS.Count,
    Percent: MEASUREMENT_UNIT_KINDS.Percent,
  },
  currencies: { Usd: CURRENCIES.USD },
  codes: {
    UsdEquivalent: "usd-equivalent",
    GlmCredit: "glm-credit",
    ProviderQuota: "provider-quota",
    Requests: "requests",
    Tokens: "tokens",
  },
  labels: {
    UsdEquivalent: "USD-equivalent budget",
    GlmCredit: "GLM credits",
    ProviderQuota: "Provider quota",
  },
  semantics: {
    Cash: "cash",
    ProviderWallet: "provider-wallet",
    BudgetEquivalent: "budget-equivalent",
    Legacy: "legacy",
  },
} as const

/** Transient provider hints retained while adapting earlier quota payloads. */
export const TELEMETRY_QUOTA_UNIT_HINTS = {
  Percent: "percent",
  Provider: "provider",
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
  amount?: number | string
  currency: string
  grantedAmount?: number | string
  toppedUpAmount?: number | string
  isAvailable?: boolean
}

export const API_CREDENTIAL_TELEMETRY_QUOTA_WINDOW_TYPES = {
  FiveHour: "fiveHour",
  Weekly: "weekly",
  Monthly: "monthly",
  Total: "total",
} as const

export type ApiCredentialTelemetryQuotaWindowType =
  (typeof API_CREDENTIAL_TELEMETRY_QUOTA_WINDOW_TYPES)[keyof typeof API_CREDENTIAL_TELEMETRY_QUOTA_WINDOW_TYPES]

/** Provider-native quota window normalized to remaining-capacity semantics. */
export type ApiCredentialTelemetryQuotaWindow = {
  type: ApiCredentialTelemetryQuotaWindowType
  /** @deprecated Transient provider unit hint used while adapting v5 payloads. */
  unit?: (typeof TELEMETRY_QUOTA_UNIT_HINTS)[keyof typeof TELEMETRY_QUOTA_UNIT_HINTS]
  used?: number
  limit?: number
  remaining?: number
  percentRemaining?: number
  resetTime?: number
}

/** Time-window quota facts shared by GLM and Kimi providers. */
export type ApiCredentialTelemetryQuota = {
  windows: ApiCredentialTelemetryQuotaWindow[]
  membershipLevel?: string
}

/** Compatibility export; units are owned by the shared Amount module. */
export type ApiCredentialTelemetryUnit = MeasurementUnit

export type ApiCredentialTelemetryAmount = {
  status?: (typeof OBSERVATION_STATUSES)["Known" | "Stale"]
  value: number | string
  unit:
    ApiCredentialTelemetryUnit | { kind: typeof MEASUREMENT_UNIT_KINDS.Unknown }
  source?: EvidenceRef
  scope?: UsageScope
  observedAt?: number
  window?: { start: number; end: number; timeZone: string }
  coverage?: (typeof FINANCIAL_COVERAGE)[keyof typeof FINANCIAL_COVERAGE]
}

export type ApiCredentialTelemetryBalanceFact = {
  position?: BalancePosition
  budget?: BudgetConstraint
  components?: ApiCredentialTelemetryBalanceFact[]
  amount: number
  unit:
    | Extract<
        ApiCredentialTelemetryUnit,
        { kind: (typeof MEASUREMENT_UNIT_KINDS)["Money" | "Quota" | "Crypto"] }
      >
    | { kind: typeof MEASUREMENT_UNIT_KINDS.Unknown }
  semantics: (typeof API_CREDENTIAL_TELEMETRY_FACT_UNITS.semantics)[keyof typeof API_CREDENTIAL_TELEMETRY_FACT_UNITS.semantics]
  grantedAmount?: number
  toppedUpAmount?: number
  isAvailable?: boolean
  scope?: UsageScope
  observedAt?: number
  status?: (typeof OBSERVATION_STATUSES)[keyof typeof OBSERVATION_STATUSES]
}

export type ApiCredentialTelemetryQuotaWindowFact = {
  status?: (typeof OBSERVATION_STATUSES)["Known" | "Stale"]
  type: ApiCredentialTelemetryQuotaWindowType
  unit: Extract<
    ApiCredentialTelemetryUnit,
    { kind: (typeof MEASUREMENT_UNIT_KINDS)["Quota" | "Percent"] }
  >
  used?: number
  limit?: number
  remaining?: number
  remainingPercent?: number
  resetTime?: number
  source?: EvidenceRef
  scope?: UsageScope
  observedAt?: number
}

/** Token counters normalized from provider telemetry payloads. */
export type ApiCredentialTelemetryTokenUsage = {
  upload?: number
  download?: number
  total?: number
}

export type ApiCredentialTelemetryUsageFacts = {
  todayCost?: ApiCredentialTelemetryAmount
  todayRequests?: ApiCredentialTelemetryAmount
  todayTokens?: {
    upload?: number
    download?: number
    total?: number
    unit: Extract<
      ApiCredentialTelemetryUnit,
      { kind: typeof MEASUREMENT_UNIT_KINDS.Count }
    >
  }
  totalUsed?: ApiCredentialTelemetryAmount
  totalGranted?: ApiCredentialTelemetryAmount
  totalAvailable?: ApiCredentialTelemetryAmount
  expiresAt?: number
  unlimited?: boolean
}

export type ApiCredentialTelemetryFacts = {
  balanceSnapshot?: BalanceSnapshot
  budgets?: BudgetConstraint[]
  /** Read-only compatibility for snapshots predating canonical financial facts. */
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
  schemaVersion?: 2
  health: HealthStatus
  lastSyncTime: number
  lastSuccessTime?: number
  lastError?: string
  source?: ApiCredentialTelemetrySource
  /** Canonical unit-aware product facts. */
  facts?: ApiCredentialTelemetryFacts
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
  /** Optional request overrides. Values may be secrets and must never be logged. */
  requestHeaders?: Record<string, string>
  id: string
  name: string
  apiType: ApiVerificationApiType
  /** Protocol root, without the version segment a consumer adds for itself. */
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
   * Optional HTTP(S) URL of the page where the user found this credential.
   *
   * User-maintained metadata (e.g. a forum post or shared document), not an
   * automated provenance claim. Kept as the full URL so the user can revisit it.
   */
  sourceUrl?: string
  /**
   * Optional user-maintained credential expiration date, stored as a local
   * day-level timestamp from the API credential library form.
   */
  expiresAt?: number
  telemetryConfig?: ApiCredentialTelemetryConfig
  telemetrySnapshot?: ApiCredentialTelemetrySnapshot
  /** Cross-context admission order, independent of request completion time. */
  telemetryRefreshGeneration?: number
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
