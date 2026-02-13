import { fetchAnthropicModelIds } from "~/services/apiService/anthropic"
import { fetchGoogleModelIds } from "~/services/apiService/google"
import { fetchOpenAICompatibleModelIds } from "~/services/apiService/openaiCompatible"

import { nowMs, okLatency } from "../probeTiming"
import type {
  ApiVerificationApiType,
  ApiVerificationProbeResult,
} from "../types"
import { API_TYPES } from "../types"
import { toSanitizedErrorSummary } from "../utils"

type RunModelsProbeParams = {
  baseUrl: string
  apiKey: string
  apiType: ApiVerificationApiType
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
 *
 */
function stripQueryAndHash(baseUrl: string): string {
  const trimmed = (baseUrl || "").trim()
  if (!trimmed) return trimmed

  let cutoff = trimmed.length
  const queryIndex = trimmed.indexOf("?")
  const hashIndex = trimmed.indexOf("#")
  if (queryIndex >= 0) cutoff = Math.min(cutoff, queryIndex)
  if (hashIndex >= 0) cutoff = Math.min(cutoff, hashIndex)
  return trimmed.slice(0, cutoff)
}

/**
 *
 */
function normalizeModelsBaseUrl(
  apiType: ApiVerificationApiType,
  baseUrl: string,
): string {
  const trimmed = stripQueryAndHash(baseUrl).replace(/\/+$/, "")
  if (!trimmed) return trimmed

  const segmentToStrip = apiType === API_TYPES.GOOGLE ? "v1beta" : "v1"
  const match = new RegExp(`/(?:${segmentToStrip})(?:/|$)`, "i").exec(trimmed)
  if (!match) return trimmed

  return trimmed.slice(0, match.index).replace(/\/+$/, "")
}

/**
 * Probe models listing reachability and parseability and return a suggested model id.
 */
export async function runModelsProbe(
  params: RunModelsProbeParams,
): Promise<{ result: ApiVerificationProbeResult; modelId?: string }> {
  const startedAt = nowMs()
  try {
    const normalizedBaseUrl = normalizeModelsBaseUrl(
      params.apiType,
      params.baseUrl,
    )

    const endpoint =
      params.apiType === API_TYPES.GOOGLE ? "/v1beta/models" : "/v1/models"

    const modelIds = await (async () => {
      if (
        params.apiType === API_TYPES.OPENAI_COMPATIBLE ||
        params.apiType === API_TYPES.OPENAI
      ) {
        return fetchOpenAICompatibleModelIds({
          baseUrl: normalizedBaseUrl,
          apiKey: params.apiKey,
        })
      }

      if (params.apiType === API_TYPES.ANTHROPIC) {
        return fetchAnthropicModelIds({
          baseUrl: normalizedBaseUrl,
          apiKey: params.apiKey,
        })
      }

      return fetchGoogleModelIds({
        baseUrl: normalizedBaseUrl,
        apiKey: params.apiKey,
      })
    })()

    const suggestedModelId = pickSuggestedModelId(params.apiType, modelIds)

    return {
      modelId: suggestedModelId,
      result: {
        id: "models",
        status: modelIds.length > 0 ? "pass" : "fail",
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
    return {
      result: {
        id: "models",
        status: "fail",
        latencyMs: okLatency(startedAt),
        summary: toSanitizedErrorSummary(error, [params.apiKey]),
        input: {
          endpoint:
            params.apiType === API_TYPES.GOOGLE
              ? "/v1beta/models"
              : "/v1/models",
          baseUrl: normalizeModelsBaseUrl(params.apiType, params.baseUrl),
          apiType: params.apiType,
        },
      },
    }
  }
}
