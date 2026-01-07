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

    const result = await generateText({
      model,
      prompt:
        "Call the verify_tool tool once. Reply with a short sentence that includes the returned time.",
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
      }
    }

    return {
      id: "tool-calling",
      status: "pass",
      latencyMs: okLatency(startedAt),
      summary: "Tool call succeeded",
    }
  } catch (error) {
    return {
      id: "tool-calling",
      status: "fail",
      latencyMs: okLatency(startedAt),
      summary: toSanitizedErrorSummary(error, secretsToRedact),
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

    const { output } = await generateText({
      model,
      prompt: "Return a JSON object with shape { ok: true }.",
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
    }
  } catch (error) {
    const summary = toSanitizedErrorSummary(error, secretsToRedact)
    return {
      id: "structured-output",
      status: "fail",
      latencyMs: okLatency(startedAt),
      summary,
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
    }
  }

  try {
    if (params.apiType === "openai") {
      const provider = createOpenAIProvider({
        baseUrl: params.baseUrl,
        apiKey: params.apiKey,
      })

      const result = await generateText({
        model: provider(params.modelId),
        prompt: "Use web search to find one recent headline about AI SDK.",
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
      }
    }

    if (params.apiType === "google") {
      const google = createGoogleProvider({
        baseUrl: params.baseUrl,
        apiKey: params.apiKey,
      })

      const result = await generateText({
        model: google(params.modelId),
        prompt: "Use Google search grounding to find one recent AI headline.",
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
      }
    }

    return {
      id: "web-search",
      status: "unsupported",
      latencyMs: okLatency(startedAt),
      summary: "Web search probe is not supported for this API type",
    }
  } catch (error) {
    return {
      id: "web-search",
      status: "fail",
      latencyMs: okLatency(startedAt),
      summary: toSanitizedErrorSummary(error, secretsToRedact),
    }
  }
}

/**
 * Run the API verification suite (models + tool calling) for a given base URL + API key.
 */
export async function runApiVerification(
  params: RunApiVerificationParams,
): Promise<ApiVerificationReport> {
  const startedAt = nowMs()

  const results: ApiVerificationProbeResult[] = []

  const tokenHint = params.tokenMeta
    ? guessModelIdFromToken(params.tokenMeta)
    : undefined
  const requestedModelId = params.modelId ?? tokenHint

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
      })
      results.push({
        id: "tool-calling",
        status: "fail",
        latencyMs: 0,
        summary: "No model available to run probes",
      })
      results.push({
        id: "structured-output",
        status: "fail",
        latencyMs: 0,
        summary: "No model available to run probes",
      })
      results.push({
        id: "web-search",
        status: "unsupported",
        latencyMs: 0,
        summary: "Web search probe requires explicit API type support",
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
    })
    results.push({
      id: "tool-calling",
      status: "fail",
      latencyMs: 0,
      summary: "No model id provided to run probes",
    })
    results.push({
      id: "structured-output",
      status: "fail",
      latencyMs: 0,
      summary: "No model id provided to run probes",
    })
    results.push({
      id: "web-search",
      status: "unsupported",
      latencyMs: 0,
      summary: "Web search probe requires explicit API type support",
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
