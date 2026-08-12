import type {
  ApiVerificationApiType,
  ApiVerificationProbeId,
  ApiVerificationProbeStatus,
} from "~/services/verification/aiApiVerification"
import { API_VERIFICATION_PROBE_STATUSES } from "~/services/verification/aiApiVerification"

export const API_VERIFICATION_RESULT_HISTORY_CONFIG_VERSION = 1

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
