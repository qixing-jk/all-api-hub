import type {
  ApiVerificationProbeId,
  ApiVerificationProbeStatus,
} from "~/services/verification/aiApiVerification"
import {
  API_VERIFICATION_MODES,
  API_VERIFICATION_PROBE_IDS,
  API_VERIFICATION_PROBE_STATUSES,
} from "~/services/verification/aiApiVerification"
import {
  API_VERIFICATION_HISTORY_STATUSES,
  API_VERIFICATION_HISTORY_TARGET_KINDS,
  API_VERIFICATION_RESULT_HISTORY_CONFIG_VERSION,
  type ApiVerificationHistoryConfig,
  type ApiVerificationHistorySummary,
  type ApiVerificationHistoryTarget,
  type PersistedApiVerificationProbeSummary,
} from "~/services/verification/verificationResultHistory/types"
import {
  deriveVerificationHistoryStatus,
  isApiVerificationApiType,
  serializeVerificationHistoryTarget,
} from "~/services/verification/verificationResultHistory/utils"

const KNOWN_PROBE_IDS = new Set<ApiVerificationProbeId>(
  Object.values(API_VERIFICATION_PROBE_IDS),
)

export const createDefaultConfig = (): ApiVerificationHistoryConfig => ({
  version: API_VERIFICATION_RESULT_HISTORY_CONFIG_VERSION,
  summaries: [],
  lastUpdated: Date.now(),
  lastOrphanSweepAt: 0,
})

/**
 * Create a detached copy of persisted history config data.
 */
export function cloneConfig(
  config: ApiVerificationHistoryConfig,
): ApiVerificationHistoryConfig {
  if (typeof structuredClone === "function") {
    return structuredClone(config)
  }
  return JSON.parse(JSON.stringify(config)) as ApiVerificationHistoryConfig
}

/** Detached copy of just the stored summaries. */
export function cloneSummaries(
  summaries: ApiVerificationHistorySummary[],
): ApiVerificationHistorySummary[] {
  if (typeof structuredClone === "function") {
    return structuredClone(summaries)
  }
  return JSON.parse(
    JSON.stringify(summaries),
  ) as ApiVerificationHistorySummary[]
}

/**
 * Normalize free-form persisted text into a compact single-line string.
 */
function sanitizeText(input: unknown, fallback = "") {
  if (typeof input !== "string") return fallback
  return input.replace(/\s+/g, " ").trim()
}

/**
 * Coerce a persisted timestamp into a positive integer epoch value.
 *
 * Missing or invalid values fall back to 0, never to the current time: a sweep
 * marker of 0 means "never swept", which keeps sweeps enabled for payloads
 * written before the marker existed.
 */
function coercePositiveTimestamp(input: unknown) {
  if (typeof input === "number" && Number.isFinite(input) && input > 0) {
    return Math.round(input)
  }
  return 0
}

/**
 * Coerce persisted timestamps into positive integer epoch values.
 */
function normalizeTimestamp(input: unknown) {
  if (typeof input === "number" && Number.isFinite(input) && input > 0) {
    return Math.round(input)
  }
  return Date.now()
}

/**
 * Narrow persisted aggregate status values to the supported stored variants.
 */
function isPersistedStatus(
  value: unknown,
): value is ApiVerificationHistorySummary["status"] {
  return (
    value === API_VERIFICATION_HISTORY_STATUSES.Pass ||
    value === API_VERIFICATION_HISTORY_STATUSES.Fail
  )
}

/**
 * Validate persisted probe status values before rehydrating summaries.
 */
function isProbeStatus(value: unknown): value is ApiVerificationProbeStatus {
  return Object.values(API_VERIFICATION_PROBE_STATUSES).includes(
    value as ApiVerificationProbeStatus,
  )
}

/**
 * Keep only serializable scalar probe summary params from persisted data.
 */
function coerceSummaryParams(raw: unknown) {
  if (!raw || typeof raw !== "object") return undefined

  const next: Record<string, string | number | boolean> = {}

  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
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
      next[trimmedKey] = sanitizeText(value)
    }
  }

  return Object.keys(next).length > 0 ? next : undefined
}

/**
 * Rehydrate a persisted verification target only when its identity is valid.
 */
function coerceTarget(raw: unknown): ApiVerificationHistoryTarget | null {
  if (!raw || typeof raw !== "object") return null

  const value = raw as Record<string, unknown>
  if (value.kind === API_VERIFICATION_HISTORY_TARGET_KINDS.Profile) {
    const profileId = sanitizeText(value.profileId)
    return profileId
      ? { kind: API_VERIFICATION_HISTORY_TARGET_KINDS.Profile, profileId }
      : null
  }

  if (value.kind === API_VERIFICATION_HISTORY_TARGET_KINDS.ProfileModel) {
    const profileId = sanitizeText(value.profileId)
    const modelId = sanitizeText(value.modelId)
    return profileId && modelId
      ? {
          kind: API_VERIFICATION_HISTORY_TARGET_KINDS.ProfileModel,
          profileId,
          modelId,
        }
      : null
  }

  if (value.kind === API_VERIFICATION_HISTORY_TARGET_KINDS.AccountModel) {
    const accountId = sanitizeText(value.accountId)
    const modelId = sanitizeText(value.modelId)
    return accountId && modelId
      ? {
          kind: API_VERIFICATION_HISTORY_TARGET_KINDS.AccountModel,
          accountId,
          modelId,
        }
      : null
  }

  return null
}

