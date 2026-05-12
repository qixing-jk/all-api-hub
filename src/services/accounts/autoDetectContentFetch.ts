import { RuntimeActionIds } from "~/constants/runtimeActions"
import { buildCompatUserIdHeaders } from "~/services/apiService/common/compatHeaders"
import { REQUEST_CONFIG } from "~/services/apiService/common/constant"
import { ApiError } from "~/services/apiService/common/errors"
import type {
  SiteStatusInfo,
  UserInfo,
} from "~/services/apiService/common/type"
import { sendTabMessageWithRetry } from "~/utils/browser/browserApi"
import {
  EXTENSION_HEADER_NAME,
  EXTENSION_HEADER_VALUE,
} from "~/utils/browser/cookieHelper"
import { getErrorMessage } from "~/utils/core/error"
import { createLogger } from "~/utils/core/logger"
import { joinUrl } from "~/utils/core/url"

const logger = createLogger("AutoDetectContentFetch")

interface AutoDetectContentFetchContext {
  tabId: number
  baseUrl: string
  userId?: number | string
}

interface ContentFetchResponse<T> {
  success?: boolean
  status?: number
  data?: T
  error?: string
}

interface ApiEnvelope<T> {
  success?: boolean
  message?: string
  data?: T
}

interface AutoDetectContentFetchOptions extends AutoDetectContentFetchContext {
  endpoint: string
  method?: string
}

let autoDetectContentFetchRequestCounter = 0

const buildAutoDetectHeaders = (
  userId: number | string | undefined,
): Record<string, string> => ({
  "Content-Type": REQUEST_CONFIG.HEADERS.CONTENT_TYPE,
  Pragma: REQUEST_CONFIG.HEADERS.PRAGMA,
  [EXTENSION_HEADER_NAME]: EXTENSION_HEADER_VALUE,
  ...buildCompatUserIdHeaders(userId),
})

const unwrapApiEnvelope = <T>(
  response: ContentFetchResponse<ApiEnvelope<T> | T>,
  endpoint: string,
): T => {
  if (!response.success) {
    throw new ApiError(
      response.error || "auto_detect_content_fetch_failed",
      response.status,
      endpoint,
    )
  }

  const payload = response.data
  if (payload && typeof payload === "object" && "success" in payload) {
    const envelope = payload as ApiEnvelope<T>
    if (envelope.success === false) {
      throw new ApiError(
        typeof envelope.message === "string"
          ? envelope.message
          : "auto_detect_content_fetch_failed",
        response.status,
        endpoint,
      )
    }
    if (envelope.success === true && "data" in payload) {
      return envelope.data as T
    }
  }

  return payload as T
}

/**
 * Fetches New API compatible data through the matched current tab content script.
 */
async function fetchApiDataViaAutoDetectContent<T>({
  tabId,
  baseUrl,
  userId,
  endpoint,
  method = "GET",
}: AutoDetectContentFetchOptions): Promise<T> {
  const fetchUrl = joinUrl(baseUrl, endpoint)
  autoDetectContentFetchRequestCounter += 1
  const requestId = `auto-detect-content-fetch-${Date.now()}-${autoDetectContentFetchRequestCounter}`

  try {
    const response = (await sendTabMessageWithRetry(tabId, {
      action: RuntimeActionIds.ContentPerformTempWindowFetch,
      requestId,
      fetchUrl,
      responseType: "json",
      fetchOptions: {
        method,
        credentials: "include",
        headers: buildAutoDetectHeaders(userId),
      },
    })) as ContentFetchResponse<ApiEnvelope<T> | T>

    return unwrapApiEnvelope<T>(response, endpoint)
  } catch (error) {
    if (error instanceof ApiError) {
      throw error
    }
    throw new ApiError(getErrorMessage(error), undefined, endpoint)
  }
}

/**
 * Fetches and normalizes the current account user info through content fetch.
 */
export async function fetchUserInfoViaAutoDetectContent(
  context: AutoDetectContentFetchContext,
): Promise<{
  id: number
  username: string
  access_token: string
  user: UserInfo
}> {
  const userData = await fetchApiDataViaAutoDetectContent<UserInfo>({
    ...context,
    endpoint: "/api/user/self",
  })

  if (
    !userData ||
    typeof userData.id !== "number" ||
    typeof userData.username !== "string"
  ) {
    throw new ApiError(
      "auto_detect_content_user_info_incomplete",
      undefined,
      "/api/user/self",
    )
  }

  return {
    id: userData.id,
    username: userData.username,
    access_token:
      typeof userData.access_token === "string" ? userData.access_token : "",
    user: userData,
  }
}

/**
 * Resolves an existing access token or creates one through content fetch.
 */
export async function getOrCreateAccessTokenViaAutoDetectContent(
  context: AutoDetectContentFetchContext,
): Promise<{
  username: string
  access_token: string
}> {
  const userInfo = await fetchUserInfoViaAutoDetectContent(context)
  let accessToken = userInfo.access_token

  if (!accessToken) {
    accessToken = await fetchApiDataViaAutoDetectContent<string>({
      ...context,
      endpoint: "/api/user/token",
    })
  }

  return {
    username: userInfo.username,
    access_token: accessToken,
  }
}

/**
 * Fetches common-compatible site status through content fetch.
 */
export async function fetchSiteStatusViaAutoDetectContent(
  context: AutoDetectContentFetchContext,
): Promise<SiteStatusInfo | null> {
  try {
    return await fetchApiDataViaAutoDetectContent<SiteStatusInfo>({
      ...context,
      endpoint: "/api/status",
    })
  } catch (error) {
    logger.warn("Failed to fetch site status through auto-detect content", {
      error: getErrorMessage(error),
    })
    return null
  }
}

/**
 * Fetches common-compatible check-in support from site status through content.
 */
export async function fetchSupportCheckInViaAutoDetectContent(
  context: AutoDetectContentFetchContext,
): Promise<boolean | undefined> {
  const siteStatus = await fetchSiteStatusViaAutoDetectContent(context)
  return siteStatus?.checkin_enabled
}
