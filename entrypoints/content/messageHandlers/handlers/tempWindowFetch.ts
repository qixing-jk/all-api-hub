import {
  EXTENSION_HEADER_NAME,
  EXTENSION_HEADER_VALUE,
} from "~/utils/cookieHelper"
import { getErrorMessage } from "~/utils/error"
import { createLogger } from "~/utils/logger"
import { sanitizeUrlForLog } from "~/utils/sanitizeUrlForLog"

import { logCloudflareGuard } from "../utils/cloudflareGuard"
import {
  normalizeFetchOptions,
  parseResponseData,
  TempWindowResponseType,
} from "../utils/tempFetchUtils"

/**
 * Unified logger scoped to content-side temp window fetch message handling.
 */
const logger = createLogger("TempWindowFetchHandler")

/**
 * Handles temporary window fetch requests.
 */
export function handlePerformTempWindowFetch(
  request: any,
  sendResponse: (res: any) => void,
) {
  const perform = async () => {
    try {
      const {
        fetchUrl,
        fetchOptions = {},
        responseType = "json",
        requestId,
      } = request

      if (!fetchUrl) {
        throw new Error("Invalid fetch request")
      }

      if (requestId) {
        logCloudflareGuard("tempFetchStart", {
          requestId,
          fetchUrl: sanitizeUrlForLog(String(fetchUrl)),
          responseType,
        })
      }

      const normalizedOptions = normalizeFetchOptions(fetchOptions)
      // Respect caller-provided credentials so token-auth flows can omit cookies.
      // Cookie-auth flows should explicitly set credentials="include" when needed.
      if (!normalizedOptions.credentials) {
        normalizedOptions.credentials = "include"
      }

      const requestHeaders = new Headers(normalizedOptions.headers)
      requestHeaders.set(EXTENSION_HEADER_NAME, EXTENSION_HEADER_VALUE)
      normalizedOptions.headers = Object.fromEntries(requestHeaders.entries())

      const response = await fetch(fetchUrl, normalizedOptions)

      const headers: Record<string, string> = {}
      response.headers.forEach((value, key) => {
        headers[key] = value
      })

      let data: any = null
      try {
        data = await parseResponseData(
          response,
          responseType as TempWindowResponseType,
        )
      } catch (parseError) {
        logger.warn("Failed to parse response", parseError)
      }

      const errorMessage = response.ok
        ? undefined
        : typeof data === "string"
          ? data
          : data?.message
            ? data.message
            : JSON.stringify(data ?? {})

      sendResponse({
        success: response.ok,
        status: response.status,
        headers,
        data,
        error: errorMessage,
      })

      if (requestId) {
        logCloudflareGuard("tempFetchDone", {
          requestId,
          fetchUrl: sanitizeUrlForLog(String(fetchUrl)),
          ok: response.ok,
          status: response.status,
        })
      }
    } catch (error) {
      if (request.requestId) {
        logCloudflareGuard("tempFetchError", {
          requestId: request.requestId,
          fetchUrl: request.fetchUrl
            ? sanitizeUrlForLog(String(request.fetchUrl))
            : null,
          error: getErrorMessage(error),
        })
      }
      sendResponse({ success: false, error: getErrorMessage(error) })
    }
  }

  void perform()

  return true
}
