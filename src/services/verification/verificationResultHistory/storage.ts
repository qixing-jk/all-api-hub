import { Storage } from "@plasmohq/storage"

import {
  API_VERIFICATION_HISTORY_STORAGE_KEYS,
  STORAGE_LOCKS,
} from "~/services/core/storageKeys"
import { withExtensionStorageWriteLock } from "~/services/core/storageWriteLock"
import type {
  ApiVerificationProbeId,
  ApiVerificationProbeStatus,
} from "~/services/verification/aiApiVerification"
import { apiVerificationProbeRegistry } from "~/services/verification/aiApiVerification/probeRegistry"

import {
  API_VERIFICATION_RESULT_HISTORY_CONFIG_VERSION,
  type ApiVerificationHistoryConfig,
  type ApiVerificationHistorySummary,
  type ApiVerificationHistoryTarget,
  type PersistedApiVerificationProbeSummary,
} from "./types"
import {
  deriveVerificationHistoryStatus,
  isApiVerificationApiType,
  serializeVerificationHistoryTarget,
} from "./utils"

const KNOWN_PROBE_IDS = new Set<ApiVerificationProbeId>(
  Object.keys(apiVerificationProbeRegistry) as ApiVerificationProbeId[],
)
const MAX_STORED_SUMMARIES = 500

const createDefaultConfig = (): ApiVerificationHistoryConfig => ({
  version: API_VERIFICATION_RESULT_HISTORY_CONFIG_VERSION,
  summaries: [],
  lastUpdated: Date.now(),
})

/**
 * Subscribe to local-storage writes affecting persisted verification summaries.
 */
export function subscribeToVerificationResultHistoryChanges(
  callback: () => void,
): () => void {
  const listener = (
    changes: Record<string, browser.storage.StorageChange>,
    areaName: string,
  ) => {
    if (areaName !== "local") return
    if (
      !changes[
        API_VERIFICATION_HISTORY_STORAGE_KEYS.VERIFICATION_RESULT_HISTORY
      ]
    ) {
      return
    }

    callback()
  }

  browser.storage.onChanged.addListener(listener)
  return () => browser.storage.onChanged.removeListener(listener)
}

/**
 *
 */
function cloneConfig(
  config: ApiVerificationHistoryConfig,
): ApiVerificationHistoryConfig {
  if (typeof structuredClone === "function") {
    return structuredClone(config)
  }
  return JSON.parse(JSON.stringify(config)) as ApiVerificationHistoryConfig
}

/**
 *
 */
function sanitizeText(input: unknown, fallback = "") {
  if (typeof input !== "string") return fallback
  return input.replace(/\s+/g, " ").trim()
}

/**
 *
 */
function normalizeTimestamp(input: unknown) {
  if (typeof input === "number" && Number.isFinite(input) && input > 0) {
    return Math.round(input)
  }
  return Date.now()
}

/**
 *
 */
function isPersistedStatus(value: unknown): value is "pass" | "fail" {
  return value === "pass" || value === "fail"
}

/**
 *
 */
function isProbeStatus(value: unknown): value is ApiVerificationProbeStatus {
  return value === "pass" || value === "fail" || value === "unsupported"
}

/**
 *
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
 *
 */
function coerceTarget(raw: unknown): ApiVerificationHistoryTarget | null {
  if (!raw || typeof raw !== "object") return null

  const value = raw as Record<string, unknown>
  if (value.kind === "profile") {
    const profileId = sanitizeText(value.profileId)
    return profileId ? { kind: "profile", profileId } : null
  }

  if (value.kind === "profile-model") {
    const profileId = sanitizeText(value.profileId)
    const modelId = sanitizeText(value.modelId)
    return profileId && modelId
      ? { kind: "profile-model", profileId, modelId }
      : null
  }

  if (value.kind === "account-model") {
    const accountId = sanitizeText(value.accountId)
    const modelId = sanitizeText(value.modelId)
    return accountId && modelId
      ? { kind: "account-model", accountId, modelId }
      : null
  }

  return null
}

