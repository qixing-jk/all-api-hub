import {
  assertManagedSiteMutationResult,
  MANAGED_SITE_MUTATION_OUTCOMES,
  type ManagedSiteMutationConfirmedEffect,
  type ManagedSiteMutationResult,
} from "./contracts"
import {
  toPrivateManagedSiteMutationOutput,
  toPrivateManagedSiteThrownErrorMessage,
} from "./disclosure"
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

export const MANAGED_SITE_MUTATION_ATTEMPT_STATES = {
  Result: "result",
  Uncertain: "uncertain",
} as const

export type ManagedSiteMutationAttempt<
  TData = unknown,
  TEffect extends
    ManagedSiteMutationConfirmedEffect = ManagedSiteMutationConfirmedEffect,
> =
  | {
      state: typeof MANAGED_SITE_MUTATION_ATTEMPT_STATES.Result
      result: ManagedSiteMutationResult<TData, TEffect>
    }
  | {
      state: typeof MANAGED_SITE_MUTATION_ATTEMPT_STATES.Uncertain
      message: string
    }

export type ManagedSiteMutationAttemptOptions = {
  idempotent: boolean
  knownSecrets: readonly string[]
  knownSecretsComplete: boolean
  uncertainFallbackMessage: string
}

/**
 * Invokes one remote mutation and classifies every post-invocation failure as
 * non-replayable uncertainty. Payload construction and validation stay outside.
 */
export async function invokeManagedSiteMutationAttempt<
  TData = unknown,
  TEffect extends
    ManagedSiteMutationConfirmedEffect = ManagedSiteMutationConfirmedEffect,
>(
  invoke: () => Promise<unknown>,
  options: ManagedSiteMutationAttemptOptions,
): Promise<ManagedSiteMutationAttempt<TData, TEffect>> {
  let candidate: unknown
  try {
    candidate = await invoke()
  } catch (error) {
    const projectedMessage = options.knownSecretsComplete
      ? toPrivateManagedSiteThrownErrorMessage(error, {
          knownSecrets: options.knownSecrets,
        })
      : undefined
    return {
      state: MANAGED_SITE_MUTATION_ATTEMPT_STATES.Uncertain,
      message: projectedMessage || options.uncertainFallbackMessage,
    }
  }

  try {
    assertManagedSiteMutationResult<TData, TEffect>(candidate, {
      idempotent: options.idempotent,
    })
  } catch {
    return {
      state: MANAGED_SITE_MUTATION_ATTEMPT_STATES.Uncertain,
      message: options.uncertainFallbackMessage,
    }
  }

  return {
    state: MANAGED_SITE_MUTATION_ATTEMPT_STATES.Result,
    result: candidate,
  }
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
