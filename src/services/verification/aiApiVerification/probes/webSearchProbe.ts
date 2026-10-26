import { nowMs, okLatency } from "../probeTiming"
import { createGoogleProvider, createOpenAIProvider } from "../providers"
import {
  API_TYPES,
  API_VERIFICATION_MODES,
  API_VERIFICATION_PROBE_IDS,
  API_VERIFICATION_PROBE_STATUSES,
} from "../types"
import type {
  ApiVerificationApiType,
  ApiVerificationMode,
  ApiVerificationProbePromptOverrides,
  ApiVerificationProbeResult,
  ApiVerificationRequestProfile,
} from "../types"
import {
  buildSafeProbeFailureDiagnostics,
  isAbortError,
  toSanitizedErrorSummary,
} from "../utils"
import { runProbeGeneration } from "./probeGeneration"
import { resolveProbePrompt } from "./probePrompts"

type RunWebSearchProbeParams = {
  baseUrl: string
  apiKey: string
  requestHeaders?: Record<string, string>
  requestProfile?: ApiVerificationRequestProfile
  requestProfileEnhanced?: boolean
  apiType: ApiVerificationApiType
  modelId: string
  mode?: ApiVerificationMode
  probePromptOverrides?: ApiVerificationProbePromptOverrides
  abortSignal?: AbortSignal
}

/**
 * Web search / grounding probe.
 */
export async function runWebSearchProbe(
  params: RunWebSearchProbeParams,
): Promise<ApiVerificationProbeResult> {
  const startedAt = nowMs()
  const mode = params.mode ?? API_VERIFICATION_MODES.Streaming
  const secretsToRedact = [
    params.apiKey,
    ...Object.values(params.requestHeaders ?? {}),
  ]

  if (params.apiType === API_TYPES.ANTHROPIC) {
    return {
      id: API_VERIFICATION_PROBE_IDS.WebSearch,
      status: API_VERIFICATION_PROBE_STATUSES.Unsupported,
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
    if (params.apiType === API_TYPES.OPENAI) {
      const provider = createOpenAIProvider({
        requestProfile: params.requestProfile,
        requestProfileEnhanced: params.requestProfileEnhanced,
        baseUrl: params.baseUrl,
        apiKey: params.apiKey,
        ...(params.requestHeaders
          ? { requestHeaders: params.requestHeaders }
          : {}),
      })

      const prompt = resolveProbePrompt(
        API_VERIFICATION_PROBE_IDS.WebSearch,
        params.probePromptOverrides,
      )!
      const result = await runProbeGeneration(
        {
          model: provider(params.modelId),
          prompt,
          tools: {
            web_search: provider.tools.webSearch({
              externalWebAccess: true,
              searchContextSize: "low",
            }),
          },
          toolChoice: { type: "tool", toolName: "web_search" },
          abortSignal: params.abortSignal,
        },
        mode,
      )

      const searched =
        (result.toolResults ?? []).some(
          (call) => call.toolName === "web_search",
        ) || (result.sources ?? []).length > 0

      return {
        id: API_VERIFICATION_PROBE_IDS.WebSearch,
        mode,
        status: searched
          ? API_VERIFICATION_PROBE_STATUSES.Pass
          : API_VERIFICATION_PROBE_STATUSES.Fail,
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

    if (params.apiType === API_TYPES.GOOGLE) {
      const google = createGoogleProvider({
        requestProfile: params.requestProfile,
        requestProfileEnhanced: params.requestProfileEnhanced,
        baseUrl: params.baseUrl,
        apiKey: params.apiKey,
        ...(params.requestHeaders
          ? { requestHeaders: params.requestHeaders }
          : {}),
      })

      const prompt = resolveProbePrompt(
        API_VERIFICATION_PROBE_IDS.WebSearch,
        params.probePromptOverrides,
      )!
      const result = await runProbeGeneration(
        {
          model: google(params.modelId),
          prompt,
          tools: {
            google_search: google.tools.googleSearch({}),
          },
          // Google reports grounding as sources rather than a function call.
          // SDK 7 enforces forced tool calls; validate the search evidence below.
          toolChoice: "auto",
          abortSignal: params.abortSignal,
        },
        mode,
      )

      const searched =
        (result.toolResults ?? []).some(
          (call) => call.toolName === "google_search",
        ) || (result.sources ?? []).length > 0

      return {
        id: API_VERIFICATION_PROBE_IDS.WebSearch,
        mode,
        status: searched
          ? API_VERIFICATION_PROBE_STATUSES.Pass
          : API_VERIFICATION_PROBE_STATUSES.Fail,
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
      id: API_VERIFICATION_PROBE_IDS.WebSearch,
      status: API_VERIFICATION_PROBE_STATUSES.Unsupported,
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
    if (isAbortError(error, params.abortSignal)) {
      throw error
    }

    const summary = toSanitizedErrorSummary(error, secretsToRedact)
    const diagnostics = buildSafeProbeFailureDiagnostics(error, summary)

    return {
      id: API_VERIFICATION_PROBE_IDS.WebSearch,
      status: API_VERIFICATION_PROBE_STATUSES.Fail,
      mode,
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