/**
 * Rehydrate a single persisted probe summary and discard invalid entries.
 */
function coerceProbeSummary(
  raw: unknown,
): PersistedApiVerificationProbeSummary | null {
  if (!raw || typeof raw !== "object") return null

  const value = raw as Record<string, unknown>
  const id = sanitizeText(value.id)
  if (!KNOWN_PROBE_IDS.has(id as ApiVerificationProbeId)) return null
  if (!isProbeStatus(value.status)) return null

  const summary = sanitizeText(value.summary)
  if (!summary) return null

  return {
    id: id as ApiVerificationProbeId,
    ...(value.mode === API_VERIFICATION_MODES.Streaming ||
    value.mode === API_VERIFICATION_MODES.NonStreaming
      ? { mode: value.mode }
      : {}),
    status: value.status,
    latencyMs:
      typeof value.latencyMs === "number" && Number.isFinite(value.latencyMs)
        ? Math.max(0, Math.round(value.latencyMs))
        : 0,
    summary,
    summaryKey: sanitizeText(value.summaryKey) || undefined,
    summaryParams: coerceSummaryParams(value.summaryParams),
  }
}

/**
 * Rehydrate a persisted verification summary with sanitized probe data.
 */
export function coerceHistorySummary(
  raw: unknown,
): ApiVerificationHistorySummary | null {
  if (!raw || typeof raw !== "object") return null

  const value = raw as Record<string, unknown>
  const target = coerceTarget(value.target)
  if (!target || !isApiVerificationApiType(value.apiType)) return null

  const probes = Array.isArray(value.probes)
    ? (value.probes
        .map((probe) => coerceProbeSummary(probe))
        .filter(Boolean) as PersistedApiVerificationProbeSummary[])
    : []
  if (probes.length === 0) return null

  const status = isPersistedStatus(value.status)
    ? value.status
    : deriveVerificationHistoryStatus(probes)

  return {
    target,
    targetKey: serializeVerificationHistoryTarget(target),
    status,
    verifiedAt: normalizeTimestamp(value.verifiedAt),
    apiType: value.apiType,
    resolvedModelId: sanitizeText(value.resolvedModelId) || undefined,
    probes,
  }
}

/**
 * Sanitize an unrecognized payload into the current config shape.
 *
 * This is the boundary check, run for payloads this build did not write: a
 * different schema version, a legacy payload, or a hand-edited value.
 */
export function sanitizeConfig(
  value: Record<string, unknown>,
): ApiVerificationHistoryConfig {
  const seenKeys = new Set<string>()
  const summaries = Array.isArray(value.summaries)
    ? value.summaries
        .map((summary) => coerceHistorySummary(summary))
        .filter((summary): summary is ApiVerificationHistorySummary => {
          if (!summary) return false
          if (seenKeys.has(summary.targetKey)) return false
          seenKeys.add(summary.targetKey)
          return true
        })
    : []

  return {
    version: API_VERIFICATION_RESULT_HISTORY_CONFIG_VERSION,
    summaries,
    lastUpdated: normalizeTimestamp(value.lastUpdated),
    lastOrphanSweepAt: coercePositiveTimestamp(value.lastOrphanSweepAt),
  }
}

/**
 * Accept a payload written by this build without walking every entry.
 *
 * The invariant that makes this safe: {@link VerificationResultHistoryStorageService.mutateConfig}
 * is the only writer and every summary it stores already passed
 * `coerceHistorySummary`, so a payload at the current version is sanitized by
 * construction and its target keys are unique. A payload at any other version
 * falls through to {@link sanitizeConfig}. The residual risk is a hand-edited or
 * corrupted current-version payload, which reaches the UI unsanitized instead of
 * being silently dropped.
 * @returns The config, or `null` when the payload needs the boundary check.
 */
export function coerceTrustedConfig(
  value: Record<string, unknown>,
): ApiVerificationHistoryConfig | null {
  if (value.version !== API_VERIFICATION_RESULT_HISTORY_CONFIG_VERSION) {
    return null
  }
  if (!Array.isArray(value.summaries)) return null
  if (
    typeof value.lastUpdated !== "number" ||
    !Number.isFinite(value.lastUpdated) ||
    value.lastUpdated <= 0
  ) {
    return null
  }

  return {
    version: API_VERIFICATION_RESULT_HISTORY_CONFIG_VERSION,
    summaries: value.summaries as ApiVerificationHistorySummary[],
    lastUpdated: value.lastUpdated,
    lastOrphanSweepAt: coercePositiveTimestamp(value.lastOrphanSweepAt),
  }
}
