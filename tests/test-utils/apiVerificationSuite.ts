import { runApiVerificationProbe } from "~/services/verification/aiApiVerification/apiVerificationService"
import { getApiVerificationProbeDefinitions } from "~/services/verification/aiApiVerification/probes"
import { API_VERIFICATION_PROBE_IDS } from "~/services/verification/aiApiVerification/types"

/**
 * Exercises each production probe for shared protocol/HTTP test scenarios.
 * This harness does not define UI orchestration or synthesize probe outcomes.
 */
export async function runApiVerificationTestSuite(
  params: Omit<Parameters<typeof runApiVerificationProbe>[0], "probeId">,
) {
  const models = await runApiVerificationProbe({
    ...params,
    probeId: API_VERIFICATION_PROBE_IDS.Models,
  })
  const output = models.output as
    | { suggestedModelId?: string | null }
    | undefined
  const modelId =
    params.modelId?.trim() ||
    params.fallbackModelId?.trim() ||
    output?.suggestedModelId ||
    undefined
  const results = [models]
  for (const definition of getApiVerificationProbeDefinitions(params.apiType)) {
    if (definition.id === API_VERIFICATION_PROBE_IDS.Models) continue
    results.push(
      await runApiVerificationProbe({
        ...params,
        modelId,
        probeId: definition.id,
      }),
    )
  }
  return { baseUrl: params.baseUrl, apiType: params.apiType, modelId, results }
}
