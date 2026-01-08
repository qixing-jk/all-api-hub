import { createAnthropic } from "@ai-sdk/anthropic"
import { createGoogleGenerativeAI } from "@ai-sdk/google"
import { createOpenAI } from "@ai-sdk/openai"
import { createOpenAICompatible } from "@ai-sdk/openai-compatible"
import { generateText, jsonSchema, Output, stepCountIs, tool } from "ai"
import { z } from "zod"

import { fetchOpenAICompatibleModelIds } from "~/services/apiService/openaiCompatible"
import type { ApiToken } from "~/types"

import type {
  ApiVerificationApiType,
  ApiVerificationProbeId,
  ApiVerificationProbeResult,
  ApiVerificationReport,
} from "./types"
import {
  coerceBaseUrlToAnthropicV1,
  coerceBaseUrlToGoogleV1beta,
  coerceBaseUrlToV1,
  guessModelIdFromToken,
  toSanitizedErrorSummary,
} from "./utils"

type RunApiVerificationParams = {
  baseUrl: string
  apiKey: string
  apiType: ApiVerificationApiType
  modelId?: string
  tokenMeta?: Pick<ApiToken, "models" | "model_limits" | "name" | "id">
}

export type RunApiVerificationProbeParams = RunApiVerificationParams & {
  probeId: ApiVerificationProbeId
}

/**
 * Get current timestamp in milliseconds.
 */
function nowMs() {
  return Date.now()
}

/**
 * Compute a non-negative latency based on the provided start timestamp.
 */
function okLatency(startedAt: number) {
  return Math.max(0, nowMs() - startedAt)
}

/**
 * Resolve the model id requested by the caller.
 * Falls back to a best-effort guess from token metadata.
 */
function resolveRequestedModelId(
  params: RunApiVerificationParams,
): string | undefined {
  const tokenHint = params.tokenMeta
    ? guessModelIdFromToken(params.tokenMeta)
    : undefined
  return params.modelId ?? tokenHint
}

type CreateModelParams = {
  baseUrl: string
  apiKey: string
  apiType: ApiVerificationApiType
  modelId: string
}

/**
 * Create an AI SDK model instance for the selected API type and model id.
 */
function createModel(params: CreateModelParams) {
  if (params.apiType === "openai-compatible") {
    return createOpenAICompatible({
      name: "all-api-hub",
      baseURL: coerceBaseUrlToV1(params.baseUrl),
      apiKey: params.apiKey,
    })(params.modelId)
  }

  if (params.apiType === "openai") {
    return createOpenAI({
      baseURL: coerceBaseUrlToV1(params.baseUrl),
      apiKey: params.apiKey,
    })(params.modelId)
  }

  if (params.apiType === "anthropic") {
    return createAnthropic({
      baseURL: coerceBaseUrlToAnthropicV1(params.baseUrl),
      apiKey: params.apiKey,
    })(params.modelId)
  }

  return createGoogleGenerativeAI({
    baseURL: coerceBaseUrlToGoogleV1beta(params.baseUrl),
    apiKey: params.apiKey,
  })(params.modelId)
}

/**
 * Create an OpenAI provider instance with proxy/baseUrl override.
 */
function createOpenAIProvider(params: { baseUrl: string; apiKey: string }) {
  return createOpenAI({
    baseURL: coerceBaseUrlToV1(params.baseUrl),
    apiKey: params.apiKey,
  })
}

/**
 * Create a Google/Gemini provider instance with proxy/baseUrl override.
 */
function createGoogleProvider(params: { baseUrl: string; apiKey: string }) {
  return createGoogleGenerativeAI({
    baseURL: coerceBaseUrlToGoogleV1beta(params.baseUrl),
    apiKey: params.apiKey,
  })
}

/**
 * Check whether the verification tool was called in the AI SDK result.
 */
function toolCalled(result: {
  toolCalls?: Array<{ toolName?: string }>
  toolResults?: Array<{ toolName?: string }>
}): boolean {
  return (
    (result.toolCalls ?? []).some((call) => call.toolName === "verify_tool") ||
    (result.toolResults ?? []).some((call) => call.toolName === "verify_tool")
  )
}

/**
 * Probe `/v1/models` reachability and parseability and return the first model id.
 */
async function runModelsProbe(params: {
  baseUrl: string
  apiKey: string
}): Promise<{ result: ApiVerificationProbeResult; modelId?: string }> {
  const startedAt = nowMs()
  try {
    const modelIds = await fetchOpenAICompatibleModelIds({
      baseUrl: params.baseUrl,
      apiKey: params.apiKey,
    })

    const firstModelId = modelIds.find(
      (id) => typeof id === "string" && id.trim(),
    )

    return {
      modelId: firstModelId,
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
          endpoint: "/v1/models",
          baseUrl: params.baseUrl,
        },
        output: {
          modelCount: modelIds.length,
          suggestedModelId: firstModelId ?? null,
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
          endpoint: "/v1/models",
          baseUrl: params.baseUrl,
        },
      },
    }
  }
}

