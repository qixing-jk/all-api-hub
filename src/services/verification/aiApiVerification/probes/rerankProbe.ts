import { isRecord } from "~/utils/core/object"

import { getOpenAiProtocolUnsupportedResult } from "../probeProtocol"
import { nowMs, okLatency } from "../probeTiming"
import {
  API_VERIFICATION_PROBE_IDS,
  API_VERIFICATION_PROBE_STATUSES,
  type ApiVerificationProbeResult,
} from "../types"
import {
  buildSafeProbeFailureDiagnostics,
  isAbortError,
  toSanitizedErrorSummary,
} from "../utils"
import {
  postProbeJson,
  PROBE_PATHS,
  type ModelProbeParams,
} from "./probeTransport"

/**
 * Baseline rerank probe for models supporting /v1/rerank.
 */
export async function runRerankProbe(
  params: ModelProbeParams,
): Promise<ApiVerificationProbeResult> {
  const startedAt = nowMs()
  const unsupported = getOpenAiProtocolUnsupportedResult(
    params,
    API_VERIFICATION_PROBE_IDS.Rerank,
    startedAt,
  )
  if (unsupported) return unsupported
  const secretsToRedact = [
    params.apiKey,
    ...Object.values(params.requestHeaders ?? {}),
  ]

  try {
    const body = {
      model: params.modelId,
      query: "ping",
      documents: ["ping", "pong"],
    }

    const payload = await postProbeJson(params, PROBE_PATHS.Rerank, body)
    const data = isRecord(payload) ? payload : {}
    const results = data.results ?? data.data
    const ok = Array.isArray(results) && results.length > 0

    return {
      id: API_VERIFICATION_PROBE_IDS.Rerank,
      status: ok
        ? API_VERIFICATION_PROBE_STATUSES.Pass
        : API_VERIFICATION_PROBE_STATUSES.Fail,
      latencyMs: okLatency(startedAt),
      summary: ok ? "Rerank succeeded" : "Unexpected rerank response",
      summaryKey: ok
        ? "verifyDialog.summaries.rerankSucceeded"
        : "verifyDialog.summaries.rerankUnexpectedResponse",
      input: {
        apiType: params.apiType,
        baseUrl: params.baseUrl,
        modelId: params.modelId,
        query: body.query,
      },
      output: {
        resultsCount: Array.isArray(results) ? results.length : 0,
      },
      details: ok ? { topResult: results[0] } : undefined,
    }
  } catch (error) {
    if (isAbortError(error, params.abortSignal)) {
      throw error
    }

    const summary = toSanitizedErrorSummary(error, secretsToRedact)
    const diagnostics = buildSafeProbeFailureDiagnostics(error, summary)

    return {
      id: API_VERIFICATION_PROBE_IDS.Rerank,
      status: API_VERIFICATION_PROBE_STATUSES.Fail,
      latencyMs: okLatency(startedAt),
      summary,
      summaryKey: diagnostics.summaryKey,
      summaryParams: diagnostics.summaryParams,
      input: {
        apiType: params.apiType,
        baseUrl: params.baseUrl,
        modelId: params.modelId,
      },
      output: diagnostics.output,
    }
  }
}
