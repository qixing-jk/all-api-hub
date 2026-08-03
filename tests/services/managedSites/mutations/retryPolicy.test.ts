import { describe, expect, it } from "vitest"

import {
  getManagedSiteMutationRetryDecision,
  MANAGED_SITE_MUTATION_COMPLETIONS,
  MANAGED_SITE_MUTATION_OUTCOMES,
  MANAGED_SITE_MUTATION_RETRY_DECISIONS,
  type ManagedSiteMutationResult,
} from "~/services/managedSites/mutations"

const diagnostic = { message: "Mutation did not complete." }

describe("managed site mutation retry policy", () => {
  it("accepts resource-returning mutation result specializations", () => {
    const result: ManagedSiteMutationResult<{ id: string }> = {
      outcome: MANAGED_SITE_MUTATION_OUTCOMES.Succeeded,
      data: { id: "resource-1" },
      confirmedEffects: [],
    }

    expect(
      getManagedSiteMutationRetryDecision(result, {
        retryableRejection: false,
      }),
    ).toBe(MANAGED_SITE_MUTATION_RETRY_DECISIONS.NoRetryNeeded)
  })

  it.each([
    {
      result: {
        outcome: MANAGED_SITE_MUTATION_OUTCOMES.Succeeded,
        data: undefined,
        confirmedEffects: [],
      },
      retryableRejection: true,
      expected: MANAGED_SITE_MUTATION_RETRY_DECISIONS.NoRetryNeeded,
    },
    {
      result: {
        outcome: MANAGED_SITE_MUTATION_OUTCOMES.Rejected,
        diagnostic,
      },
      retryableRejection: true,
      expected: MANAGED_SITE_MUTATION_RETRY_DECISIONS.RetryAllowed,
    },
    {
      result: {
        outcome: MANAGED_SITE_MUTATION_OUTCOMES.Rejected,
        diagnostic,
      },
      retryableRejection: false,
      expected: MANAGED_SITE_MUTATION_RETRY_DECISIONS.RetryDisallowed,
    },
    {
      result: {
        outcome: MANAGED_SITE_MUTATION_OUTCOMES.Partial,
        confirmedEffects: [
          {
            kind: "resource-updated",
            resourceKind: "channel",
            resourceId: 1,
          },
        ],
        completion: MANAGED_SITE_MUTATION_COMPLETIONS.Rejected,
        diagnostic,
      },
      retryableRejection: true,
      expected: MANAGED_SITE_MUTATION_RETRY_DECISIONS.ReconcileRequired,
    },
    {
      result: {
        outcome: MANAGED_SITE_MUTATION_OUTCOMES.Uncertain,
        diagnostic,
      },
      retryableRejection: true,
      expected: MANAGED_SITE_MUTATION_RETRY_DECISIONS.ReconcileRequired,
    },
  ])(
    "maps $result.outcome to $expected",
    ({ result, retryableRejection, expected }) => {
      expect(
        getManagedSiteMutationRetryDecision(
          result as ManagedSiteMutationResult,
          { retryableRejection },
        ),
      ).toBe(expected)
    },
  )
})
