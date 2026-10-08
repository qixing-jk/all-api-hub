import { Storage } from "@plasmohq/storage"

import { RuntimeMessageTypes } from "~/constants/runtimeActions"
import { ACCOUNT_KEY_RECONCILIATION_OUTCOMES } from "~/services/accounts/accountKeyInventoryReconciliation"
import { ACCOUNT_KEY_AUTO_PROVISIONING_STORAGE_KEYS } from "~/services/core/storageKeys"
import type {
  AccountKeyRepairAccountResult,
  AccountKeyRepairProgress,
} from "~/types/accountKeyAutoProvisioning"
import {
  ACCOUNT_KEY_REPAIR_JOB_STATES,
  ACCOUNT_KEY_REPAIR_MUTATION_OUTCOMES,
  ACCOUNT_KEY_REPAIR_OUTCOMES,
  ACCOUNT_KEY_REPAIR_PROGRESS_SCHEMA_VERSION,
} from "~/types/accountKeyAutoProvisioning"
import { sendRuntimeMessage } from "~/utils/browser/runtimeMessages"
import { createLogger } from "~/utils/core/logger"

const logger = createLogger("AccountKeyRepair")

const createEmptySummary = (): AccountKeyRepairProgress["summary"] => ({
  complete: 0,
  partial: 0,
  blocked: 0,
  skipped: 0,
  failed: 0,
  requirements: 0,
  coveredRequirements: 0,
  createdRequirements: 0,
  blockedRequirements: 0,
  rejectedRequirements: 0,
  uncertainRequirements: 0,
  invalidResources: 0,
  renameApplied: 0,
  renameRejected: 0,
  renameUncertain: 0,
  deleteApplied: 0,
  deleteRejected: 0,
  deleteUncertain: 0,
})

/**
 * Creates a default idle progress snapshot used when no repair job has started
 * yet (or when the stored progress blob is missing).
 * @returns Idle `AccountKeyRepairProgress` payload.
 */
function createIdleProgress(): AccountKeyRepairProgress {
  return {
    schemaVersion: ACCOUNT_KEY_REPAIR_PROGRESS_SCHEMA_VERSION,
    jobId: "idle",
    state: ACCOUNT_KEY_REPAIR_JOB_STATES.Idle,
    totals: {
      enabledAccounts: 0,
      eligibleAccounts: 0,
      processedAccounts: 0,
    },
    summary: createEmptySummary(),
    results: [],
  }
}

/** Owns ordered repair progress writes, result totals, rollback and UI notification. */
export class AccountKeyRepairProgressStore {
  private currentProgress: AccountKeyRepairProgress | null = null
  private progressQueue: Promise<void> = Promise.resolve()

  constructor(private readonly storage = new Storage({ area: "local" })) {}

  get current(): AccountKeyRepairProgress | null {
    return this.currentProgress
  }

  async read(): Promise<AccountKeyRepairProgress> {
    const stored = (await this.storage.get(
      ACCOUNT_KEY_AUTO_PROVISIONING_STORAGE_KEYS.REPAIR_PROGRESS,
    )) as AccountKeyRepairProgress | undefined
    if (
      !stored ||
      stored.schemaVersion !== ACCOUNT_KEY_REPAIR_PROGRESS_SCHEMA_VERSION
    ) {
      return createIdleProgress()
    }
    this.currentProgress = stored
    return stored
  }

  begin(jobId: string, now: number) {
    const progress: AccountKeyRepairProgress = {
      schemaVersion: ACCOUNT_KEY_REPAIR_PROGRESS_SCHEMA_VERSION,
      jobId,
      state: ACCOUNT_KEY_REPAIR_JOB_STATES.Running,
      startedAt: now,
      updatedAt: now,
      totals: {
        enabledAccounts: 0,
        eligibleAccounts: 0,
        processedAccounts: 0,
      },
      summary: createEmptySummary(),
      results: [],
    }

    return { progress, persisted: this.queueProgressReplacement(progress) }
  }

