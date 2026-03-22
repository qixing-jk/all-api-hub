import type {
  ApiVerificationApiType,
  ApiVerificationProbeId,
  ApiVerificationProbeStatus,
} from "~/services/verification/aiApiVerification"

export const API_VERIFICATION_RESULT_HISTORY_CONFIG_VERSION = 1

export type ApiVerificationHistoryDisplayStatus = "pass" | "fail" | "unverified"

export type PersistedApiVerificationStatus = Exclude<
  ApiVerificationHistoryDisplayStatus,
  "unverified"
>

export type ApiVerificationHistoryTarget =
  | {
      kind: "profile"
      profileId: string
    }
  | {
      kind: "profile-model"
      profileId: string
      modelId: string
    }
  | {
      kind: "account-model"
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
  latencyMs: number
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

export type ApiVerificationHistoryConfig = {
  version: number
  summaries: ApiVerificationHistorySummary[]
  lastUpdated: number
}
