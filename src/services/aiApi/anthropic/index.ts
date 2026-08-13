import { executeWithUnauthorizedFallback } from "~/services/aiApi/authFallback"
import { fetchApi } from "~/services/apiTransport/request"
import { AuthTypeEnum } from "~/types"
import { createLogger } from "~/utils/core/logger"

import {
  ANTHROPIC_AUTH_MODES,
  createAnthropicAuthHeaders,
  getAnthropicAuthMode,
  isAnthropicUnauthorized,
  rememberAnthropicBearerAuth,
  type AnthropicAuthMode,
} from "./auth"

type AnthropicAuthParams = {
  baseUrl: string
  apiKey: string
  abortSignal?: AbortSignal
}

type AnthropicModelItem = {
  id?: unknown
}

type AnthropicModelsListResponse = {
  data?: AnthropicModelItem[]
  has_more?: unknown
  last_id?: unknown
}

const logger = createLogger("AiApi.Anthropic")

const PAGE_LIMIT = 200
const MAX_PAGES = 20
const MAX_MODELS = 2000

/**
 * Fetches Anthropic model IDs.
 */
export async function fetchAnthropicModelIds(
  params: AnthropicAuthParams,
): Promise<string[]> {
  const request = {
    baseUrl: params.baseUrl,
    auth: { authType: AuthTypeEnum.None },
  }

  const modelIds: string[] = []
  const seenModelIds = new Set<string>()
  let afterId = ""
  let authMode = getAnthropicAuthMode(params.baseUrl)

  for (let page = 0; page < MAX_PAGES; page += 1) {
    const searchParams = new URLSearchParams()
    searchParams.set("limit", String(PAGE_LIMIT))
    if (afterId) searchParams.set("after_id", afterId)

    const endpoint = `/v1/models?${searchParams.toString()}`

    const fetchPage = (mode: AnthropicAuthMode) =>
      fetchApi<AnthropicModelsListResponse>(
        request,
        {
          endpoint,
          options: {
            signal: params.abortSignal,
            headers: createAnthropicAuthHeaders(params.apiKey, mode),
          },
        },
        true,
      )

    try {
      const authResult = await executeWithUnauthorizedFallback({
        initialMode: authMode,
        fallbackMode: ANTHROPIC_AUTH_MODES.Bearer,
        run: fetchPage,
        isUnauthorized: isAnthropicUnauthorized,
        rememberFallback: () => rememberAnthropicBearerAuth(params.baseUrl),
      })
      const response: AnthropicModelsListResponse = authResult.result
      authMode = authResult.mode

      const data = Array.isArray(response?.data) ? response.data : []
      for (const model of data) {
        const id = typeof model?.id === "string" ? model.id : ""
        if (!id || seenModelIds.has(id)) continue
        seenModelIds.add(id)
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
