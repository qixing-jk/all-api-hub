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

/** Empty containers and response metadata are not decision values; zero and false are. */
function hasDecisionValue(value: unknown): boolean {
  if (typeof value === "number") return Number.isFinite(value)
  if (typeof value === "boolean") return true
  if (typeof value === "string") return value.trim().length > 0
  if (Array.isArray(value)) return value.some(hasDecisionValue)
  if (value && typeof value === "object") {
    return Object.entries(value).some(
      ([key, entry]) => key !== "type" && hasDecisionValue(entry),
    )
  }
  return false
}

/**
 * Baseline decision model probe for models supporting /v1/decisions (e.g. Cloudflare Clef).
 */
export async function runDecisionProbe(
  params: ModelProbeParams,
): Promise<ApiVerificationProbeResult> {
  const startedAt = nowMs()
  const unsupported = getOpenAiProtocolUnsupportedResult(
    params,
    API_VERIFICATION_PROBE_IDS.Decision,
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
      state: "ping",
      questions: {
        ping: {
          type: "noul",
          instructions: "Is this a verification test?",
        },
      },
    }

    const payload = await postProbeJson(params, PROBE_PATHS.Decision, body)
    const data = isRecord(payload) ? payload : {}
    const decisionOutput =
      data.answers ??
      data.decisions ??
      data.decision ??
      data.probabilities ??
      data.result
    const ok = !data.error && hasDecisionValue(decisionOutput)

    return {
      id: API_VERIFICATION_PROBE_IDS.Decision,
      status: ok
        ? API_VERIFICATION_PROBE_STATUSES.Pass
        : API_VERIFICATION_PROBE_STATUSES.Fail,
      latencyMs: okLatency(startedAt),
      summary: ok ? "Decision probe succeeded" : "Unexpected decision response",
      summaryKey: ok
        ? "verifyDialog.summaries.decisionSucceeded"
        : "verifyDialog.summaries.decisionUnexpectedResponse",
      input: {
        apiType: params.apiType,
        baseUrl: params.baseUrl,
        modelId: params.modelId,
        state: body.state,
      },
      output: {
        decisions: decisionOutput,
      },
      details: ok ? { response: data } : undefined,
    }
  } catch (error) {
    if (isAbortError(error, params.abortSignal)) {
      throw error
    }

    const summary = toSanitizedErrorSummary(error, secretsToRedact)
    const diagnostics = buildSafeProbeFailureDiagnostics(error, summary)

    return {
      id: API_VERIFICATION_PROBE_IDS.Decision,
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
