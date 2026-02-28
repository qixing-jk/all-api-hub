import { createAnthropic } from "@ai-sdk/anthropic"
import { createGoogleGenerativeAI } from "@ai-sdk/google"
import { createOpenAI } from "@ai-sdk/openai"
import { createOpenAICompatible } from "@ai-sdk/openai-compatible"

import type { ApiVerificationApiType } from "./types"
import { API_TYPES } from "./types"
import {
  coerceBaseUrlToAnthropicV1,
  coerceBaseUrlToGoogleV1beta,
  coerceBaseUrlToV1,
} from "./utils"

/**
 * Input for creating a provider-backed model instance.
 */
export type CreateModelParams = {
  baseUrl: string
  apiKey: string
  apiType: ApiVerificationApiType
  modelId: string
}

/**
 * Create an AI SDK model instance for the selected API type and model id.
 */
export function createModel(params: CreateModelParams) {
  // Compare against shared API type constants to avoid magic strings.
  if (params.apiType === API_TYPES.OPENAI_COMPATIBLE) {
    return createOpenAICompatible({
      name: "all-api-hub",
      baseURL: coerceBaseUrlToV1(params.baseUrl),
      apiKey: params.apiKey,
    })(params.modelId)
  }

  if (params.apiType === API_TYPES.OPENAI) {
    return createOpenAI({
      baseURL: coerceBaseUrlToV1(params.baseUrl),
      apiKey: params.apiKey,
    })(params.modelId)
  }

  if (params.apiType === API_TYPES.ANTHROPIC) {
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
export function createOpenAIProvider(params: {
  baseUrl: string
  apiKey: string
}) {
  return createOpenAI({
    baseURL: coerceBaseUrlToV1(params.baseUrl),
    apiKey: params.apiKey,
  })
}

/**
 * Create a Google/Gemini provider instance with proxy/baseUrl override.
 */
export function createGoogleProvider(params: {
  baseUrl: string
  apiKey: string
}) {
  return createGoogleGenerativeAI({
    baseURL: coerceBaseUrlToGoogleV1beta(params.baseUrl),
    apiKey: params.apiKey,
  })
}
