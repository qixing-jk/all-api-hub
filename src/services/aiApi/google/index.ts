import { executeWithUnauthorizedFallback } from "~/services/aiApi/authFallback"
import { fetchApi } from "~/services/apiTransport/request"
import { AuthTypeEnum } from "~/types"
import { createLogger } from "~/utils/core/logger"

import {
  createGoogleAuthHeaders,
  getGoogleAuthMode,
  GOOGLE_AUTH_MODES,
  isGoogleUnauthorized,
  rememberGoogleBearerAuth,
  type GoogleAuthMode,
} from "./auth"

type GoogleAuthParams = {
  baseUrl: string
  apiKey: string
  abortSignal?: AbortSignal
}

type GoogleModelsListResponse = {
  models?: Array<{
    name?: unknown
  }>
  nextPageToken?: unknown
}

const logger = createLogger("AiApi.Google")

const MAX_PAGES = 20
const MAX_MODELS = 2000

/**
 * Fetches Google model IDs.
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
  let authMode = getGoogleAuthMode(params.baseUrl)

  for (let page = 0; page < MAX_PAGES; page += 1) {
    const searchParams = new URLSearchParams()
    if (nextPageToken) searchParams.set("pageToken", nextPageToken)

    const endpoint = searchParams.size
      ? `/v1beta/models?${searchParams.toString()}`
      : "/v1beta/models"

    try {
      const fetchPage = (mode: GoogleAuthMode) =>
        fetchApi<GoogleModelsListResponse>(
          request,
          {
            endpoint,
            options: {
              signal: params.abortSignal,
              headers: createGoogleAuthHeaders(params.apiKey, mode),
            },
          },
          true,
        )

      const authResult = await executeWithUnauthorizedFallback({
        initialMode: authMode,
        fallbackMode: GOOGLE_AUTH_MODES.Bearer,
        run: fetchPage,
        isUnauthorized: isGoogleUnauthorized,
        rememberFallback: () => rememberGoogleBearerAuth(params.baseUrl),
      })
      const response = authResult.result
      authMode = authResult.mode

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
