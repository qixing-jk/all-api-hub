import {
  MANAGED_SITE_MUTATION_OUTCOMES,
  type ManagedSiteMutationConfirmedEffect,
  type ManagedSiteMutationResult,
} from "~/services/managedSites/mutations/contracts"

export const MANAGED_SITE_MUTATION_RETRY_DECISIONS = {
  NoRetryNeeded: "no-retry-needed",
  RetryAllowed: "retry-allowed",
  ReconcileRequired: "reconcile-required",
  RetryDisallowed: "retry-disallowed",
} as const

export type ManagedSiteMutationRetryDecision =
  (typeof MANAGED_SITE_MUTATION_RETRY_DECISIONS)[keyof typeof MANAGED_SITE_MUTATION_RETRY_DECISIONS]

/** Converts mutation certainty into the only supported automatic replay policy. */
export function getManagedSiteMutationRetryDecision<
  TData = void,
  TEffect extends
    ManagedSiteMutationConfirmedEffect = ManagedSiteMutationConfirmedEffect,
>(
  result: ManagedSiteMutationResult<TData, TEffect>,
  options: { retryableRejection: boolean },
): ManagedSiteMutationRetryDecision {
  switch (result.outcome) {
    case MANAGED_SITE_MUTATION_OUTCOMES.Succeeded:
      return MANAGED_SITE_MUTATION_RETRY_DECISIONS.NoRetryNeeded
    case MANAGED_SITE_MUTATION_OUTCOMES.Rejected:
      return options.retryableRejection
        ? MANAGED_SITE_MUTATION_RETRY_DECISIONS.RetryAllowed
        : MANAGED_SITE_MUTATION_RETRY_DECISIONS.RetryDisallowed
    case MANAGED_SITE_MUTATION_OUTCOMES.Partial:
    case MANAGED_SITE_MUTATION_OUTCOMES.Uncertain:
      return MANAGED_SITE_MUTATION_RETRY_DECISIONS.ReconcileRequired
  }
}
