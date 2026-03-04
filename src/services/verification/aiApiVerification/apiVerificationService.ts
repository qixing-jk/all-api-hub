import type { ApiToken } from "~/types"

import { resolveRequestedModelId } from "./modelResolver"
import { apiVerificationProbeRegistry } from "./probeRegistry"
import { runApiVerificationSuite } from "./suiteRunner"
import type {
  ApiVerificationApiType,
  ApiVerificationProbeId,
  ApiVerificationProbeResult,
  ApiVerificationReport,
} from "./types"

/**
 * Shared inputs for running verification probes or suites.
 */
type RunApiVerificationParams = {
  baseUrl: string
  apiKey: string
  apiType: ApiVerificationApiType
  modelId?: string
  tokenMeta?: Pick<ApiToken, "models" | "model_limits" | "name" | "id">
}

/**
 * Inputs for running a single verification probe.
 */
export type RunApiVerificationProbeParams = RunApiVerificationParams & {
  probeId: ApiVerificationProbeId
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
  const resolvedModelId = resolveRequestedModelId(params)

  if (registryEntry.requiresModelId && !resolvedModelId?.trim()) {
    return {
      id: params.probeId,
      status: "fail",
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
  })
}

/**
 * Run the API verification suite for a given base URL + API key.
 */
export async function runApiVerification(
  params: RunApiVerificationParams,
): Promise<ApiVerificationReport> {
  const startedAt = Date.now()
  const requestedModelId = resolveRequestedModelId(params)

  const { results, modelId } = await runApiVerificationSuite({
    baseUrl: params.baseUrl,
    apiKey: params.apiKey,
    apiType: params.apiType,
    requestedModelId,
  })

  return {
    baseUrl: params.baseUrl,
    apiType: params.apiType,
    modelId,
    startedAt,
    finishedAt: Date.now(),
    results,
  }
}
