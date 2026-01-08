import { apiVerificationProbeRegistry } from "./probeRegistry"
import { getApiVerificationProbeDefinitions } from "./probes"
import { runModelsProbe } from "./probes/modelsProbe"
import type {
  ApiVerificationApiType,
  ApiVerificationProbeResult,
} from "./types"

type RunApiVerificationSuiteParams = {
  baseUrl: string
  apiKey: string
  apiType: ApiVerificationApiType
  requestedModelId?: string
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

  if (params.apiType === "openai-compatible") {
    const modelsProbe = await runModelsProbe({
      baseUrl: params.baseUrl,
      apiKey: params.apiKey,
    })
    results.push(modelsProbe.result)

    const resolvedModelId = params.requestedModelId ?? modelsProbe.modelId
    if (!resolvedModelId) {
      for (const definition of definitions) {
        if (definition.id === "models") continue
        if (definition.id === "web-search") {
          results.push({
            id: "web-search",
            status: "unsupported",
            latencyMs: 0,
            summary: "Web search probe requires explicit API type support",
            summaryKey:
              "verifyDialog.summaries.webSearchRequiresExplicitSupport",
          })
          continue
        }

        results.push({
          id: definition.id,
          status: "fail",
          latencyMs: 0,
          summary: "No model available to run probes",
          summaryKey: "verifyDialog.summaries.noModelAvailableToRunProbes",
        })
      }

      return { results }
    }

    for (const definition of definitions) {
      if (definition.id === "models") continue
      const entry = apiVerificationProbeRegistry[definition.id]
      results.push(
        await entry.run({
          baseUrl: params.baseUrl,
          apiKey: params.apiKey,
          apiType: params.apiType,
          modelId: resolvedModelId,
        }),
      )
    }

    return { results, modelId: resolvedModelId }
  }

  if (!params.requestedModelId) {
    for (const definition of definitions) {
      if (definition.id === "web-search") {
        results.push({
          id: "web-search",
          status: "unsupported",
          latencyMs: 0,
          summary: "Web search probe requires explicit API type support",
          summaryKey: "verifyDialog.summaries.webSearchRequiresExplicitSupport",
        })
        continue
      }

      results.push({
        id: definition.id,
        status: "fail",
        latencyMs: 0,
        summary: "No model id provided to run probes",
        summaryKey: "verifyDialog.summaries.noModelIdProvidedToRunProbes",
      })
    }

    return { results }
  }

  for (const definition of definitions) {
    const entry = apiVerificationProbeRegistry[definition.id]
    results.push(
      await entry.run({
        baseUrl: params.baseUrl,
        apiKey: params.apiKey,
        apiType: params.apiType,
        modelId: params.requestedModelId,
      }),
    )
  }

  return { results, modelId: params.requestedModelId }
}
