import { okLatency } from "./probeTiming"
import {
  API_TYPES,
  API_VERIFICATION_PROBE_STATUSES,
  type ApiVerificationApiType,
  type ApiVerificationProbeId,
  type ApiVerificationProbeResult,
} from "./types"

/** OpenAI-shaped operations must not be sent to native Google or Anthropic mounts. */
export function getOpenAiProtocolUnsupportedResult(
  params: { apiType: ApiVerificationApiType; baseUrl: string; modelId: string },
  probeId: ApiVerificationProbeId,
  startedAt: number,
): ApiVerificationProbeResult | undefined {
  if (
    params.apiType === API_TYPES.OPENAI ||
    params.apiType === API_TYPES.OPENAI_COMPATIBLE
  )
    return undefined
  return {
    id: probeId,
    status: API_VERIFICATION_PROBE_STATUSES.Unsupported,
    latencyMs: okLatency(startedAt),
    summary: "This test requires an OpenAI-compatible API endpoint",
    summaryKey: "verifyDialog.summaries.probeRequiresOpenAiProtocol",
    input: {
      apiType: params.apiType,
      baseUrl: params.baseUrl,
      modelId: params.modelId,
    },
  }
}
