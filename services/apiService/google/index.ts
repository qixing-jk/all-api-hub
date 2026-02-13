import { fetchApi } from "~/services/apiService/common/utils"
import { AuthTypeEnum } from "~/types"
import { createLogger } from "~/utils/logger"

type GoogleAuthParams = {
  baseUrl: string
  apiKey: string
}

type GoogleModelsListResponse = {
  models?: Array<{
    name?: unknown
  }>
  nextPageToken?: unknown
}

const logger = createLogger("ApiService.Google")

const MAX_PAGES = 20
const MAX_MODELS = 2000

/**
 *
 */
export async function fetchGoogleModelIds(
  params: GoogleAuthParams,
): Promise<string[]> {
  const request = {
    baseUrl: params.baseUrl,
    auth: { authType: AuthTypeEnum.None },
  }

  const modelIds: string[] = []
  let nextPageToken = ""

  for (let page = 0; page < MAX_PAGES; page += 1) {
    const searchParams = new URLSearchParams()
    if (nextPageToken) searchParams.set("pageToken", nextPageToken)

    const endpoint = searchParams.size
      ? `/v1beta/models?${searchParams.toString()}`
      : "/v1beta/models"

    try {
      const response = await fetchApi<GoogleModelsListResponse>(
        request,
        {
          endpoint,
          options: {
            headers: {
              "x-goog-api-key": params.apiKey,
            },
          },
        },
        true,
      )

      const models = Array.isArray(response?.models) ? response.models : []
      for (const model of models) {
        const rawName = typeof model?.name === "string" ? model.name : ""
        const name = rawName.startsWith("models/")
          ? rawName.slice("models/".length)
          : rawName

        if (!name || modelIds.includes(name)) continue
        modelIds.push(name)
        if (modelIds.length >= MAX_MODELS) return modelIds
      }

      const token =
        typeof response?.nextPageToken === "string"
          ? response.nextPageToken
          : ""
      if (!token || token === nextPageToken) break
      nextPageToken = token
    } catch (error) {
      logger.error("Failed to fetch google model list", { endpoint, error })
      throw error
    }
  }

  return modelIds
}