/**
 * Baseline text generation probe for the selected API type.
 */
async function runTextGenerationProbe(params: {
  baseUrl: string
  apiKey: string
  apiType: ApiVerificationApiType
  modelId: string
}): Promise<ApiVerificationProbeResult> {
  const startedAt = nowMs()
  const secretsToRedact = [params.apiKey]

  try {
    const prompt = "Reply with exactly: OK"
    const model = createModel({
      baseUrl: params.baseUrl,
      apiKey: params.apiKey,
      apiType: params.apiType,
      modelId: params.modelId,
    })

    const result = await generateText({
      model,
      prompt,
    })

    const text = (result.text ?? "").trim().toLowerCase()
    const ok = text === "ok" || text.includes("ok")

    return {
      id: "text-generation",
      status: ok ? "pass" : "fail",
      latencyMs: okLatency(startedAt),
      summary: ok ? "Text generation succeeded" : "Unexpected response text",
      summaryKey: ok
        ? "verifyDialog.summaries.textGenerationSucceeded"
        : "verifyDialog.summaries.textGenerationUnexpectedResponse",
      input: {
        apiType: params.apiType,
        baseUrl: params.baseUrl,
        modelId: params.modelId,
        prompt,
      },
      output: {
        text: result.text ?? null,
      },
      details: ok
        ? undefined
        : { responsePreview: (result.text ?? "").slice(0, 80) },
    }
  } catch (error) {
    return {
      id: "text-generation",
      status: "fail",
      latencyMs: okLatency(startedAt),
      summary: toSanitizedErrorSummary(error, secretsToRedact),
      input: {
        apiType: params.apiType,
        baseUrl: params.baseUrl,
        modelId: params.modelId,
        prompt: "Reply with exactly: OK",
      },
    }
  }
}

/**
 * Tool/function calling probe.
 */
async function runToolCallingProbe(params: {
  baseUrl: string
  apiKey: string
  apiType: ApiVerificationApiType
  modelId: string
}): Promise<ApiVerificationProbeResult> {
  const startedAt = nowMs()
  const secretsToRedact = [params.apiKey]

  try {
    const model = createModel({
      baseUrl: params.baseUrl,
      apiKey: params.apiKey,
      apiType: params.apiType,
      modelId: params.modelId,
    })

    const verifyTool = tool({
      description: "Return a timestamp string.",
      inputSchema: jsonSchema<Record<string, never>>({
        type: "object",
        properties: {},
      }),
      execute: async () => ({ now: new Date().toISOString() }),
    })

    const prompt =
      "Call the verify_tool tool once. Reply with a short sentence that includes the returned time."
    const result = await generateText({
      model,
      prompt,
      tools: { verify_tool: verifyTool },
      toolChoice: "required",
      stopWhen: stepCountIs(3),
    })

    if (!toolCalled(result)) {
      return {
        id: "tool-calling",
        status: "fail",
        latencyMs: okLatency(startedAt),
        summary: "No tool call detected (model may not support tools)",
        summaryKey: "verifyDialog.summaries.noToolCallDetected",
        input: {
          apiType: params.apiType,
          baseUrl: params.baseUrl,
          modelId: params.modelId,
          prompt,
          tool: {
            name: "verify_tool",
            description: "Return a timestamp string.",
            inputSchema: { type: "object", properties: {} },
          },
          toolChoice: "required",
        },
        output: {
          text: (result as any).text ?? null,
          toolCalls: (result.toolCalls ?? []).slice(0, 20),
          toolResults: (result.toolResults ?? []).slice(0, 20),
        },
      }
    }

    return {
      id: "tool-calling",
      status: "pass",
      latencyMs: okLatency(startedAt),
      summary: "Tool call succeeded",
      summaryKey: "verifyDialog.summaries.toolCallSucceeded",
      input: {
        apiType: params.apiType,
        baseUrl: params.baseUrl,
        modelId: params.modelId,
        prompt,
        tool: {
          name: "verify_tool",
          description: "Return a timestamp string.",
          inputSchema: { type: "object", properties: {} },
        },
        toolChoice: "required",
      },
      output: {
        text: (result as any).text ?? null,
        toolCalls: (result.toolCalls ?? []).slice(0, 20),
        toolResults: (result.toolResults ?? []).slice(0, 20),
      },
    }
  } catch (error) {
    return {
      id: "tool-calling",
      status: "fail",
      latencyMs: okLatency(startedAt),
      summary: toSanitizedErrorSummary(error, secretsToRedact),
      input: {
        apiType: params.apiType,
        baseUrl: params.baseUrl,
        modelId: params.modelId,
        prompt:
          "Call the verify_tool tool once. Reply with a short sentence that includes the returned time.",
        tool: {
          name: "verify_tool",
          description: "Return a timestamp string.",
          inputSchema: { type: "object", properties: {} },
        },
        toolChoice: "required",
      },
    }
  }
}

