import { expect, it } from "vitest"

import type {
  ManagedSiteMutationConfirmedEffect,
  ManagedSiteMutationResult,
} from "~/services/managedSites/mutations"

export const CHANNEL_MUTATION_SCENARIOS = {
  Succeeded: "succeeded",
  Rejected: "rejected",
  PostDispatchAmbiguity: "post-dispatch-ambiguity",
  PreflightCancellation: "preflight-cancellation",
} as const

export type ChannelMutationScenario =
  (typeof CHANNEL_MUTATION_SCENARIOS)[keyof typeof CHANNEL_MUTATION_SCENARIOS]

type ChannelMutationContractOperation = {
  name: string
  effect: ManagedSiteMutationConfirmedEffect
  successData: unknown
  arrange(scenario: ChannelMutationScenario): {
    raw?: unknown
    rejectionResponse?: unknown
    expectedRejectedDiagnostic?: {
      message: string
      code?: string | number
      statusCode?: number
      raw?: unknown
    }
    expectedAmbiguousDiagnostic?: {
      message: string
      code?: string | number
      statusCode?: number
      raw?: unknown
    }
  }
  invoke(): Promise<ManagedSiteMutationResult<unknown>>
  assertRequestPayload(): void
}

/** Registers the provider-neutral result contract for each supported write. */
export function testManagedSiteChannelMutationContract(
  operations: readonly ChannelMutationContractOperation[],
) {
  it.each(operations)(
    "$name returns the confirmed effect and preserves its request payload",
    async (operation) => {
      operation.arrange(CHANNEL_MUTATION_SCENARIOS.Succeeded)

      await expect(operation.invoke()).resolves.toEqual({
        outcome: "succeeded",
        data: operation.successData,
        confirmedEffects: [operation.effect],
      })
      operation.assertRequestPayload()
    },
  )

  it.each(operations)(
    "$name maps an affirmative provider rejection with the raw response",
    async (operation) => {
      const { rejectionResponse, expectedRejectedDiagnostic } =
        operation.arrange(CHANNEL_MUTATION_SCENARIOS.Rejected)

      const result = await operation.invoke()
      const expectedDiagnostic = expectedRejectedDiagnostic ?? {
        message: "provider rejected",
        raw: rejectionResponse,
      }

      expect(result).toEqual({
        outcome: "rejected",
        diagnostic: expectedDiagnostic,
      })
      if (result.outcome !== "rejected") {
        throw new Error("Expected rejected channel mutation")
      }
      expect(result.diagnostic.raw).toBe(expectedDiagnostic.raw)
      operation.assertRequestPayload()
    },
  )

  it.each(operations)(
    "$name preserves a post-dispatch ambiguity as uncertain",
    async (operation) => {
      const { raw, expectedAmbiguousDiagnostic } = operation.arrange(
        CHANNEL_MUTATION_SCENARIOS.PostDispatchAmbiguity,
      )

      const result = await operation.invoke()
      const expectedDiagnostic = expectedAmbiguousDiagnostic ?? {
        message: "Failed to fetch",
        raw,
      }

      expect(result).toEqual({
        outcome: "uncertain",
        diagnostic: expectedDiagnostic,
      })
      if (result.outcome !== "uncertain") {
        throw new Error("Expected uncertain channel mutation")
      }
      expect(result.diagnostic.raw).toBe(expectedDiagnostic.raw)
      operation.assertRequestPayload()
    },
  )

  it.each(operations)(
    "$name preserves a preflight cancellation as rejected",
    async (operation) => {
      const { raw } = operation.arrange(
        CHANNEL_MUTATION_SCENARIOS.PreflightCancellation,
      )

      await expect(operation.invoke()).resolves.toEqual({
        outcome: "rejected",
        diagnostic: {
          message: "cancelled",
          code: 20,
          raw,
        },
      })
      operation.assertRequestPayload()
    },
  )
}
