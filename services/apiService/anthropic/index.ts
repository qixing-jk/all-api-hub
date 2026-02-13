import { fetchApi } from "~/services/apiService/common/utils"
import { AuthTypeEnum } from "~/types"
import { createLogger } from "~/utils/logger"

type AnthropicAuthParams = {
  baseUrl: string
  apiKey: string
}

type AnthropicModelItem = {
  id?: unknown
}

type AnthropicModelsListResponse = {
  data?: AnthropicModelItem[]
  has_more?: unknown
  last_id?: unknown
}

const logger = createLogger("ApiService.Anthropic")

const ANTHROPIC_VERSION = "2023-06-01"
const PAGE_LIMIT = 200
const MAX_PAGES = 20
const MAX_MODELS = 2000

/**
 *
 */
export async function fetchAnthropicModelIds(
  params: AnthropicAuthParams,
): Promise<string[]> {
  const request = {
    baseUrl: params.baseUrl,
    auth: { authType: AuthTypeEnum.None },
  }

  const modelIds: string[] = []
  let afterId = ""

  for (let page = 0; page < MAX_PAGES; page += 1) {
    const searchParams = new URLSearchParams()
    searchParams.set("limit", String(PAGE_LIMIT))
    if (afterId) searchParams.set("after_id", afterId)

    const endpoint = `/v1/models?${searchParams.toString()}`

    try {
      const response = await fetchApi<AnthropicModelsListResponse>(
        request,
        {
          endpoint,
          options: {
            headers: {
              "x-api-key": params.apiKey,
              "anthropic-version": ANTHROPIC_VERSION,
            },
          },
        },
        true,
      )

      const data = Array.isArray(response?.data) ? response.data : []
      for (const model of data) {
        const id = typeof model?.id === "string" ? model.id : ""
        if (!id || modelIds.includes(id)) continue
        modelIds.push(id)
        if (modelIds.length >= MAX_MODELS) return modelIds
      }

      const hasMore = response?.has_more === true
      const lastId =
        typeof response?.last_id === "string" ? response.last_id : ""

      if (!hasMore || !lastId || lastId === afterId) break
      afterId = lastId
    } catch (error) {
      logger.error("Failed to fetch anthropic model list", { endpoint, error })
      throw error
    }
  }

  return modelIds
}
