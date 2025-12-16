import type {
  OpenAIAuthParams,
  UpstreamModelItem,
  UpstreamModelList,
} from "~/services/apiService/common/type"
import { fetchApiData } from "~/services/apiService/common/utils"

export const fetchUpstreamModels = async ({
  baseUrl,
  apiKey,
}: OpenAIAuthParams) => {
  try {
    return await fetchApiData<UpstreamModelList>({
      baseUrl,
      endpoint: "/v1/models",
      token: apiKey,
    })
  } catch (error) {
    console.error("获取上游模型列表失败:", error)
    throw error
  }
}

export const fetchUpstreamModelsNameList = async ({
  baseUrl,
  apiKey,
}: OpenAIAuthParams) => {
  const upstreamModels = await fetchUpstreamModels({
    baseUrl: baseUrl,
    apiKey: apiKey,
  })
  return upstreamModels.map((item: UpstreamModelItem) => item.id)
}
