import {
  getApiVerificationProbeDefinitions,
  type ApiVerificationApiType,
  type ApiVerificationProbeResult,
} from "~/services/verification/aiApiVerification"
import type { ApiVerificationHistorySummary } from "~/services/verification/verificationResultHistory"

import type { ProbeItemState } from "./types"

/**
 * Build the probe list state for the selected API type.
 * The list is shown immediately so users can run/retry individual items.
 */
export function buildProbeState(
  apiType: ApiVerificationApiType,
  persistedSummary?: ApiVerificationHistorySummary | null,
): ProbeItemState[] {
  const defs = getApiVerificationProbeDefinitions(apiType)
  const persistedById = new Map(
    (persistedSummary?.probes ?? []).map((probe) => [probe.id, probe]),
  )

  return defs.map((definition): ProbeItemState => {
    const persistedProbe = persistedById.get(definition.id)
    return {
      definition,
      isRunning: false,
      attempts: 0,
      result: persistedProbe
        ? {
            id: persistedProbe.id,
            status: persistedProbe.status,
            latencyMs: persistedProbe.latencyMs,
            summary: persistedProbe.summary,
            summaryKey: persistedProbe.summaryKey,
            summaryParams: persistedProbe.summaryParams,
          }
        : null,
    }
  })
}

/**
 * Flatten completed probe results for persistence.
 */
export function extractProbeResults(
  probes: ProbeItemState[],
): ApiVerificationProbeResult[] {
  return probes.flatMap((probe) => (probe.result ? [probe.result] : []))
}
