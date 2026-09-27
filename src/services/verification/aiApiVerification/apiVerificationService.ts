import { apiVerificationProbeRegistry } from "./probeRegistry"
import {
  API_VERIFICATION_MODES,
  API_VERIFICATION_PROBE_STATUSES,
} from "./types"
import type {
  ApiVerificationApiType,
  ApiVerificationMode,
  ApiVerificationProbeId,
  ApiVerificationProbeResult,
} from "./types"

/**
 * Inputs for running a single verification probe.
 */
type RunApiVerificationProbeParams = {
  probeId: ApiVerificationProbeId
  baseUrl: string
  apiKey: string
  apiType: ApiVerificationApiType
  mode?: ApiVerificationMode
  modelId?: string
  fallbackModelId?: string
  abortSignal?: AbortSignal
}

/**
 * Run a single API verification probe.
 *
 * This is used by the UI to execute and retry probes independently.
 */
export async function runApiVerificationProbe(
  params: RunApiVerificationProbeParams,
): Promise<ApiVerificationProbeResult> {
  const registryEntry = apiVerificationProbeRegistry[params.probeId]
  const resolvedModelId =
    params.modelId?.trim() || params.fallbackModelId?.trim() || undefined

  if (registryEntry.requiresModelId && !resolvedModelId?.trim()) {
    return {
      id: params.probeId,
      mode: params.mode ?? API_VERIFICATION_MODES.Streaming,
      status: API_VERIFICATION_PROBE_STATUSES.Fail,
      latencyMs: 0,
      summary: "No model id provided",
      summaryKey: "verifyDialog.summaries.noModelIdProvided",
      input: {
        apiType: params.apiType,
        baseUrl: params.baseUrl,
      },
    }
  }

  return registryEntry.run({
    baseUrl: params.baseUrl,
    apiKey: params.apiKey,
    apiType: params.apiType,
    modelId: resolvedModelId,
    mode: params.mode,
    abortSignal: params.abortSignal,
  })
}
