import { Storage } from "@plasmohq/storage"

import { accountConfigStore } from "~/services/accounts/accountStorage/accountConfigStore"
import { apiCredentialProfilesStorage } from "~/services/apiCredentialProfiles/apiCredentialProfilesStorage"
import {
  API_VERIFICATION_HISTORY_STORAGE_KEYS,
  STORAGE_LOCKS,
} from "~/services/core/storageKeys"
import { withExtensionStorageWriteLock } from "~/services/core/storageWriteLock"
import type {
  ApiVerificationProbeId,
  ApiVerificationProbeStatus,
} from "~/services/verification/aiApiVerification"
import {
  API_VERIFICATION_MODES,
  API_VERIFICATION_PROBE_IDS,
  API_VERIFICATION_PROBE_STATUSES,
} from "~/services/verification/aiApiVerification"
import { onStorageChanged } from "~/utils/browser/browserApi"
import { createLogger } from "~/utils/core/logger"

import {
  applyOwnerReconcile,
  applyVerificationRetention,
  ORPHAN_SWEEP_INTERVAL_MS,
} from "./retention"
import {
  API_VERIFICATION_HISTORY_STATUSES,
  API_VERIFICATION_HISTORY_TARGET_KINDS,
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

const logger = createLogger("VerificationResultHistoryStorage")

const KNOWN_PROBE_IDS = new Set<ApiVerificationProbeId>(
  Object.values(API_VERIFICATION_PROBE_IDS),
)

/** Owners whose persisted verification results should be rewritten or dropped. */
export type VerificationOwnerReconcileInput = {
  removeProfileIds?: Iterable<string>
  removeAccountIds?: Iterable<string>
  remapProfileIds?: ReadonlyMap<string, string>
}

const createDefaultConfig = (): ApiVerificationHistoryConfig => ({
  version: API_VERIFICATION_RESULT_HISTORY_CONFIG_VERSION,
  summaries: [],
  lastUpdated: Date.now(),
  lastOrphanSweepAt: 0,
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

  return onStorageChanged(listener)
}

/**
 * Create a detached copy of persisted history config data.
 */
function cloneConfig(
  config: ApiVerificationHistoryConfig,
): ApiVerificationHistoryConfig {
  if (typeof structuredClone === "function") {
    return structuredClone(config)
  }
  return JSON.parse(JSON.stringify(config)) as ApiVerificationHistoryConfig
}

/** Detached copy of just the stored summaries. */
function cloneSummaries(
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
 * Sanitize an unrecognized payload into the current config shape.
 *
 * This is the boundary check, run for payloads this build did not write: a
 * different schema version, a legacy payload, or a hand-edited value.
 */
function sanitizeConfig(
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
function coerceTrustedConfig(
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

type RawConfigRead = {
  config: ApiVerificationHistoryConfig
  /**
   * True when the stored payload needed sanitizing, which means reads still pay
   * the boundary check until the upgraded payload is written back once.
   */
  needsPersist: boolean
}

class VerificationResultHistoryStorageService {
  private storage: Storage

  /**
   * Whether this instance is currently inside the store lock. Read paths skip the
   * migration write when set, because the lock is not reentrant.
   */
  private storeLockHeld = false

  constructor() {
    this.storage = new Storage({ area: "local" })
  }

  private async withStorageWriteLock<T>(work: () => Promise<T>): Promise<T> {
    return withExtensionStorageWriteLock(
      STORAGE_LOCKS.API_VERIFICATION_HISTORY,
      work,
    )
  }

  private async readRawConfig(): Promise<RawConfigRead> {
    const raw = await this.storage.get(
      API_VERIFICATION_HISTORY_STORAGE_KEYS.VERIFICATION_RESULT_HISTORY,
    )
    if (!raw || typeof raw !== "object") {
      return { config: createDefaultConfig(), needsPersist: false }
    }

    const value = raw as Record<string, unknown>
    const trusted = coerceTrustedConfig(value)
    return trusted
      ? { config: trusted, needsPersist: false }
      : { config: sanitizeConfig(value), needsPersist: true }
  }

  private async saveConfig(next: ApiVerificationHistoryConfig): Promise<void> {
    await this.storage.set(
      API_VERIFICATION_HISTORY_STORAGE_KEYS.VERIFICATION_RESULT_HISTORY,
      next,
    )
  }

  /**
   * Run one read-modify-write cycle under the store lock.
   *
   * Callers describe how the next config derives from the current one; the write
   * only happens when the mutation reports a change, or when the stored payload
   * still needs upgrading to the current schema version.
   *
   * This is the only method that takes the store lock, and the lock is not
   * reentrant: never call a public read method from `mutation`.
   */
  private async mutateConfig<T>(
    mutation: (config: ApiVerificationHistoryConfig) => {
      result: T
      next: ApiVerificationHistoryConfig
      changed: boolean
    },
  ): Promise<T> {
    return this.withStorageWriteLock(async () => {
      this.storeLockHeld = true
      try {
        const { config, needsPersist } = await this.readRawConfig()
        const { result, next, changed } = mutation(cloneConfig(config))
        if (changed || needsPersist) {
          await this.saveConfig(next)
        }
        return result
      } finally {
        this.storeLockHeld = false
      }
    })
  }

  /**
   * Read the config for a read-only caller, upgrading legacy payloads once.
   *
   * Must not be called while the store lock is held; the migration write needs
   * the same non-reentrant lock.
   */
  private async readConfigForRead(): Promise<ApiVerificationHistoryConfig> {
    const { config, needsPersist } = await this.readRawConfig()
    if (needsPersist && !this.storeLockHeld) {
      await this.persistReadMigration()
    }
    return config
  }

  /**
   * Write the sanitized payload back so later reads take the trusted path.
   *
   * Mirrors `AccountConfigStore.persistReadMigration`: re-read inside the lock so
   * a concurrent write cannot be reverted by a stale snapshot.
   */
  private async persistReadMigration(): Promise<void> {
    try {
      await this.mutateConfig((config) => ({
        result: undefined,
        next: config,
        changed: false,
      }))
    } catch (error) {
      logger.error("Failed to persist verification history migration", error)
    }
  }

  async listSummaries(): Promise<ApiVerificationHistorySummary[]> {
    const config = await this.readConfigForRead()
    return cloneSummaries(config.summaries)
  }

  async getLatestSummary(
    target: ApiVerificationHistoryTarget,
  ): Promise<ApiVerificationHistorySummary | null> {
    const targetKey = serializeVerificationHistoryTarget(target)
    const { summaries } = await this.readConfigForRead()

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

    const byKey = new Map(
      (await this.listSummaries()).map((summary) => [
        summary.targetKey,
        summary,
      ]),
    )

    const matched: Record<string, ApiVerificationHistorySummary> = {}
    for (const targetKey of targetKeys) {
      const summary = byKey.get(targetKey)
      if (summary) matched[targetKey] = summary
    }

    return matched
  }

  /**
   * Returns the newest profile- or profile-model-scoped API verification for
   * each requested profile, keyed by the profile target used by list views.
   */
  async getLatestProfileSummaries(
    profileIds: string[],
  ): Promise<Record<string, ApiVerificationHistorySummary>> {
    const profileKeyById = new Map(
      profileIds.flatMap((profileId) => {
        const normalizedProfileId = profileId.trim()
        return normalizedProfileId
          ? [
              [
                normalizedProfileId,
                serializeVerificationHistoryTarget({
                  kind: API_VERIFICATION_HISTORY_TARGET_KINDS.Profile,
                  profileId: normalizedProfileId,
                }),
              ],
            ]
          : []
      }),
    )
    if (profileKeyById.size === 0) return {}

    const latestByProfileKey: Record<string, ApiVerificationHistorySummary> = {}
    for (const summary of await this.listSummaries()) {
      if (
        summary.target.kind !== API_VERIFICATION_HISTORY_TARGET_KINDS.Profile &&
        summary.target.kind !==
          API_VERIFICATION_HISTORY_TARGET_KINDS.ProfileModel
      ) {
        continue
      }

      const profileKey = profileKeyById.get(summary.target.profileId)
      if (!profileKey) continue

      const current = latestByProfileKey[profileKey]
      if (!current || summary.verifiedAt > current.verifiedAt) {
        latestByProfileKey[profileKey] = summary
      }
    }

    return latestByProfileKey
  }

  /**
   * Store the latest result for each given target in a single write.
   *
   * Batching matters: one batch of N results costs one read, one clone and one
   * write, where N separate `upsertLatestSummary` calls would rewrite the whole
   * store N times.
   * @returns The stored summaries, newest write first.
   */
  async upsertLatestSummaries(
    summaries: ApiVerificationHistorySummary[],
  ): Promise<ApiVerificationHistorySummary[]> {
    const incoming = summaries
      .map((summary) => coerceHistorySummary(summary))
      .filter(
        (summary): summary is ApiVerificationHistorySummary => summary !== null,
      )
    if (incoming.length === 0) return []

    const now = Date.now()
    // Within one batch the last entry wins, matching sequential upserts.
    const batchNewestFirst: ApiVerificationHistorySummary[] = []
    const batchKeys = new Set<string>()
    for (let index = incoming.length - 1; index >= 0; index -= 1) {
      const summary = incoming[index]!
      if (batchKeys.has(summary.targetKey)) continue
      batchKeys.add(summary.targetKey)
      batchNewestFirst.push(summary)
    }

    const { sweepDue } = await this.mutateConfig((config) => {
      const merged = [
        ...batchNewestFirst,
        ...config.summaries.filter(
          (summary) => !batchKeys.has(summary.targetKey),
        ),
      ]
      const retention = applyVerificationRetention(merged, { now })

      return {
        result: {
          sweepDue: now - config.lastOrphanSweepAt >= ORPHAN_SWEEP_INTERVAL_MS,
        },
        next: {
          ...config,
          summaries: retention.summaries,
          lastUpdated: now,
        },
        changed: true,
      }
    })

    if (sweepDue) {
      await this.sweepOrphansInternal(now)
    }

    return batchNewestFirst
  }

  async upsertLatestSummary(
    summary: ApiVerificationHistorySummary,
  ): Promise<ApiVerificationHistorySummary> {
    const nextSummary = coerceHistorySummary(summary)
    if (!nextSummary) {
      throw new Error("Invalid verification history summary")
    }

    await this.upsertLatestSummaries([nextSummary])
    return nextSummary
  }

  async clearTarget(target: ApiVerificationHistoryTarget): Promise<boolean> {
    const targetKey = serializeVerificationHistoryTarget(target)

    return this.mutateConfig((config) => {
      const summaries = config.summaries.filter(
        (summary) => summary.targetKey !== targetKey,
      )
      return {
        result: summaries.length !== config.summaries.length,
        next: { ...config, summaries, lastUpdated: Date.now() },
        changed: summaries.length !== config.summaries.length,
      }
    })
  }

  /**
   * Drop results for owners that no longer exist, and rewrite results for profile
   * ids that were merged into another profile.
   *
   * Callers pass what they know; this runs once under the lock so removal always
   * precedes remapping. See `applyOwnerReconcile` for why that order matters.
   */
  async reconcileOwners(
    reconcile: VerificationOwnerReconcileInput,
  ): Promise<{ removed: number; remapped: number }> {
    const normalized = {
      removeProfileIds: reconcile.removeProfileIds
        ? new Set(reconcile.removeProfileIds)
        : undefined,
      removeAccountIds: reconcile.removeAccountIds
        ? new Set(reconcile.removeAccountIds)
        : undefined,
      remapProfileIds: reconcile.remapProfileIds,
    }

    return this.mutateConfig((config) => {
      const outcome = applyOwnerReconcile(config.summaries, normalized)
      const changed = outcome.removed > 0 || outcome.remapped > 0

      return {
        result: { removed: outcome.removed, remapped: outcome.remapped },
        next: { ...config, summaries: outcome.summaries },
        changed,
      }
    })
  }

  /**
   * Reap results whose owning account or profile is gone.
   *
   * Throttled: a sweep reads the account and profile stores, so it runs at most
   * once per `ORPHAN_SWEEP_INTERVAL_MS`. This is the backstop for removals that
   * do not call `reconcileOwners` directly.
   *
   * `swept` reports whether every owner source could be read. Each owner kind is
   * only judged against a source that was read in full, so a partial sweep still
   * reclaims what it could prove, and the marker waits for a complete one so the
   * skipped kind is retried on the next write.
   */
  async sweepOrphans(options?: {
    now?: number
  }): Promise<{ removed: number; swept: boolean }> {
    const now = options?.now ?? Date.now()

    const { config } = await this.readRawConfig()
    if (now - config.lastOrphanSweepAt < ORPHAN_SWEEP_INTERVAL_MS) {
      return { removed: 0, swept: false }
    }

    return this.sweepOrphansInternal(now)
  }

  /**
   * Sweep without the throttle pre-check, for callers that already decided it is
   * due. Must be called outside the store lock.
   */
  private async sweepOrphansInternal(
    now: number,
  ): Promise<{ removed: number; swept: boolean }> {
    // Read owner liveness before writing anything. An unreadable store is
    // reported as `undefined`, which skips that ownership check: treating it as
    // "no owners exist" would delete every result it owns.
    let liveProfileIds: Set<string> | undefined
    let liveAccountIds: Set<string> | undefined

    try {
      liveProfileIds = new Set(
        await apiCredentialProfilesStorage.listProfileIdsOrThrow(),
      )
    } catch (error) {
      logger.error("Skipping profile ownership check; profiles unreadable", {
        error,
      })
    }

    try {
      const accounts = await accountConfigStore.readAccounts()
      liveAccountIds = new Set(accounts.map((account) => account.id))
    } catch (error) {
      logger.error("Skipping account ownership check; accounts unreadable", {
        error,
      })
    }

    const completed =
      liveProfileIds !== undefined && liveAccountIds !== undefined

    return this.mutateConfig((config) => {
      const retention = applyVerificationRetention(config.summaries, {
        now,
        liveProfileIds,
        liveAccountIds,
      })

      return {
        result: {
          removed: retention.changed
            ? config.summaries.length - retention.summaries.length
            : 0,
          swept: completed,
        },
        next: {
          ...config,
          summaries: retention.summaries,
          // Only a complete sweep may advance the marker, so a failed owner read
          // retries on the next write instead of stalling for a full interval.
          lastOrphanSweepAt: completed ? now : config.lastOrphanSweepAt,
        },
        changed: retention.changed || completed,
      }
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