  async recordResult(result: AccountKeyRepairAccountResult): Promise<void> {
    await this.update((prev) => {
      const nextResults = [...prev.results, result]

      const nextSummary = { ...prev.summary }
      switch (result.outcome) {
        case ACCOUNT_KEY_REPAIR_OUTCOMES.Covered:
        case ACCOUNT_KEY_REPAIR_OUTCOMES.Repaired:
          nextSummary.complete += 1
          break
        case ACCOUNT_KEY_REPAIR_OUTCOMES.Partial:
          nextSummary.partial += 1
          break
        case ACCOUNT_KEY_REPAIR_OUTCOMES.Blocked:
          nextSummary.blocked += 1
          break
        case ACCOUNT_KEY_REPAIR_OUTCOMES.Skipped:
          nextSummary.skipped += 1
          break
        case ACCOUNT_KEY_REPAIR_OUTCOMES.Failed:
          nextSummary.failed += 1
          break
        default:
          break
      }

      const isEligibleOutcome =
        result.outcome !== ACCOUNT_KEY_REPAIR_OUTCOMES.Skipped
      const coveredRequirements = result.requirementResults.filter(
        ({ outcome }) =>
          outcome === ACCOUNT_KEY_RECONCILIATION_OUTCOMES.Covered,
      ).length
      const createdRequirements = result.requirementResults.filter(
        ({ outcome }) =>
          outcome === ACCOUNT_KEY_RECONCILIATION_OUTCOMES.Created,
      ).length
      const blockedRequirements = result.requirementResults.filter(
        ({ outcome }) =>
          outcome ===
            ACCOUNT_KEY_RECONCILIATION_OUTCOMES.BlockedIncompleteInventory ||
          outcome === ACCOUNT_KEY_RECONCILIATION_OUTCOMES.BlockedInputRequired,
      ).length
      const rejectedRequirements = result.requirementResults.filter(
        ({ outcome }) =>
          outcome === ACCOUNT_KEY_RECONCILIATION_OUTCOMES.Rejected,
      ).length
      const uncertainRequirements = result.requirementResults.filter(
        ({ outcome }) =>
          outcome === ACCOUNT_KEY_RECONCILIATION_OUTCOMES.Uncertain ||
          outcome === ACCOUNT_KEY_RECONCILIATION_OUTCOMES.CoveredAfterUncertain,
      ).length
      const renameApplied = result.renameResults.filter(
        ({ outcome }) =>
          outcome === ACCOUNT_KEY_REPAIR_MUTATION_OUTCOMES.Applied,
      ).length
      const renameRejected = result.renameResults.filter(
        ({ outcome }) =>
          outcome === ACCOUNT_KEY_REPAIR_MUTATION_OUTCOMES.Rejected,
      ).length
      const renameUncertain = result.renameResults.filter(
        ({ outcome }) =>
          outcome === ACCOUNT_KEY_REPAIR_MUTATION_OUTCOMES.Uncertain,
      ).length

      return {
        ...prev,
        results: nextResults,
        summary: {
          ...nextSummary,
          requirements:
            prev.summary.requirements + result.requirementResults.length,
          coveredRequirements:
            prev.summary.coveredRequirements + coveredRequirements,
          createdRequirements:
            prev.summary.createdRequirements + createdRequirements,
          blockedRequirements:
            prev.summary.blockedRequirements + blockedRequirements,
          rejectedRequirements:
            prev.summary.rejectedRequirements + rejectedRequirements,
          uncertainRequirements:
            prev.summary.uncertainRequirements + uncertainRequirements,
          invalidResources:
            prev.summary.invalidResources + result.invalidResources.length,
          renameApplied: prev.summary.renameApplied + renameApplied,
          renameRejected: prev.summary.renameRejected + renameRejected,
          renameUncertain: prev.summary.renameUncertain + renameUncertain,
        },
        totals: {
          ...prev.totals,
          processedAccounts: isEligibleOutcome
            ? prev.totals.processedAccounts + 1
            : prev.totals.processedAccounts,
        },
      }
    })
  }

  async update(
    updater: (
      progress: AccountKeyRepairProgress,
    ) => AccountKeyRepairProgress | null,
  ): Promise<void> {
    const operation = this.enqueueProgressOperation(async () => {
      const previousProgress = this.currentProgress
      const base = previousProgress ?? createIdleProgress()
      const nextProgress = updater(base)
      if (!nextProgress) {
        return
      }
      const pendingProgress = {
        ...nextProgress,
        // Preserve ordering when multiple updates share a millisecond or the
        // wall clock moves backwards, without changing the persisted schema.
        updatedAt: Math.max(Date.now(), (base.updatedAt ?? 0) + 1),
      }
      await this.persistProgressWithRollback(pendingProgress, previousProgress)
    })

    await operation
  }

  private async queueProgressReplacement(
    progress: AccountKeyRepairProgress,
  ): Promise<void> {
    const operation = this.enqueueProgressOperation(async () => {
      const previousProgress = this.currentProgress
      await this.persistProgressWithRollback(progress, previousProgress)
    })

    await operation
  }

  private enqueueProgressOperation(
    operation: () => Promise<void>,
  ): Promise<void> {
    const operationPromise = this.progressQueue.then(operation)
    this.progressQueue = operationPromise.catch((error) => {
      logger.error("Failed to persist repair progress update", error)
    })
    return operationPromise
  }

  private async persistProgressWithRollback(
    progress: AccountKeyRepairProgress,
    previousProgress: AccountKeyRepairProgress | null,
  ): Promise<void> {
    this.currentProgress = progress

    try {
      await this.persistAndNotify(progress)
    } catch (error) {
      if (this.currentProgress === progress) {
        this.currentProgress = previousProgress
      }
      throw error
    }
  }

  private async persistAndNotify(
    progress: AccountKeyRepairProgress,
  ): Promise<void> {
    await this.storage.set(
      ACCOUNT_KEY_AUTO_PROVISIONING_STORAGE_KEYS.REPAIR_PROGRESS,
      progress,
    )

    try {
      void sendRuntimeMessage(
        {
          type: RuntimeMessageTypes.AccountKeyRepairProgress,
          payload: progress,
        },
        { maxAttempts: 1 },
      ).catch(() => {
        // Silent: UI might not be open
      })
    } catch {
      // Silent: UI might not be open
    }
  }
}
