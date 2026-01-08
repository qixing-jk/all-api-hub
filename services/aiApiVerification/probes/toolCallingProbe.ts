import { generateText, jsonSchema, stepCountIs, tool } from "ai"

import { nowMs, okLatency } from "../probeTiming"
import { createModel } from "../providers"
import type {
  ApiVerificationApiType,
  ApiVerificationProbeResult,
} from "../types"
import { toSanitizedErrorSummary } from "../utils"

type RunToolCallingProbeParams = {
  baseUrl: string
  apiKey: string
  apiType: ApiVerificationApiType
  modelId: string
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
 * Tool/function calling probe.
 */
export async function runToolCallingProbe(
  params: RunToolCallingProbeParams,
): Promise<ApiVerificationProbeResult> {
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
