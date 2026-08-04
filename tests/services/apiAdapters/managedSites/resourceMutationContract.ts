import { expect, it } from "vitest"

import type { ManagedSiteMutationResult } from "~/services/managedSites/mutations"

import {
  CHANNEL_MUTATION_SCENARIOS,
  type ChannelMutationScenario,
} from "./channelMutationContract"

export type ResourceMutationContractOperation = {
  name: string
  effect: {
    kind: "resource-created" | "resource-updated" | "resource-deleted"
    resourceKind: "channel"
    resourceId?: string | number
  }
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

/** Registers the common result and payload contract for transitional resources. */
export function testManagedUpstreamResourceMutationContract(
  operations: readonly ResourceMutationContractOperation[],
) {
  it.each(operations)(
    "resource $name returns its summary and exact confirmed effect",
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
    "resource $name rejects only affirmative non-application evidence",
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
        throw new Error("Expected rejected resource mutation")
      }
      expect(result.diagnostic.raw).toBe(expectedDiagnostic.raw)
      operation.assertRequestPayload()
    },
  )

  it.each(operations)(
    "resource $name preserves post-dispatch ambiguity and raw identity",
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
        throw new Error("Expected uncertain resource mutation")
      }
      expect(result.diagnostic.raw).toBe(expectedDiagnostic.raw)
      operation.assertRequestPayload()
    },
  )

  it.each(operations)(
    "resource $name keeps pre-dispatch cancellation rejected",
    async (operation) => {
      const { raw } = operation.arrange(
        CHANNEL_MUTATION_SCENARIOS.PreflightCancellation,
      )

      const result = await operation.invoke()

      expect(result).toEqual({
        outcome: "rejected",
        diagnostic: {
          message: "cancelled",
          code: 20,
          raw,
        },
      })
      if (result.outcome !== "rejected") {
        throw new Error("Expected rejected resource mutation")
      }
      expect(result.diagnostic.raw).toBe(raw)
      operation.assertRequestPayload()
    },
  )
}
