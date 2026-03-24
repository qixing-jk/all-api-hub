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
 * Normalizes free-form summary text and bounds the stored length.
 * @param input - Raw text captured from a probe result or fallback message.
 * @param maxLength - Maximum stored length after normalization.
 * @returns Sanitized text that fits within the requested length budget.
 */
function sanitizeText(input: string, maxLength: number) {
  const normalized = input.replace(/\s+/g, " ").trim()
  if (maxLength <= 0) return ""
  if (normalized.length <= maxLength) return normalized
  if (maxLength <= 3) {
    return "...".slice(0, maxLength)
  }

  const truncateLength = Math.max(0, maxLength - 3)
  return `${normalized.slice(0, truncateLength)}...`
}

/**
 * Keeps only primitive summary params that are safe to persist.
 * @param input - Optional summary params attached to a probe result.
 * @returns A sanitized params record or `undefined` when nothing remains.
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
 * Derives the model id represented by a verification run.
 * @param results - Probe results collected for a verification session.
 * @param preferredModelId - Explicit model id chosen by the caller, if any.
 * @returns The resolved model id that should be stored with the history summary.
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
 * Trims persisted target identifiers and rejects empty values.
 * @param value - Raw target identifier provided by the caller.
 * @returns The trimmed identifier or `null` when it is empty.
 */
function sanitizeTargetId(value: string) {
  const trimmedValue = value.trim()
  return trimmedValue || null
}

/**
 * Builds a profile-scoped verification history target.
 * @param profileId - Stored profile identifier.
 * @returns A sanitized target or `null` when the identifier is empty.
 */
export function createProfileVerificationHistoryTarget(profileId: string) {
  const sanitizedProfileId = sanitizeTargetId(profileId)
  if (!sanitizedProfileId) return null

  return {
    kind: "profile",
    profileId: sanitizedProfileId,
  } satisfies ApiVerificationHistoryTarget
}

/**
 * Builds a profile-and-model verification history target.
 * @param profileId - Stored profile identifier.
 * @param modelId - Model identifier currently being verified.
 * @returns A sanitized target or `null` when either identifier is empty.
 */
export function createProfileModelVerificationHistoryTarget(
  profileId: string,
  modelId: string,
) {
  const sanitizedProfileId = sanitizeTargetId(profileId)
  const sanitizedModelId = sanitizeTargetId(modelId)
  if (!sanitizedProfileId || !sanitizedModelId) return null

  return {
    kind: "profile-model",
    profileId: sanitizedProfileId,
    modelId: sanitizedModelId,
  } satisfies ApiVerificationHistoryTarget
}

/**
 * Builds an account-and-model verification history target.
 * @param accountId - Stored account identifier.
 * @param modelId - Model identifier currently being verified.
 * @returns A sanitized target or `null` when either identifier is empty.
 */
export function createAccountModelVerificationHistoryTarget(
  accountId: string,
  modelId: string,
) {
  const sanitizedAccountId = sanitizeTargetId(accountId)
  const sanitizedModelId = sanitizeTargetId(modelId)
  if (!sanitizedAccountId || !sanitizedModelId) return null

  return {
    kind: "account-model",
    accountId: sanitizedAccountId,
    modelId: sanitizedModelId,
  } satisfies ApiVerificationHistoryTarget
}

/**
 * Serializes a history target into its stable storage key.
 * @param target - Verification history target to serialize.
 * @returns The stable key used for persistence and lookup.
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
 * Validates that an unknown value is a supported verification API type.
 * @param value - Arbitrary runtime value to validate.
 * @returns `true` when the value matches a known API type.
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
 * Collapses per-probe statuses into the persisted overall verification status.
 * @param results - Probe results or summaries with a `status` field.
 * @returns `"fail"` when any probe failed, otherwise `"pass"`.
 */
export function deriveVerificationHistoryStatus(
  results: Pick<ApiVerificationProbeResult, "status">[],
): PersistedApiVerificationStatus {
  return results.some((result) => result.status === "fail") ? "fail" : "pass"
}

/**
 * Converts a probe result into its persisted summary form.
 * @param result - Probe result to sanitize for storage.
 * @returns The persisted probe summary without transient diagnostics.
 */
function toPersistedProbeSummary(
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
 * Creates a sanitized verification history summary from probe results.
 * @param params - Verification history inputs for a completed run.
 * @param params.target - Stable verification target for the stored summary.
 * @param params.apiType - API family used by the verification run.
 * @param params.results - Completed probe results to sanitize for storage.
 * @param params.preferredModelId - Explicit model id selected by the caller.
 * @param params.verifiedAt - Optional timestamp to persist for the summary.
 * @returns The persisted summary or `null` when there are no completed results.
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
