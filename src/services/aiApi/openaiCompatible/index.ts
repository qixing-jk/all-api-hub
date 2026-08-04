import { fetchApiData } from "~/services/apiTransport/request"
import type {
  OpenAIAuthParams,
  UpstreamModelItem,
  UpstreamModelList,
} from "~/services/apiTransport/type"
import { AuthTypeEnum } from "~/types"
import { createLogger } from "~/utils/core/logger"

/**
 * Unified logger scoped to OpenAI-compatible upstream model fetch helpers.
 */
const logger = createLogger("AiApi.OpenAICompatible")

// Some OpenAI-compatible Base URLs already include their complete API prefix,
// so model discovery must also try `/models` without changing that Base URL.
// Volcengine Ark Coding Plan: https://docs.volcengine.com/docs/82379/2160841
const OPENAI_COMPATIBLE_MODELS_ENDPOINTS = ["/v1/models", "/models"] as const

export const fetchOpenAICompatibleModels = async (params: OpenAIAuthParams) => {
  const request = {
    baseUrl: params.baseUrl,
    auth: {
      authType: AuthTypeEnum.AccessToken,
      accessToken: params.apiKey,
    },
  }
  let lastError: unknown
  for (const endpoint of OPENAI_COMPATIBLE_MODELS_ENDPOINTS) {
    try {
      return await fetchApiData<UpstreamModelList>(request, {
        endpoint,
        ...(params.abortSignal
          ? { options: { signal: params.abortSignal } }
          : {}),
      })
    } catch (error) {
      if (
        params.abortSignal?.aborted ||
        (error instanceof Error && error.name === "AbortError")
      ) {
        throw error
      }
      lastError = error
    }
  }

  logger.error("Failed to fetch upstream model list", lastError)
  throw lastError
}

export const fetchOpenAICompatibleModelIds = async (
  params: OpenAIAuthParams,
) => {
  const upstreamModels = await fetchOpenAICompatibleModels(params)
  return upstreamModels.map((item: UpstreamModelItem) => item.id)
}