/**
 *
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
 *
 */
function coerceHistorySummary(
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
 *
 */
function coerceConfig(raw: unknown): ApiVerificationHistoryConfig {
  if (!raw || typeof raw !== "object") {
    return createDefaultConfig()
  }

  const value = raw as Record<string, unknown>
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
  }
}

class VerificationResultHistoryStorageService {
  private storage: Storage

  constructor() {
    this.storage = new Storage({ area: "local" })
  }

  private async withStorageWriteLock<T>(work: () => Promise<T>): Promise<T> {
    return withExtensionStorageWriteLock(
      STORAGE_LOCKS.API_VERIFICATION_HISTORY,
      work,
    )
  }

  private async readConfig(): Promise<ApiVerificationHistoryConfig> {
    const raw = await this.storage.get(
      API_VERIFICATION_HISTORY_STORAGE_KEYS.VERIFICATION_RESULT_HISTORY,
    )
    return coerceConfig(raw)
  }

  private async saveConfig(next: ApiVerificationHistoryConfig): Promise<void> {
    await this.storage.set(
      API_VERIFICATION_HISTORY_STORAGE_KEYS.VERIFICATION_RESULT_HISTORY,
      next,
    )
  }

  async listSummaries(): Promise<ApiVerificationHistorySummary[]> {
    return cloneConfig(await this.readConfig()).summaries
  }

  async getLatestSummary(
    target: ApiVerificationHistoryTarget,
  ): Promise<ApiVerificationHistorySummary | null> {
    const targetKey = serializeVerificationHistoryTarget(target)
    const { summaries } = await this.readConfig()

    for (const summary of summaries) {
      if (summary.targetKey === targetKey) {
        return summary
      }
    }

    return null
  }

  async getLatestSummaries(
    targets: ApiVerificationHistoryTarget[],
  ): Promise<Record<string, ApiVerificationHistorySummary>> {
    const targetKeys = new Set(
      targets.map((target) => serializeVerificationHistoryTarget(target)),
    )
    if (targetKeys.size === 0) return {}

    const summaries = await this.listSummaries()
    return Object.fromEntries(
      summaries
        .filter((summary) => targetKeys.has(summary.targetKey))
        .map((summary) => [summary.targetKey, summary]),
    )
  }

  async upsertLatestSummary(
    summary: ApiVerificationHistorySummary,
  ): Promise<ApiVerificationHistorySummary> {
    const nextSummary = coerceHistorySummary(summary)
    if (!nextSummary) {
      throw new Error("Invalid verification history summary")
    }

    return this.withStorageWriteLock(async () => {
      const config = cloneConfig(await this.readConfig())
      const nextSummaries = [
        nextSummary,
        ...config.summaries.filter(
          (item) => item.targetKey !== nextSummary.targetKey,
        ),
      ].slice(0, MAX_STORED_SUMMARIES)

      await this.saveConfig({
        version: API_VERIFICATION_RESULT_HISTORY_CONFIG_VERSION,
        summaries: nextSummaries,
        lastUpdated: Date.now(),
      })

      return nextSummary
    })
  }

  async clearTarget(target: ApiVerificationHistoryTarget): Promise<boolean> {
    const targetKey = serializeVerificationHistoryTarget(target)

    return this.withStorageWriteLock(async () => {
      const config = cloneConfig(await this.readConfig())
      const nextSummaries = config.summaries.filter(
        (summary) => summary.targetKey !== targetKey,
      )
      if (nextSummaries.length === config.summaries.length) {
        return false
      }

      await this.saveConfig({
        version: API_VERIFICATION_RESULT_HISTORY_CONFIG_VERSION,
        summaries: nextSummaries,
        lastUpdated: Date.now(),
      })

      return true
    })
  }

  async clearAllData(): Promise<void> {
    await this.storage.remove(
      API_VERIFICATION_HISTORY_STORAGE_KEYS.VERIFICATION_RESULT_HISTORY,
    )
  }
}

export const verificationResultHistoryStorage =
  new VerificationResultHistoryStorageService()
