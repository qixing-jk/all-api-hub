import type {
  OpenAIAuthParams,
  UpstreamModelItem,
  UpstreamModelList,
} from "~/services/apiService/common/type"
import { fetchApiData } from "~/services/apiService/common/utils"
import { AuthTypeEnum } from "~/types"
import { createLogger } from "~/utils/core/logger"

/**
 * Unified logger scoped to OpenAI-compatible upstream model fetch helpers.
 */
const logger = createLogger("ApiService.OpenAICompatible")

const OPENAI_COMPATIBLE_MODELS_ENDPOINT = "/v1/models"

export const fetchOpenAICompatibleModels = async (params: OpenAIAuthParams) => {
  const request = {
    baseUrl: params.baseUrl,
    auth: {
      authType: AuthTypeEnum.AccessToken,
      accessToken: params.apiKey,
    },
  }
  try {
    return await fetchApiData<UpstreamModelList>(request, {
      endpoint: OPENAI_COMPATIBLE_MODELS_ENDPOINT,
    })
  } catch (error) {
    logger.error("Failed to fetch upstream model list", error)
    throw error
  }
}

export const fetchOpenAICompatibleModelIds = async (
  params: OpenAIAuthParams,
) => {
  const upstreamModels = await fetchOpenAICompatibleModels(params)
  return upstreamModels.map((item: UpstreamModelItem) => item.id)
}
