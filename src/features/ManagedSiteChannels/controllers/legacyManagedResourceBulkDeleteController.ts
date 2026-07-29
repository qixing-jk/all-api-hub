import {
  MANAGED_SITE_MUTATION_CERTAINTIES,
  type ManagedSiteMutationCertainty,
} from "~/services/apiAdapters/contracts/managedSiteCapabilities"
import { isManagedSiteMutationUncertainError } from "~/services/managedSites/mutationCertainty"

import { mapSettledWithConcurrency } from "./managedResourceConcurrency"

const LEGACY_DELETE_CONCURRENCY = 4

export type LegacyManagedResourceDeleteTarget = {
  rowKey: string
  channelId: number
  displayLabel: string
}

type LegacyDeleteResponse = {
  success: boolean
  message?: string
  certainty?: ManagedSiteMutationCertainty
}

export type LegacyManagedResourceDeleteResult = {
  rowKey: string
  displayLabel: string
  status: "success" | "failed" | "uncertain"
  resultKey: string
}

type LegacyManagedResourceDeleteOutcome = {
  target: LegacyManagedResourceDeleteTarget
  result: LegacyManagedResourceDeleteResult
  reason?: unknown
}

type LegacyManagedResourceBulkDeleteExecution = {
  results: LegacyManagedResourceDeleteResult[]
  outcomes: LegacyManagedResourceDeleteOutcome[]
  requiresRefresh: boolean
  refreshAccepted: boolean
  failure?: unknown
}

type LegacyManagedResourceBulkDeleteDependencies = {
  resolveDelete: () => Promise<
    (target: LegacyManagedResourceDeleteTarget) => Promise<LegacyDeleteResponse>
  >
  refresh: () => Promise<boolean>
}

const toResult = (
  target: LegacyManagedResourceDeleteTarget,
  status: LegacyManagedResourceDeleteResult["status"],
): LegacyManagedResourceDeleteResult => ({
  rowKey: target.rowKey,
  displayLabel: target.displayLabel,
  status,
  resultKey: `delete_${status}`,
})

/** Owns the legacy bulk-delete snapshot, execution, and no-replay boundary. */
export class LegacyManagedResourceBulkDeleteController {
  private pendingTargets: LegacyManagedResourceDeleteTarget[] = []
  private replayBlocked = false
  private generation = 0
  private activeExecution: symbol | null = null

  schedule(targets: readonly LegacyManagedResourceDeleteTarget[]): boolean {
    if (this.activeExecution || this.replayBlocked || targets.length === 0) {
      return false
    }

    this.pendingTargets = targets.map((target) => ({ ...target }))
    return true
  }

  cancel(): void {
    this.pendingTargets = []
  }

  getPendingTargets(): LegacyManagedResourceDeleteTarget[] {
    return this.pendingTargets.map((target) => ({ ...target }))
  }

  markRefreshAccepted(): void {
    this.replayBlocked = false
  }

  invalidate(): void {
    this.generation += 1
    this.activeExecution = null
    this.pendingTargets = []
    this.replayBlocked = false
  }

  async execute(
    dependencies: LegacyManagedResourceBulkDeleteDependencies,
  ): Promise<LegacyManagedResourceBulkDeleteExecution | null> {
    if (
      this.activeExecution ||
      this.replayBlocked ||
      this.pendingTargets.length === 0
    ) {
      return null
    }

    const targets = this.getPendingTargets()
    this.pendingTargets = []
    const executionGeneration = this.generation
    const executionToken = Symbol("legacy-managed-resource-delete")
    this.activeExecution = executionToken
    const isCurrentExecution = () =>
      this.generation === executionGeneration &&
      this.activeExecution === executionToken

    try {
      let deleteTarget: Awaited<
        ReturnType<LegacyManagedResourceBulkDeleteDependencies["resolveDelete"]>
      >
      try {
        deleteTarget = await dependencies.resolveDelete()
      } catch (failure) {
        if (!isCurrentExecution()) return null

        const outcomes = targets.map((target) => ({
          target,
          result: toResult(target, "failed"),
          reason: failure,
        }))
        return {
          results: outcomes.map((outcome) => outcome.result),
          outcomes,
          requiresRefresh: false,
          refreshAccepted: false,
          failure,
        }
      }

      const settled = await mapSettledWithConcurrency(
        targets,
        LEGACY_DELETE_CONCURRENCY,
        deleteTarget,
      )
      if (!isCurrentExecution()) return null

      const outcomes = settled.map((outcome, index) => {
        const target = targets[index]
        if (outcome.status === "fulfilled") {
          if (outcome.value.success) {
            return { target, result: toResult(target, "success") }
          }

          const status =
            outcome.value.certainty ===
            MANAGED_SITE_MUTATION_CERTAINTIES.Uncertain
              ? "uncertain"
              : "failed"
          const reason = new Error(outcome.value.message || "Delete failed")
          return { target, result: toResult(target, status), reason }
        }

        const status = isManagedSiteMutationUncertainError(outcome.reason)
          ? "uncertain"
          : "failed"
        return {
          target,
          result: toResult(target, status),
          reason: outcome.reason,
        }
      })

      let refreshAccepted = false
      try {
        refreshAccepted = await dependencies.refresh()
      } catch {
        refreshAccepted = false
      }
      if (!isCurrentExecution()) return null

      const hasUncertainResult = outcomes.some(
        (outcome) => outcome.result.status === "uncertain",
      )
      this.replayBlocked = hasUncertainResult && !refreshAccepted

      return {
        results: outcomes.map((outcome) => outcome.result),
        outcomes,
        requiresRefresh: this.replayBlocked,
        refreshAccepted,
        failure: outcomes.find((outcome) => outcome.reason)?.reason,
      }
    } finally {
      if (this.activeExecution === executionToken) {
        this.activeExecution = null
      }
    }
  }
}
