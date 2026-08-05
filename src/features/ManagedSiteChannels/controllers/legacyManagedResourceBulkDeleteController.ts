import {
  invokeManagedSiteMutationAttempt,
  MANAGED_SITE_MUTATION_ATTEMPT_STATES,
  MANAGED_SITE_MUTATION_OUTCOMES,
  toPrivateManagedSiteMutationOutput,
} from "~/services/managedSites/mutations"

import { mapSettledWithConcurrency } from "./managedResourceConcurrency"

const LEGACY_DELETE_CONCURRENCY = 4

export type LegacyManagedResourceDeleteTarget = {
  rowKey: string
  channelId: number
  displayLabel: string
}

type LegacyManagedResourceDeleteContext = {
  deleteTarget: (target: LegacyManagedResourceDeleteTarget) => Promise<unknown>
  confirmMissing: (
    target: LegacyManagedResourceDeleteTarget,
  ) => Promise<boolean>
  knownSecrets: readonly string[]
  knownSecretsComplete: boolean
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
  resolveDelete: () => Promise<LegacyManagedResourceDeleteContext>
  refresh: () => Promise<boolean>
}

const DELETE_FAILED_FALLBACK = "Delete failed"

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
      let deleteContext: Awaited<
        ReturnType<LegacyManagedResourceBulkDeleteDependencies["resolveDelete"]>
      >
      try {
        deleteContext = await dependencies.resolveDelete()
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
        async (target) => {
          const attempt = await invokeManagedSiteMutationAttempt<void>(
            () => deleteContext.deleteTarget(target),
            {
              idempotent: true,
              knownSecrets: deleteContext.knownSecrets,
              knownSecretsComplete: deleteContext.knownSecretsComplete,
              uncertainFallbackMessage: DELETE_FAILED_FALLBACK,
            },
          )
          if (
            attempt.state === MANAGED_SITE_MUTATION_ATTEMPT_STATES.Uncertain
          ) {
            return {
              result: toResult(target, "uncertain"),
              reason: new Error(attempt.message),
            }
          }

          const mutationResult = attempt.result
          const privateMessage = deleteContext.knownSecretsComplete
            ? toPrivateManagedSiteMutationOutput(mutationResult, {
                knownSecrets: deleteContext.knownSecrets,
              }).message
            : undefined
          const reason = () =>
            new Error(privateMessage || DELETE_FAILED_FALLBACK)
          switch (mutationResult.outcome) {
            case MANAGED_SITE_MUTATION_OUTCOMES.Succeeded:
              return { result: toResult(target, "success") }
            case MANAGED_SITE_MUTATION_OUTCOMES.Rejected:
              if (mutationResult.diagnostic.code === "not_found") {
                try {
                  return (await deleteContext.confirmMissing(target))
                    ? { result: toResult(target, "success") }
                    : { result: toResult(target, "failed"), reason: reason() }
                } catch {
                  return {
                    result: toResult(target, "uncertain"),
                    reason: reason(),
                  }
                }
              }
              return { result: toResult(target, "failed"), reason: reason() }
            case MANAGED_SITE_MUTATION_OUTCOMES.Partial:
            case MANAGED_SITE_MUTATION_OUTCOMES.Uncertain:
              return { result: toResult(target, "uncertain"), reason: reason() }
          }
        },
      )
      if (!isCurrentExecution()) return null

      const outcomes = settled.map((outcome, index) => {
        const target = targets[index]
        if (outcome.status === "fulfilled") {
          return { target, ...outcome.value }
        }

        return {
          target,
          result: toResult(target, "uncertain"),
          reason: new Error(DELETE_FAILED_FALLBACK),
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
