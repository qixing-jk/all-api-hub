import { fetchAnthropicModelIds } from "~/services/aiApi/anthropic"
import { fetchGoogleModelIds } from "~/services/aiApi/google"
import { fetchOpenAICompatibleModelIds } from "~/services/aiApi/openaiCompatible"
import { toVersionedProtocolMount } from "~/services/aiApi/protocolAddress"

import { nowMs, okLatency } from "../probeTiming"
import type {
  ApiVerificationApiType,
  ApiVerificationProbeResult,
} from "../types"
import {
  API_TYPES,
  API_VERIFICATION_PROBE_IDS,
  API_VERIFICATION_PROBE_STATUSES,
} from "../types"
import {
  buildSafeProbeFailureDiagnostics,
  isAbortError,
  toSanitizedErrorSummary,
} from "../utils"

type RunModelsProbeParams = {
  baseUrl: string
  apiKey: string
  apiType: ApiVerificationApiType
  abortSignal?: AbortSignal
}

/**
 * Best-effort model id suggestion derived from returned model ids.
 */
function pickSuggestedModelId(
  apiType: ApiVerificationApiType,
  modelIds: string[],
): string | undefined {
  const normalized = modelIds
    .filter((id) => typeof id === "string" && id.trim())
    .map((id) => id.trim())

  if (normalized.length === 0) return undefined

  const preferredPrefixes = (() => {
    if (apiType === API_TYPES.GOOGLE) return ["gemini"]
    if (apiType === API_TYPES.ANTHROPIC) return ["claude"]
    return ["gpt", "o"]
  })()

  const preferred = normalized.find((id) => {
    const lower = id.toLowerCase()
    return preferredPrefixes.some((prefix) =>
      prefix === "o" ? /^o\d/i.test(id) : lower.startsWith(prefix),
    )
  })

  return preferred ?? normalized[0]
}

/**
 * Probe models listing reachability and parseability and return a suggested model id.
 */
export async function runModelsProbe(
  params: RunModelsProbeParams,
): Promise<{ result: ApiVerificationProbeResult; modelId?: string }> {
  const startedAt = nowMs()
  try {
    const normalizedBaseUrl = toVersionedProtocolMount(
      params.apiType,
      params.baseUrl,
    )
    if (!normalizedBaseUrl) throw new Error("Invalid protocol API base URL")
    const endpoint = "models"

    const modelIds = await (async () => {
      if (
        params.apiType === API_TYPES.OPENAI_COMPATIBLE ||
        params.apiType === API_TYPES.OPENAI
      ) {
        return fetchOpenAICompatibleModelIds({
          baseUrl: normalizedBaseUrl,
          apiKey: params.apiKey,
          abortSignal: params.abortSignal,
        })
      }

      if (params.apiType === API_TYPES.ANTHROPIC) {
        return fetchAnthropicModelIds({
          baseUrl: normalizedBaseUrl,
          apiKey: params.apiKey,
          abortSignal: params.abortSignal,
        })
      }

      if (params.apiType === API_TYPES.GOOGLE) {
        return fetchGoogleModelIds({
          baseUrl: normalizedBaseUrl,
          apiKey: params.apiKey,
          abortSignal: params.abortSignal,
        })
      }

      throw new Error("Unsupported apiType")
    })()

    const suggestedModelId = pickSuggestedModelId(params.apiType, modelIds)

    return {
      modelId: suggestedModelId,
      result: {
        id: API_VERIFICATION_PROBE_IDS.Models,
        status:
          modelIds.length > 0
            ? API_VERIFICATION_PROBE_STATUSES.Pass
            : API_VERIFICATION_PROBE_STATUSES.Fail,
        latencyMs: okLatency(startedAt),
        summary:
          modelIds.length > 0
            ? `Fetched ${modelIds.length} models`
            : "No models returned",
        summaryKey:
          modelIds.length > 0
            ? "verifyDialog.summaries.modelsFetched"
            : "verifyDialog.summaries.noModelsReturned",
        summaryParams: modelIds.length > 0 ? { count: modelIds.length } : {},
        input: {
          endpoint,
          baseUrl: normalizedBaseUrl,
          apiType: params.apiType,
        },
        output: {
          modelCount: modelIds.length,
          suggestedModelId: suggestedModelId ?? null,
          modelIdsPreview: modelIds.slice(0, 20),
        },
        details:
          modelIds.length > 0 ? { modelCount: modelIds.length } : undefined,
      },
    }
  } catch (error) {
    if (isAbortError(error, params.abortSignal)) {
      throw error
    }

    const summary = toSanitizedErrorSummary(error, [params.apiKey])
    const diagnostics = buildSafeProbeFailureDiagnostics(error, summary)

    return {
      result: {
        id: API_VERIFICATION_PROBE_IDS.Models,
        status: API_VERIFICATION_PROBE_STATUSES.Fail,
        latencyMs: okLatency(startedAt),
        summary,
        summaryKey: diagnostics.summaryKey,
        summaryParams: diagnostics.summaryParams,
        input: {
          endpoint: "models",
          baseUrl:
            toVersionedProtocolMount(params.apiType, params.baseUrl) ??
            params.baseUrl.trim(),
          apiType: params.apiType,
        },
        output: diagnostics.output,
      },
    }
  }
}
