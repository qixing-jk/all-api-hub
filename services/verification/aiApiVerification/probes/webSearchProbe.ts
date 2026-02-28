import { generateText } from "ai"

import { nowMs, okLatency } from "../probeTiming"
import { createGoogleProvider, createOpenAIProvider } from "../providers"
import type {
  ApiVerificationApiType,
  ApiVerificationProbeResult,
} from "../types"
import { toSanitizedErrorSummary } from "../utils"

type RunWebSearchProbeParams = {
  baseUrl: string
  apiKey: string
  apiType: ApiVerificationApiType
  modelId: string
}

/**
 * Web search / grounding probe.
 */
export async function runWebSearchProbe(
  params: RunWebSearchProbeParams,
): Promise<ApiVerificationProbeResult> {
  const startedAt = nowMs()
  const secretsToRedact = [params.apiKey]

  if (params.apiType === "anthropic") {
    return {
      id: "web-search",
      status: "unsupported",
      latencyMs: okLatency(startedAt),
      summary: "Web search probe is not supported for Anthropic endpoints",
      summaryKey: "verifyDialog.summaries.webSearchUnsupportedAnthropic",
      input: {
        apiType: params.apiType,
        baseUrl: params.baseUrl,
        modelId: params.modelId,
      },
    }
  }

  try {
    if (params.apiType === "openai") {
      const provider = createOpenAIProvider({
        baseUrl: params.baseUrl,
        apiKey: params.apiKey,
      })

      const prompt = "Use web search to find one recent headline about AI SDK."
      const result = await generateText({
        model: provider(params.modelId),
        prompt,
        tools: {
          web_search: provider.tools.webSearch({
            externalWebAccess: true,
            searchContextSize: "low",
          }),
        },
        toolChoice: { type: "tool", toolName: "web_search" },
      })

      const searched =
        (result.toolResults ?? []).some(
          (call) => call.toolName === "web_search",
        ) || (result.sources ?? []).length > 0

      return {
        id: "web-search",
        status: searched ? "pass" : "fail",
        latencyMs: okLatency(startedAt),
        summary: searched ? "Web search succeeded" : "No web search results",
        summaryKey: searched
          ? "verifyDialog.summaries.webSearchSucceeded"
          : "verifyDialog.summaries.webSearchNoResults",
        input: {
          apiType: params.apiType,
          baseUrl: params.baseUrl,
          modelId: params.modelId,
          prompt,
          toolName: "web_search",
        },
        output: {
          sourcesCount: (result.sources ?? []).length,
          toolResultsCount: (result.toolResults ?? []).length,
          sourcesPreview: (result.sources ?? []).slice(0, 3),
        },
      }
    }

    if (params.apiType === "google") {
      const google = createGoogleProvider({
        baseUrl: params.baseUrl,
        apiKey: params.apiKey,
      })

      const prompt =
        "Use Google search grounding to find one recent AI headline."
      const result = await generateText({
        model: google(params.modelId),
        prompt,
        tools: {
          google_search: google.tools.googleSearch({}),
        },
        toolChoice: { type: "tool", toolName: "google_search" },
      })

      const searched =
        (result.toolResults ?? []).some(
          (call) => call.toolName === "google_search",
        ) || (result.sources ?? []).length > 0

      return {
        id: "web-search",
        status: searched ? "pass" : "fail",
        latencyMs: okLatency(startedAt),
        summary: searched
          ? "Web search/grounding succeeded"
          : "No web search/grounding results",
        summaryKey: searched
          ? "verifyDialog.summaries.webSearchGroundingSucceeded"
          : "verifyDialog.summaries.webSearchGroundingNoResults",
        input: {
          apiType: params.apiType,
          baseUrl: params.baseUrl,
          modelId: params.modelId,
          prompt,
          toolName: "google_search",
        },
        output: {
          sourcesCount: (result.sources ?? []).length,
          toolResultsCount: (result.toolResults ?? []).length,
          sourcesPreview: (result.sources ?? []).slice(0, 3),
        },
      }
    }

    return {
      id: "web-search",
      status: "unsupported",
      latencyMs: okLatency(startedAt),
      summary: "Web search probe is not supported for this API type",
      summaryKey: "verifyDialog.summaries.webSearchUnsupportedForApiType",
      input: {
        apiType: params.apiType,
        baseUrl: params.baseUrl,
        modelId: params.modelId,
      },
    }
  } catch (error) {
    return {
      id: "web-search",
      status: "fail",
      latencyMs: okLatency(startedAt),
      summary: toSanitizedErrorSummary(error, secretsToRedact),
      input: {
        apiType: params.apiType,
        baseUrl: params.baseUrl,
        modelId: params.modelId,
      },
    }
  }
}
