import { createAnthropic } from "@ai-sdk/anthropic"
import { createGoogleGenerativeAI } from "@ai-sdk/google"
import { createOpenAI } from "@ai-sdk/openai"
import { createOpenAICompatible } from "@ai-sdk/openai-compatible"

import { createAnthropicSdkAuth } from "~/services/aiApi/anthropic/auth"
import { createGoogleSdkAuth } from "~/services/aiApi/google/auth"
import { toVersionedProtocolMount } from "~/services/aiApi/protocolAddress"
import { createHeaderOverrideFetch } from "~/services/apiTransport/headerOverrides"

import type { ApiVerificationApiType } from "./types"
import { API_TYPES } from "./types"

/**
 * Every AI SDK provider appends only its operation path (`/messages`,
 * `/chat/completions`), so it needs the versioned protocol mount rather than
 * the root a version-owning client such as Claude Code is configured with.
 */
const requireProtocolApiBaseUrl = (
  apiType: ApiVerificationApiType,
  baseUrl: string,
): string => {
  const mount = toVersionedProtocolMount(apiType, baseUrl)
  if (!mount) throw new Error("Invalid protocol API base URL")
  return mount
}

/**
 * Input for creating a provider-backed model instance.
 */
type CreateModelParams = {
  baseUrl: string
  apiKey: string
  requestHeaders?: Record<string, string>
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
      baseURL: requireProtocolApiBaseUrl(params.apiType, params.baseUrl),
      apiKey: params.apiKey,
      fetch: createHeaderOverrideFetch(params.requestHeaders),
    })(params.modelId)
  }

  if (params.apiType === API_TYPES.OPENAI) {
    return createOpenAI({
      baseURL: requireProtocolApiBaseUrl(params.apiType, params.baseUrl),
      apiKey: params.apiKey,
      fetch: createHeaderOverrideFetch(params.requestHeaders),
    })(params.modelId)
  }

  if (params.apiType === API_TYPES.ANTHROPIC) {
    return createAnthropic({
      baseURL: requireProtocolApiBaseUrl(params.apiType, params.baseUrl),
      ...createAnthropicSdkAuth(
        params.baseUrl,
        params.apiKey,
        params.requestHeaders,
      ),
    })(params.modelId)
  }

  return createGoogleGenerativeAI({
    baseURL: requireProtocolApiBaseUrl(params.apiType, params.baseUrl),
    ...createGoogleSdkAuth(
      params.baseUrl,
      params.apiKey,
      params.requestHeaders,
    ),
  })(params.modelId)
}

/**
 * Create an OpenAI provider instance with proxy/baseUrl override.
 */
export function createOpenAIProvider(params: {
  baseUrl: string
  apiKey: string
  requestHeaders?: Record<string, string>
}) {
  return createOpenAI({
    baseURL: requireProtocolApiBaseUrl(API_TYPES.OPENAI, params.baseUrl),
    apiKey: params.apiKey,
    fetch: createHeaderOverrideFetch(params.requestHeaders),
  })
}

/**
 * Create a Google/Gemini provider instance with proxy/baseUrl override.
 */
export function createGoogleProvider(params: {
  baseUrl: string
  apiKey: string
  requestHeaders?: Record<string, string>
}) {
  return createGoogleGenerativeAI({
    baseURL: requireProtocolApiBaseUrl(API_TYPES.GOOGLE, params.baseUrl),
    ...createGoogleSdkAuth(
      params.baseUrl,
      params.apiKey,
      params.requestHeaders,
    ),
  })
}
