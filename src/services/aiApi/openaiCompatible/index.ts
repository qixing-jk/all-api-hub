import { ApiError } from "~/services/apiTransport/errors"
import { fetchApiData } from "~/services/apiTransport/request"
import type {
  OpenAIAuthParams,
  UpstreamModelItem,
  UpstreamModelList,
} from "~/services/apiTransport/type"
import { AuthTypeEnum } from "~/types"
import { createLogger } from "~/utils/core/logger"

import { toProtocolRoot, toVersionedProtocolMount } from "../protocolAddress"
import { decodeOpenAICompatibleResponseError } from "./responseError"

/**
 * Unified logger scoped to OpenAI-compatible upstream model fetch helpers.
 */
const logger = createLogger("AiApi.OpenAICompatible")

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

const resolveCandidateModelBaseUrls = (mount: string): string[] => {
  const root = toProtocolRoot("openai-compatible", mount)
  return root && root !== mount ? [mount, root] : [mount]
}

/**
 * Discovers models from an OpenAI-compatible protocol mount. The versioned
 * mount is tried first because that is where compatible providers serve
 * `/models`; the protocol root stays as a compatibility fallback for providers
 * that publish the list without a version segment or under a legacy path.
 */
export const discoverOpenAICompatibleModels = async (
  params: OpenAIAuthParams,
): Promise<OpenAICompatibleModelDiscovery> => {
  const baseUrl = toVersionedProtocolMount("openai-compatible", params.baseUrl)
  if (!baseUrl) throw new Error("Invalid OpenAI-compatible API base URL")
  const candidateBaseUrls = resolveCandidateModelBaseUrls(baseUrl)
  const request = {
    ...(params.requestScheduling
      ? { requestScheduling: params.requestScheduling }
      : {}),
    baseUrl,
    auth: {
      authType: AuthTypeEnum.AccessToken,
      accessToken: params.apiKey,
    },
  }
  let lastError: unknown
  for (const [index, candidateBaseUrl] of candidateBaseUrls.entries()) {
    try {
      const models = await fetchApiData<unknown>(
        { ...request, baseUrl: candidateBaseUrl },
        {
          endpoint: "models",
          errorResponseDecoder: decodeOpenAICompatibleResponseError,
          ...(params.abortSignal
            ? { options: { signal: params.abortSignal } }
            : {}),
        },
      )
      if (!isModelList(models)) {
        throw new TypeError("Upstream returned an invalid model list")
      }

      return {
        models,
        resolvedBaseUrl: candidateBaseUrl,
      }
    } catch (error) {
      if (
        params.abortSignal?.aborted ||
        (error instanceof Error && error.name === "AbortError")
      ) {
        throw error
      }
      lastError = error
      const hasFallback = index < candidateBaseUrls.length - 1
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
