import {
  buildStoppedProbeResult,
  getApiVerificationProbeDefinitions,
  type ApiVerificationApiType,
  type ApiVerificationMode,
  type ApiVerificationProbeId,
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
            mode: persistedProbe.mode,
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

/**
 * Keep an interrupted probe from reading as a result it never produced,
 * leaving every other entry untouched.
 */
export function withStoppedProbe(
  probes: ProbeItemState[],
  probeId: ApiVerificationProbeId,
  mode?: ApiVerificationMode,
): ProbeItemState[] {
  return probes.map((probe) =>
    probe.definition.id === probeId
      ? {
          ...probe,
          isRunning: false,
          result: buildStoppedProbeResult(probeId, mode),
        }
      : probe,
  )
}

/**
 * Stop the whole list: probes that already produced a result keep it, and the
 * probes the run never reached are reported as stopped rather than as pending.
 */
export function withUnfinishedProbesStopped(
  probes: ProbeItemState[],
): ProbeItemState[] {
  return probes.map((probe) =>
    probe.result
      ? { ...probe, isRunning: false }
      : {
          ...probe,
          isRunning: false,
          result: buildStoppedProbeResult(probe.definition.id),
        },
  )
}
