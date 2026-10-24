import { createAnthropic } from "@ai-sdk/anthropic"
import { createGoogle } from "@ai-sdk/google"
import { createOpenAI } from "@ai-sdk/openai"
import { createOpenAICompatible } from "@ai-sdk/openai-compatible"

import { createAnthropicSdkAuth } from "~/services/aiApi/anthropic/auth"
import { createGoogleSdkAuth } from "~/services/aiApi/google/auth"
import { toVersionedProtocolMount } from "~/services/aiApi/protocolAddress"
import { createHeaderOverrideFetch } from "~/services/apiTransport/headerOverrides"

import { createVerificationProfileFetch } from "./requestProfiles"
import type {
  ApiVerificationApiType,
  ApiVerificationRequestProfile,
} from "./types"
import { API_TYPES } from "./types"

export const COMPATIBLE_PROVIDER_OPTIONS_KEY = "allApiHub"

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
  requestProfile?: ApiVerificationRequestProfile
  requestProfileEnhanced?: boolean
  apiType: ApiVerificationApiType
  modelId: string
}

/** Share compatible transport configuration across supported modalities. */
function createCompatibleProvider(params: CreateModelParams) {
  const baseURL = requireProtocolApiBaseUrl(params.apiType, params.baseUrl)
  const apiOrigin = new URL(baseURL).origin
  const apiFetch = createHeaderOverrideFetch(params.requestHeaders)
  const publicFetch = createHeaderOverrideFetch()
  return createOpenAICompatible({
    name: "all-api-hub",
    baseURL,
    apiKey: params.apiKey,
    // SDK image downloads may target a CDN. The SDK scopes its own credentials;
    // custom overrides must respect the same boundary instead of restoring them.
    fetch: (input, init) => {
      const url = input instanceof Request ? input.url : String(input)
      return (new URL(url).origin === apiOrigin ? apiFetch : publicFetch)(
        input,
        init,
      )
    },
  })
}

/** Accept URL and base64 images uniformly without maintaining model ID lists. */
export function createImageModel(params: CreateModelParams) {
  if (
    params.apiType === API_TYPES.OPENAI ||
    params.apiType === API_TYPES.OPENAI_COMPATIBLE
  ) {
    return createCompatibleProvider(params).imageModel(params.modelId)
  }
  throw new Error(`Image model is not supported for ${params.apiType}`)
}

/**
 * Create an AI SDK model instance for the selected API type and model id.
 */
export function createModel(params: CreateModelParams) {
  if (params.apiType === API_TYPES.OPENAI_COMPATIBLE) {
    return createCompatibleProvider(params)(params.modelId)
  }

  if (params.apiType === API_TYPES.OPENAI) {
    return createOpenAIProvider(params)(params.modelId)
  }

  if (params.apiType === API_TYPES.ANTHROPIC) {
    const auth = createAnthropicSdkAuth(
      params.baseUrl,
      params.apiKey,
      params.requestHeaders,
    )
    return createAnthropic({
      baseURL: requireProtocolApiBaseUrl(params.apiType, params.baseUrl),
      ...auth,
      fetch: createVerificationProfileFetch(auth.fetch, params),
    })(params.modelId)
  }

  return createGoogleProvider(params)(params.modelId)
}

/**
 * Create an AI SDK text embedding model instance for the selected API type and model id.
 */
export function createEmbeddingModel(params: CreateModelParams) {
  if (params.apiType === API_TYPES.OPENAI_COMPATIBLE) {
    return createCompatibleProvider(params).textEmbeddingModel(params.modelId)
  }

  if (params.apiType === API_TYPES.OPENAI) {
    return createOpenAIProvider(params).textEmbeddingModel(params.modelId)
  }

  if (params.apiType === API_TYPES.GOOGLE) {
    return createGoogleProvider(params).textEmbeddingModel(params.modelId)
  }

  throw new Error(`Embedding model is not supported for ${params.apiType}`)
}

/**
 * Create an OpenAI provider instance with proxy/baseUrl override.
 */
export function createOpenAIProvider(params: {
  baseUrl: string
  apiKey: string
  requestHeaders?: Record<string, string>
  requestProfile?: ApiVerificationRequestProfile
  requestProfileEnhanced?: boolean
}) {
  return createOpenAI({
    baseURL: requireProtocolApiBaseUrl(API_TYPES.OPENAI, params.baseUrl),
    apiKey: params.apiKey,
    fetch: createVerificationProfileFetch(
      createHeaderOverrideFetch(params.requestHeaders),
      params,
    ),
  })
}

/**
 * Create a Google/Gemini provider instance with proxy/baseUrl override.
 */
export function createGoogleProvider(params: {
  requestProfile?: ApiVerificationRequestProfile
  requestProfileEnhanced?: boolean
  baseUrl: string
  apiKey: string
  requestHeaders?: Record<string, string>
}) {
  const auth = createGoogleSdkAuth(
    params.baseUrl,
    params.apiKey,
    params.requestHeaders,
  )
  return createGoogle({
    baseURL: requireProtocolApiBaseUrl(API_TYPES.GOOGLE, params.baseUrl),
    ...auth,
    fetch: createVerificationProfileFetch(auth.fetch, params),
  })
}
