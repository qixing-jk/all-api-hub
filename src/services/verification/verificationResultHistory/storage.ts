import { Storage } from "@plasmohq/storage"

import { accountConfigStore } from "~/services/accounts/accountStorage/accountConfigStore"
import { listApiCredentialProfileIdsOrThrow } from "~/services/apiCredentialProfiles/storage/configReader"
import {
  API_VERIFICATION_HISTORY_STORAGE_KEYS,
  STORAGE_LOCKS,
} from "~/services/core/storageKeys"
import { withExtensionStorageWriteLock } from "~/services/core/storageWriteLock"
import {
  cloneConfig,
  cloneSummaries,
  coerceHistorySummary,
  coerceTrustedConfig,
  createDefaultConfig,
  sanitizeConfig,
} from "~/services/verification/verificationResultHistory/codec"
import {
  applyOwnerReconcile,
  applyVerificationRetention,
  ORPHAN_SWEEP_INTERVAL_MS,
} from "~/services/verification/verificationResultHistory/retention"
import {
  selectLatestProfileVerificationSummaries,
  selectLatestVerificationSummaries,
  selectLatestVerificationSummary,
} from "~/services/verification/verificationResultHistory/selectors"
import {
  API_VERIFICATION_HISTORY_TARGET_KINDS,
  type ApiVerificationHistoryConfig,
  type ApiVerificationHistorySummary,
  type ApiVerificationHistoryTarget,
} from "~/services/verification/verificationResultHistory/types"
import { serializeVerificationHistoryTarget } from "~/services/verification/verificationResultHistory/utils"
import { onStorageChanged } from "~/utils/browser/storage"
import { createLogger } from "~/utils/core/logger"

const logger = createLogger("VerificationResultHistoryStorage")

/** Owners whose persisted verification results should be rewritten or dropped. */
export type VerificationOwnerReconcileInput = {
  removeProfileIds?: Iterable<string>
  removeAccountIds?: Iterable<string>
  remapProfileIds?: ReadonlyMap<string, string>
}

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
    return selectLatestVerificationSummary(summaries, targetKey)
  }

  async getLatestSummaries(
    targets: ApiVerificationHistoryTarget[],
  ): Promise<Record<string, ApiVerificationHistorySummary>> {
    const targetKeys = new Set(
      targets.map((target) => serializeVerificationHistoryTarget(target)),
    )

    if (targetKeys.size === 0) return {}
    const summaries = await this.listSummaries()

    return selectLatestVerificationSummaries(summaries, targetKeys)
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
    const summaries = await this.listSummaries()

    return selectLatestProfileVerificationSummaries(summaries, profileKeyById)
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
      liveProfileIds = new Set(await listApiCredentialProfileIdsOrThrow())
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
