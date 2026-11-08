import { API_VERIFICATION_REQUEST_PROFILES } from "~/services/verification/aiApiVerification/types"
import { getProbePromptOverrides } from "~/services/verification/probePromptStore"

import { apiVerificationProbeRegistry } from "./probeRegistry"
import { createVerificationProfileHeaders } from "./requestProfiles"
import {
  API_VERIFICATION_MODES,
  API_VERIFICATION_PROBE_STATUSES,
} from "./types"
import type {
  ApiVerificationApiType,
  ApiVerificationMode,
  ApiVerificationProbeId,
  ApiVerificationProbePromptOverrides,
  ApiVerificationProbeResult,
  ApiVerificationRequestProfile,
} from "./types"

/**
 * Inputs for running a single verification probe.
 */
type RunApiVerificationProbeParams = {
  probeId: ApiVerificationProbeId
  baseUrl: string
  apiKey: string
  requestHeaders?: Record<string, string>
  requestProfile?: ApiVerificationRequestProfile
  requestProfileEnhanced?: boolean
  apiType: ApiVerificationApiType
  mode?: ApiVerificationMode
  modelId?: string
  fallbackModelId?: string
  /**
   * Per-probe prompt overrides. Omitted entries fall back to the saved
   * preferences, then to the built-in prompt.
   */
  probePromptOverrides?: ApiVerificationProbePromptOverrides
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

  const enhanced =
    params.requestProfile &&
    params.requestProfile !== API_VERIFICATION_REQUEST_PROFILES.Default &&
    params.requestProfileEnhanced
      ? { requestProfileEnhanced: true as const }
      : {}
  const profile = params.requestProfile

  // Resolve prompts once per call: the saved preference is the shared source,
  // and an explicit parameter still wins for tests and one-off callers.
  const probePromptOverrides: ApiVerificationProbePromptOverrides =
    params.probePromptOverrides ?? (await getProbePromptOverrides())

  const runnerParams = {
    baseUrl: params.baseUrl,
    apiKey: params.apiKey,
    requestHeaders: createVerificationProfileHeaders(
      params.requestProfile,
      params.requestHeaders,
      resolvedModelId,
      params.requestProfileEnhanced,
    ),
    requestProfile: params.requestProfile,
    requestProfileEnhanced: params.requestProfileEnhanced,
    apiType: params.apiType,
    modelId: resolvedModelId,
    mode: params.mode,
    probePromptOverrides,
    abortSignal: params.abortSignal,
  }

  if (!registryEntry.requiresModelId) {
    const result = await registryEntry.run(runnerParams)
    return profile
      ? { ...result, requestProfile: profile, ...enhanced }
      : result
  }

  if (!resolvedModelId) {
    return {
      id: params.probeId,
      ...(profile ? { requestProfile: profile } : {}),
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

  const result = await registryEntry.run({
    ...runnerParams,
    modelId: resolvedModelId,
  })
  return params.requestProfile
    ? { ...result, requestProfile: params.requestProfile, ...enhanced }
    : result
}
