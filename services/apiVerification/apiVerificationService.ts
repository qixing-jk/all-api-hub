import { createOpenAICompatible } from "@ai-sdk/openai-compatible"
import { generateText, jsonSchema, tool } from "ai"

import { fetchOpenAICompatibleModelIds } from "~/services/apiService/openaiCompatible"
import type { ApiToken } from "~/types"

import type { ApiVerificationProbeResult, ApiVerificationReport } from "./types"
import {
  coerceBaseUrlToV1,
  guessModelIdFromToken,
  toSanitizedErrorSummary,
} from "./utils"

type RunApiVerificationParams = {
  baseUrl: string
  apiKey: string
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
 * Probe tool calling support via an OpenAI-compatible chat generation request.
 */
async function runToolCallingProbe(params: {
  baseUrl: string
  apiKey: string
  modelId: string
}): Promise<ApiVerificationProbeResult> {
  const startedAt = nowMs()
  const secretsToRedact = [params.apiKey]

  try {
    const provider = createOpenAICompatible({
      name: "all-api-hub",
      baseURL: coerceBaseUrlToV1(params.baseUrl),
      apiKey: params.apiKey,
    })

    const getCurrentTime = tool({
      description: "Get the current time in ISO 8601 format.",
      inputSchema: jsonSchema<Record<string, never>>({
        type: "object",
        properties: {},
      }),
      execute: async () => ({ now: new Date().toISOString() }),
    })

    const result = await generateText({
      model: provider(params.modelId),
      prompt:
        "Call the get_current_time tool once. Reply with a short sentence that includes the returned time.",
      tools: { get_current_time: getCurrentTime },
    })

    const calledTool =
      (result.toolCalls ?? []).some(
        (call) => call.toolName === "get_current_time",
      ) ||
      (result.toolResults ?? []).some(
        (call) => call.toolName === "get_current_time",
      )

    if (!calledTool) {
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
 * Run the API verification suite (models + tool calling) for a given base URL + API key.
 */
export async function runApiVerification(
  params: RunApiVerificationParams,
): Promise<ApiVerificationReport> {
  const startedAt = nowMs()

  const results: ApiVerificationProbeResult[] = []

  const modelsProbe = await runModelsProbe({
    baseUrl: params.baseUrl,
    apiKey: params.apiKey,
  })
  results.push(modelsProbe.result)

  const tokenHint = params.tokenMeta
    ? guessModelIdFromToken(params.tokenMeta)
    : undefined
  const modelId = params.modelId ?? tokenHint ?? modelsProbe.modelId

  if (modelId) {
    results.push(
      await runToolCallingProbe({
        baseUrl: params.baseUrl,
        apiKey: params.apiKey,
        modelId,
      }),
    )
  } else {
    results.push({
      id: "tool-calling",
      status: "fail",
      latencyMs: 0,
      summary: "No model available to run tool calling probe",
    })
  }

  return {
    baseUrl: params.baseUrl,
    modelId,
    startedAt,
    finishedAt: nowMs(),
    results,
  }
}
