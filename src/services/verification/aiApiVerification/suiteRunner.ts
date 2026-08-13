import { apiVerificationProbeRegistry } from "./probeRegistry"
import { getApiVerificationProbeDefinitions } from "./probes"
import { runModelsProbe } from "./probes/modelsProbe"
import {
  API_VERIFICATION_PROBE_IDS,
  API_VERIFICATION_PROBE_STATUSES,
} from "./types"
import type {
  ApiVerificationApiType,
  ApiVerificationProbeResult,
} from "./types"

type RunApiVerificationSuiteParams = {
  baseUrl: string
  apiKey: string
  apiType: ApiVerificationApiType
  requestedModelId?: string
  abortSignal?: AbortSignal
}

type ApiVerificationSuiteResult = {
  results: ApiVerificationProbeResult[]
  modelId?: string
}

/**
 * Orchestrate ordered execution of API verification probes.
 */
export async function runApiVerificationSuite(
  params: RunApiVerificationSuiteParams,
): Promise<ApiVerificationSuiteResult> {
  const results: ApiVerificationProbeResult[] = []
  const definitions = getApiVerificationProbeDefinitions(params.apiType)

  const modelsProbe = await runModelsProbe({
    baseUrl: params.baseUrl,
    apiKey: params.apiKey,
    apiType: params.apiType,
    abortSignal: params.abortSignal,
  })
  results.push(modelsProbe.result)

  const resolvedModelId = params.requestedModelId ?? modelsProbe.modelId
  if (!resolvedModelId) {
    for (const definition of definitions) {
      if (definition.id === API_VERIFICATION_PROBE_IDS.Models) continue
      if (definition.id === API_VERIFICATION_PROBE_IDS.WebSearch) {
        results.push({
          id: API_VERIFICATION_PROBE_IDS.WebSearch,
          status: API_VERIFICATION_PROBE_STATUSES.Unsupported,
          latencyMs: 0,
          summary: "Web search probe requires explicit API type support",
          summaryKey: "verifyDialog.summaries.webSearchRequiresExplicitSupport",
        })
        continue
      }

      results.push({
        id: definition.id,
        status: API_VERIFICATION_PROBE_STATUSES.Fail,
        latencyMs: 0,
        summary: "No model available to run probes",
        summaryKey: "verifyDialog.summaries.noModelAvailableToRunProbes",
      })
    }

    return { results }
  }

  for (const definition of definitions) {
    if (definition.id === API_VERIFICATION_PROBE_IDS.Models) continue
    const entry = apiVerificationProbeRegistry[definition.id]
    results.push(
      await entry.run({
        baseUrl: params.baseUrl,
        apiKey: params.apiKey,
        apiType: params.apiType,
        modelId: resolvedModelId,
        abortSignal: params.abortSignal,
      }),
    )
  }

  return { results, modelId: resolvedModelId }
}
