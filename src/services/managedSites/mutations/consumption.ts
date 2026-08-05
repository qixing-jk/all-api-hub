import {
  assertManagedSiteMutationResult,
  MANAGED_SITE_MUTATION_OUTCOMES,
  type ManagedSiteMutationConfirmedEffect,
} from "./contracts"
import { toPrivateManagedSiteMutationOutput } from "./disclosure"
import {
  getManagedSiteMutationRetryDecision,
  type ManagedSiteMutationRetryDecision,
} from "./retryPolicy"

export type ManagedSiteMutationConsumptionOptions = {
  idempotent: boolean
  retryableRejection: boolean
  knownSecrets: readonly string[]
  knownSecretsComplete: boolean
  reconcile: () => Promise<void>
  rejectedFallbackMessage: string
  ambiguousFallbackMessage: string
  createError: (
    message: string,
    retryDecision: ManagedSiteMutationRetryDecision,
  ) => Error
}

/**
 * Consumes one provider-neutral mutation result without replaying writes.
 * Only the caller's one-shot reconciliation failure is intentionally best effort.
 */
export async function consumeManagedSiteMutationResult<
  TData = unknown,
  TEffect extends
    ManagedSiteMutationConfirmedEffect = ManagedSiteMutationConfirmedEffect,
>(
  result: unknown,
  options: ManagedSiteMutationConsumptionOptions,
): Promise<void> {
  assertManagedSiteMutationResult<TData, TEffect>(result, {
    idempotent: options.idempotent,
  })
  const retryDecision = getManagedSiteMutationRetryDecision(result, {
    retryableRejection: options.retryableRejection,
  })

  if (result.outcome === MANAGED_SITE_MUTATION_OUTCOMES.Succeeded) return

  if (
    result.outcome === MANAGED_SITE_MUTATION_OUTCOMES.Partial ||
    result.outcome === MANAGED_SITE_MUTATION_OUTCOMES.Uncertain
  ) {
    try {
      await options.reconcile()
    } catch {
      // Reconciliation is best effort; ambiguous writes remain non-replayable.
    }
  }

  const fallbackMessage =
    result.outcome === MANAGED_SITE_MUTATION_OUTCOMES.Rejected
      ? options.rejectedFallbackMessage
      : options.ambiguousFallbackMessage
  const message = options.knownSecretsComplete
    ? toPrivateManagedSiteMutationOutput(result, {
        knownSecrets: options.knownSecrets,
      }).message || fallbackMessage
    : fallbackMessage

  throw options.createError(message, retryDecision)
}