/**
 * Structured output probe.
 */
async function runStructuredOutputProbe(params: {
  baseUrl: string
  apiKey: string
  apiType: ApiVerificationApiType
  modelId: string
}): Promise<ApiVerificationProbeResult> {
  const startedAt = nowMs()
  const secretsToRedact = [params.apiKey]

  try {
    const model = createModel({
      baseUrl: params.baseUrl,
      apiKey: params.apiKey,
      apiType: params.apiType,
      modelId: params.modelId,
    })

    const prompt = "Return a JSON object with shape { ok: true }."
    const { output } = await generateText({
      model,
      prompt,
      output: Output.object({
        schema: z.object({
          ok: z.literal(true),
        }),
      }),
    })

    return {
      id: "structured-output",
      status: output?.ok === true ? "pass" : "fail",
      latencyMs: okLatency(startedAt),
      summary:
        output?.ok === true ? "Structured output succeeded" : "Invalid output",
      summaryKey:
        output?.ok === true
          ? "verifyDialog.summaries.structuredOutputSucceeded"
          : "verifyDialog.summaries.structuredOutputInvalid",
      input: {
        apiType: params.apiType,
        baseUrl: params.baseUrl,
        modelId: params.modelId,
        prompt,
        schema: { ok: true },
      },
      output: {
        output: output ?? null,
      },
    }
  } catch (error) {
    const summary = toSanitizedErrorSummary(error, secretsToRedact)
    return {
      id: "structured-output",
      status: "fail",
      latencyMs: okLatency(startedAt),
      summary,
      input: {
        apiType: params.apiType,
        baseUrl: params.baseUrl,
        modelId: params.modelId,
        prompt: "Return a JSON object with shape { ok: true }.",
        schema: { ok: true },
      },
    }
  }
}

/**
 * Web search / grounding probe.
 */
