import type { VerificationGenerationMetrics } from "~/services/verification/aiApiVerification/generationMetrics"
import type {
  ApiVerificationApiType,
  ApiVerificationMode,
  ApiVerificationProbeId,
  ApiVerificationProbeStatus,
  ApiVerificationRequestProfile,
} from "~/services/verification/aiApiVerification/types"
import { API_VERIFICATION_PROBE_STATUSES } from "~/services/verification/aiApiVerification/types"
import {
  type DrawingVerificationOutcome,
  type PelicanExecutionMode,
} from "~/services/verification/modelQuality/constants"
import type { ContextCapacityReason } from "~/services/verification/modelQuality/contextCapacityConstants"
import type { ContextCounterInfo } from "~/services/verification/modelQuality/contextTokens"
import type { NeedleResult } from "~/services/verification/modelQuality/needleRun"

/**
 * Stored schema version.
 *
 * This is the only durable record of which writer produced a stored payload, and
 * therefore of whether its entries already passed the sanitizer. Readers trust a
 * payload at this exact version and run the boundary sanitizer on anything else,
 * so bump it whenever the stored shape or the sanitizing rules change: every
 * existing payload is then re-sanitized once on read and rewritten under the new
 * version before it is trusted. Context-capacity entries are independently
 * decoded on every read; adding optional capacity metadata does not rely on
 * this primary-summary fast path.
 */
export const API_VERIFICATION_RESULT_HISTORY_CONFIG_VERSION = 6

export const API_VERIFICATION_HISTORY_STATUSES = {
  Pass: API_VERIFICATION_PROBE_STATUSES.Pass,
  Fail: API_VERIFICATION_PROBE_STATUSES.Fail,
  Unverified: "unverified",
} as const

export type ApiVerificationHistoryDisplayStatus =
  (typeof API_VERIFICATION_HISTORY_STATUSES)[keyof typeof API_VERIFICATION_HISTORY_STATUSES]

export type PersistedApiVerificationStatus = Exclude<
  ApiVerificationHistoryDisplayStatus,
  typeof API_VERIFICATION_HISTORY_STATUSES.Unverified
>

export const API_VERIFICATION_HISTORY_TARGET_KINDS = {
  Profile: "profile",
  ProfileModel: "profile-model",
  AccountModel: "account-model",
} as const

export type ApiVerificationHistoryTarget =
  | {
      kind: typeof API_VERIFICATION_HISTORY_TARGET_KINDS.Profile
      profileId: string
    }
  | {
      kind: typeof API_VERIFICATION_HISTORY_TARGET_KINDS.ProfileModel
      profileId: string
      modelId: string
    }
  | {
      kind: typeof API_VERIFICATION_HISTORY_TARGET_KINDS.AccountModel
      accountId: string
      modelId: string
    }

export type PersistedApiVerificationSummaryParams = Record<
  string,
  string | number | boolean
>

export type PersistedApiVerificationProbeSummary = {
  id: ApiVerificationProbeId
  status: ApiVerificationProbeStatus
  metrics?: VerificationGenerationMetrics[]
  latencyMs: number
  mode?: ApiVerificationMode
  requestProfileEnhanced?: boolean
  requestProfile?: ApiVerificationRequestProfile
  summary: string
  summaryKey?: string
  summaryParams?: PersistedApiVerificationSummaryParams
}

export type ApiVerificationHistorySummary = {
  target: ApiVerificationHistoryTarget
  targetKey: string
  status: PersistedApiVerificationStatus
  verifiedAt: number
  apiType: ApiVerificationApiType
  resolvedModelId?: string
  probes: PersistedApiVerificationProbeSummary[]
}

/** Drawing completion is an artifact outcome, never a compatibility pass/fail. */
export type DrawingVerificationSummary = {
  target: ApiVerificationHistoryTarget
  targetKey: string
  verifiedAt: number
  apiType: ApiVerificationApiType
  modelId: string
  metrics?: VerificationGenerationMetrics[]
  latencyMs: number
  executionMode: PelicanExecutionMode
  outcome: DrawingVerificationOutcome
  steps: number
  calls: number
  files: number
}

export type ApiVerificationHistoryConfig = {
  version: number
  summaries: ApiVerificationHistorySummary[]
  drawingSummaries?: DrawingVerificationSummary[]
  contextSummaries?: ContextCapacitySummary[]
  needleSummaries?: NeedleSummary[]
  lastUpdated: number
  /**
   * When the last complete orphan sweep finished. `0` means "never swept", which
   * keeps sweeps enabled for payloads written before this field existed.
   */
  lastOrphanSweepAt: number
}

/** Persisted diagnostic values; keep these literals stable across readers and writers. */
export const CONTEXT_CAPACITY_INCONCLUSIVE_REASONS = {
  Timeout: "timeout",
  EmptyResponse: "empty-response",
  Interrupted: "interrupted",
} as const

/** Latest capacity observation; never contains credentials, prompts or responses. */
export type ContextCapacitySummary = {
  latencyMs?: number
  mode?: ApiVerificationMode
  target?: ApiVerificationHistoryTarget
  targetKey: string
  scopeKey: string
  /** Digest of observable account/key configuration; never proves a hidden secret. */
  inventoryKey?: string
  verifiedAt: number
  apiType: ApiVerificationApiType
  modelId: string
  lowerBoundTokens: number
  /** Counter evidence is absent only when no measurement was produced. */
  counter?: Pick<ContextCounterInfo, "encoding" | "estimated">
  /** Metadata expectation captured at test time. */
  declaredContext?: number
  upperBoundTokens?: number
  reason: ContextCapacityReason
  inconclusiveReason?: (typeof CONTEXT_CAPACITY_INCONCLUSIVE_REASONS)[keyof typeof CONTEXT_CAPACITY_INCONCLUSIVE_REASONS]
  requests: number
  outputLimited: boolean
}

/** Same request scope as capacity history, independent retrieval observations. */
export type NeedleSummary = {
  target?: ApiVerificationHistoryTarget
  targetKey: string
  scopeKey: string
  verifiedAt: number
  result: NeedleResult
}
