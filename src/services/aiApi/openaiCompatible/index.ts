import { ApiError } from "~/services/apiTransport/errors"
import { fetchApiData } from "~/services/apiTransport/request"
import type {
  OpenAIAuthParams,
  UpstreamModelItem,
  UpstreamModelList,
} from "~/services/apiTransport/type"
import { AuthTypeEnum } from "~/types"
import { createLogger } from "~/utils/core/logger"
import { coerceBaseUrlToPathSuffix, normalizeHttpUrl } from "~/utils/core/url"

import { decodeOpenAICompatibleResponseError } from "./responseError"

/**
 * Unified logger scoped to OpenAI-compatible upstream model fetch helpers.
 */
const logger = createLogger("AiApi.OpenAICompatible")

// Some OpenAI-compatible Base URLs already include their complete API prefix,
// so model discovery must also try `/models` without changing that Base URL.
// Volcengine Ark Coding Plan: https://docs.volcengine.com/docs/82379/2160841
const OPENAI_COMPATIBLE_MODELS_ENDPOINTS = ["/v1/models", "/models"] as const

interface OpenAICompatibleModelDiscovery {
  models: UpstreamModelList
  resolvedBaseUrl: string
}

const isModelList = (value: unknown): value is UpstreamModelList =>
  Array.isArray(value) &&
  value.every(
    (item) =>
      typeof item === "object" &&
      item !== null &&
      typeof (item as { id?: unknown }).id === "string",
  )

const isMissingModelRoute = (error: unknown) =>
  error instanceof ApiError &&
  (error.statusCode === 404 || error.statusCode === 405)

const resolveBaseUrlForModelEndpoint = (
  baseUrl: string,
  endpoint: (typeof OPENAI_COMPATIBLE_MODELS_ENDPOINTS)[number],
) => {
  const normalizedBaseUrl =
    normalizeHttpUrl(baseUrl) ?? baseUrl.trim().replace(/\/+$/, "")
  return endpoint === "/v1/models"
    ? coerceBaseUrlToPathSuffix(normalizedBaseUrl, "/v1")
    : normalizedBaseUrl
}

/**
 * Discovers models and retains the API base URL confirmed by that same request.
 * Only route-level 404/405 responses justify trying the path-preserving fallback;
 * authentication, throttling, server, and network failures are inconclusive.
 */
export const discoverOpenAICompatibleModels = async (
  params: OpenAIAuthParams,
): Promise<OpenAICompatibleModelDiscovery> => {
  const request = {
    baseUrl: params.baseUrl,
    auth: {
      authType: AuthTypeEnum.AccessToken,
      accessToken: params.apiKey,
    },
  }
  let lastError: unknown
  for (const [
    index,
    endpoint,
  ] of OPENAI_COMPATIBLE_MODELS_ENDPOINTS.entries()) {
    try {
      const models = await fetchApiData<unknown>(request, {
        endpoint,
        errorResponseDecoder: decodeOpenAICompatibleResponseError,
        ...(params.abortSignal
          ? { options: { signal: params.abortSignal } }
          : {}),
      })
      if (!isModelList(models)) {
        throw new TypeError("Upstream returned an invalid model list")
      }

      return {
        models,
        resolvedBaseUrl: resolveBaseUrlForModelEndpoint(
          params.baseUrl,
          endpoint,
        ),
      }
    } catch (error) {
      if (
        params.abortSignal?.aborted ||
        (error instanceof Error && error.name === "AbortError")
      ) {
        throw error
      }
      lastError = error
      const hasFallback = index < OPENAI_COMPATIBLE_MODELS_ENDPOINTS.length - 1
      if (hasFallback && isMissingModelRoute(error)) {
        continue
      }

      logger.error("Failed to fetch upstream model list", error)
      throw error
    }
  }

  logger.error("Failed to fetch upstream model list", lastError)
  throw lastError
}

export const fetchOpenAICompatibleModels = async (params: OpenAIAuthParams) =>
  (await discoverOpenAICompatibleModels(params)).models

export const fetchOpenAICompatibleModelIds = async (
  params: OpenAIAuthParams,
) => {
  const upstreamModels = await fetchOpenAICompatibleModels(params)
  return upstreamModels.map((item: UpstreamModelItem) => item.id)
}
