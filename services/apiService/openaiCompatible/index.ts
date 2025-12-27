import type {
  OpenAIAuthParams,
  UpstreamModelItem,
  UpstreamModelList,
} from "~/services/apiService/common/type"
import { fetchApiData } from "~/services/apiService/common/utils"
import { AuthTypeEnum } from "~/types"

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
      endpoint: "/v1/models",
    })
  } catch (error) {
    console.error("获取上游模型列表失败:", error)
    throw error
  }
}

export const fetchOpenAICompatibleModelIds = async (
  params: OpenAIAuthParams,
) => {
  const upstreamModels = await fetchOpenAICompatibleModels(params)
  return upstreamModels.map((item: UpstreamModelItem) => item.id)
}