async function runWebSearchProbe(params: {
  baseUrl: string
  apiKey: string
  apiType: ApiVerificationApiType
  modelId: string
}): Promise<ApiVerificationProbeResult> {
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

/**
 * Run a single API verification probe.
 *
 * This is used by the UI to execute and retry probes independently.
 */
export async function runApiVerificationProbe(
  params: RunApiVerificationProbeParams,
): Promise<ApiVerificationProbeResult> {
  if (params.probeId === "models") {
    if (params.apiType !== "openai-compatible") {
      return {
        id: "models",
        status: "unsupported",
        latencyMs: 0,
        summary: "Models probe is only supported for OpenAI-compatible APIs",
        summaryKey: "verifyDialog.summaries.modelsProbeUnsupportedForApiType",
        input: {
          apiType: params.apiType,
          baseUrl: params.baseUrl,
          endpoint: "/v1/models",
        },
      }
    }

    return (
      await runModelsProbe({ baseUrl: params.baseUrl, apiKey: params.apiKey })
    ).result
  }

  const resolvedModelId = resolveRequestedModelId(params)
  if (!resolvedModelId?.trim()) {
    return {
      id: params.probeId,
      status: "fail",
      latencyMs: 0,
      summary: "No model id provided to run probe",
      summaryKey: "verifyDialog.summaries.noModelIdProvidedToRunProbe",
      input: {
        apiType: params.apiType,
        baseUrl: params.baseUrl,
      },
    }
  }

  if (params.probeId === "text-generation") {
    return await runTextGenerationProbe({
      baseUrl: params.baseUrl,
      apiKey: params.apiKey,
      apiType: params.apiType,
      modelId: resolvedModelId,
    })
  }

  if (params.probeId === "tool-calling") {
    return await runToolCallingProbe({
      baseUrl: params.baseUrl,
      apiKey: params.apiKey,
      apiType: params.apiType,
      modelId: resolvedModelId,
    })
  }

  if (params.probeId === "structured-output") {
    return await runStructuredOutputProbe({
      baseUrl: params.baseUrl,
      apiKey: params.apiKey,
      apiType: params.apiType,
      modelId: resolvedModelId,
    })
  }

  return await runWebSearchProbe({
    baseUrl: params.baseUrl,
    apiKey: params.apiKey,
    apiType: params.apiType,
    modelId: resolvedModelId,
  })
}

/**
 * Run the API verification suite (models + tool calling) for a given base URL + API key.
 */
export async function runApiVerification(
  params: RunApiVerificationParams,
): Promise<ApiVerificationReport> {
  const startedAt = nowMs()

  const results: ApiVerificationProbeResult[] = []

  const requestedModelId = resolveRequestedModelId(params)

  if (params.apiType === "openai-compatible") {
    const modelsProbe = await runModelsProbe({
      baseUrl: params.baseUrl,
      apiKey: params.apiKey,
    })
    results.push(modelsProbe.result)

    const modelId = requestedModelId ?? modelsProbe.modelId
    if (!modelId) {
      results.push({
        id: "text-generation",
        status: "fail",
        latencyMs: 0,
        summary: "No model available to run probes",
        summaryKey: "verifyDialog.summaries.noModelAvailableToRunProbes",
      })
      results.push({
        id: "tool-calling",
        status: "fail",
        latencyMs: 0,
        summary: "No model available to run probes",
        summaryKey: "verifyDialog.summaries.noModelAvailableToRunProbes",
      })
      results.push({
        id: "structured-output",
        status: "fail",
        latencyMs: 0,
        summary: "No model available to run probes",
        summaryKey: "verifyDialog.summaries.noModelAvailableToRunProbes",
      })
      results.push({
        id: "web-search",
        status: "unsupported",
        latencyMs: 0,
        summary: "Web search probe requires explicit API type support",
        summaryKey: "verifyDialog.summaries.webSearchRequiresExplicitSupport",
      })

      return {
        baseUrl: params.baseUrl,
        apiType: params.apiType,
        startedAt,
        finishedAt: nowMs(),
        results,
      }
    }

    results.push(
      await runTextGenerationProbe({
        baseUrl: params.baseUrl,
        apiKey: params.apiKey,
        apiType: params.apiType,
        modelId,
      }),
    )
    results.push(
      await runToolCallingProbe({
        baseUrl: params.baseUrl,
        apiKey: params.apiKey,
        apiType: params.apiType,
        modelId,
      }),
    )
    results.push(
      await runStructuredOutputProbe({
        baseUrl: params.baseUrl,
        apiKey: params.apiKey,
        apiType: params.apiType,
        modelId,
      }),
    )
    results.push(
      await runWebSearchProbe({
        baseUrl: params.baseUrl,
        apiKey: params.apiKey,
        apiType: params.apiType,
        modelId,
      }),
    )

    return {
      baseUrl: params.baseUrl,
      apiType: params.apiType,
      modelId,
      startedAt,
      finishedAt: nowMs(),
      results,
    }
  }

  const modelId = requestedModelId ?? params.modelId
  if (!modelId) {
    results.push({
      id: "text-generation",
      status: "fail",
      latencyMs: 0,
      summary: "No model id provided to run probes",
      summaryKey: "verifyDialog.summaries.noModelIdProvidedToRunProbes",
    })
    results.push({
      id: "tool-calling",
      status: "fail",
      latencyMs: 0,
      summary: "No model id provided to run probes",
      summaryKey: "verifyDialog.summaries.noModelIdProvidedToRunProbes",
    })
    results.push({
      id: "structured-output",
      status: "fail",
      latencyMs: 0,
      summary: "No model id provided to run probes",
      summaryKey: "verifyDialog.summaries.noModelIdProvidedToRunProbes",
    })
    results.push({
      id: "web-search",
      status: "unsupported",
      latencyMs: 0,
      summary: "Web search probe requires explicit API type support",
      summaryKey: "verifyDialog.summaries.webSearchRequiresExplicitSupport",
    })

    return {
      baseUrl: params.baseUrl,
      apiType: params.apiType,
      startedAt,
      finishedAt: nowMs(),
      results,
    }
  }

  results.push(
    await runTextGenerationProbe({
      baseUrl: params.baseUrl,
      apiKey: params.apiKey,
      apiType: params.apiType,
      modelId,
    }),
  )
  results.push(
    await runToolCallingProbe({
      baseUrl: params.baseUrl,
      apiKey: params.apiKey,
      apiType: params.apiType,
      modelId,
    }),
  )
  results.push(
    await runStructuredOutputProbe({
      baseUrl: params.baseUrl,
      apiKey: params.apiKey,
      apiType: params.apiType,
      modelId,
    }),
  )
  results.push(
    await runWebSearchProbe({
      baseUrl: params.baseUrl,
      apiKey: params.apiKey,
      apiType: params.apiType,
      modelId,
    }),
  )

  return {
    baseUrl: params.baseUrl,
    apiType: params.apiType,
    modelId: requestedModelId ?? modelId,
    startedAt,
    finishedAt: nowMs(),
    results,
  }
}
