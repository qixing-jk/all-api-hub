import {
  API_TYPES,
  type ApiVerificationApiType,
  type ApiVerificationProbeResult,
} from "~/services/verification/aiApiVerification"

import type {
  ApiVerificationHistorySummary,
  ApiVerificationHistoryTarget,
  PersistedApiVerificationProbeSummary,
  PersistedApiVerificationStatus,
  PersistedApiVerificationSummaryParams,
} from "./types"

const FALLBACK_SUMMARY_MAX_LENGTH = 240
const FALLBACK_PARAM_STRING_MAX_LENGTH = 120

/**
 *
 */
function sanitizeText(input: string, maxLength: number) {
  const normalized = input.replace(/\s+/g, " ").trim()
  if (normalized.length <= maxLength) return normalized
  return `${normalized.slice(0, maxLength - 3)}...`
}

/**
 *
 */
function sanitizeSummaryParams(
  input: Record<string, unknown> | undefined,
): PersistedApiVerificationSummaryParams | undefined {
  if (!input) return undefined

  const next: PersistedApiVerificationSummaryParams = {}

  for (const [key, value] of Object.entries(input)) {
    const trimmedKey = key.trim()
    if (!trimmedKey) continue

    if (
      typeof value === "boolean" ||
      (typeof value === "number" && Number.isFinite(value))
    ) {
      next[trimmedKey] = value
      continue
    }

    if (typeof value === "string" && value.trim()) {
      next[trimmedKey] = sanitizeText(value, FALLBACK_PARAM_STRING_MAX_LENGTH)
    }
  }

  return Object.keys(next).length > 0 ? next : undefined
}

/**
 *
 */
function extractResolvedModelId(
  results: ApiVerificationProbeResult[],
  preferredModelId?: string,
) {
  const trimmedPreferred = preferredModelId?.trim()
  if (trimmedPreferred) return trimmedPreferred

  const modelsResult = results.find((result) => result.id === "models")
  if (!modelsResult?.output || typeof modelsResult.output !== "object") {
    return undefined
  }

  const output = modelsResult.output as Record<string, unknown>
  if (
    typeof output.suggestedModelId === "string" &&
    output.suggestedModelId.trim()
  ) {
    return output.suggestedModelId.trim()
  }

  if (Array.isArray(output.modelIdsPreview)) {
    const firstModel = output.modelIdsPreview.find(
      (value): value is string =>
        typeof value === "string" && value.trim().length > 0,
    )
    return firstModel?.trim()
  }

  return undefined
}

/**
 *
 */
export function createProfileVerificationHistoryTarget(profileId: string) {
  return {
    kind: "profile",
    profileId: profileId.trim(),
  } satisfies ApiVerificationHistoryTarget
}

/**
 *
 */
export function createProfileModelVerificationHistoryTarget(
  profileId: string,
  modelId: string,
) {
  return {
    kind: "profile-model",
    profileId: profileId.trim(),
    modelId: modelId.trim(),
  } satisfies ApiVerificationHistoryTarget
}

/**
 *
 */
export function createAccountModelVerificationHistoryTarget(
  accountId: string,
  modelId: string,
) {
  return {
    kind: "account-model",
    accountId: accountId.trim(),
    modelId: modelId.trim(),
  } satisfies ApiVerificationHistoryTarget
}

/**
 *
 */
export function serializeVerificationHistoryTarget(
  target: ApiVerificationHistoryTarget,
) {
  if (target.kind === "profile") {
    return `profile:${target.profileId}`
  }

  if (target.kind === "profile-model") {
    return `profile:${target.profileId}:model:${target.modelId}`
  }

  return `account:${target.accountId}:model:${target.modelId}`
}

/**
 *
 */
export function isApiVerificationApiType(
  value: unknown,
): value is ApiVerificationApiType {
  return (
    typeof value === "string" &&
    (Object.values(API_TYPES) as string[]).includes(value)
  )
}

/**
 *
 */
export function deriveVerificationHistoryStatus(
  results: Pick<ApiVerificationProbeResult, "status">[],
): PersistedApiVerificationStatus {
  return results.some((result) => result.status === "fail") ? "fail" : "pass"
}

/**
 *
 */
export function toPersistedProbeSummary(
  result: ApiVerificationProbeResult,
): PersistedApiVerificationProbeSummary {
  return {
    id: result.id,
    status: result.status,
    latencyMs:
      typeof result.latencyMs === "number" && Number.isFinite(result.latencyMs)
        ? Math.max(0, Math.round(result.latencyMs))
        : 0,
    summary: sanitizeText(result.summary || "", FALLBACK_SUMMARY_MAX_LENGTH),
    summaryKey: result.summaryKey?.trim() || undefined,
    summaryParams: sanitizeSummaryParams(result.summaryParams),
  }
}

/**
 *
 */
export function createVerificationHistorySummary(params: {
  target: ApiVerificationHistoryTarget
  apiType: ApiVerificationApiType
  results: ApiVerificationProbeResult[]
  preferredModelId?: string
  verifiedAt?: number
}): ApiVerificationHistorySummary | null {
  const results = params.results.filter(Boolean)
  if (results.length === 0) return null

  const verifiedAt =
    typeof params.verifiedAt === "number" && Number.isFinite(params.verifiedAt)
      ? Math.max(0, Math.round(params.verifiedAt))
      : Date.now()

  return {
    target: params.target,
    targetKey: serializeVerificationHistoryTarget(params.target),
    status: deriveVerificationHistoryStatus(results),
    verifiedAt,
    apiType: params.apiType,
    resolvedModelId: extractResolvedModelId(results, params.preferredModelId),
    probes: results.map(toPersistedProbeSummary),
  }
}
