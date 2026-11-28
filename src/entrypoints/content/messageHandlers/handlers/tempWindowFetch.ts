import type { SiteType } from "~/constants/siteType"
import { getRequestProtocol } from "~/services/apiAdapters/requestProtocol"
import { ApiError } from "~/services/apiTransport/errors"
import { announceRemoteFetchDispatch } from "~/services/apiTransport/remoteLifecycle"
import type {
  ApiTransportRemoteLifecycleEvidence,
  TempWindowFetch,
  TempWindowResponseType,
} from "~/types/tempWindowFetch"
import {
  EXTENSION_HEADER_NAME,
  EXTENSION_HEADER_VALUE,
} from "~/utils/browser/cookieHelper"
import {
  assertFetchDispatchDeadline,
  type DispatchBoundRequestInit,
} from "~/utils/browser/requestInitMessage"
import { getErrorMessage } from "~/utils/core/error"
import { createLogger } from "~/utils/core/logger"
import { sanitizeUrlForLog } from "~/utils/core/sanitizeUrlForLog"

import { logCloudflareGuard } from "../utils/cloudflareGuard"
import {
  normalizeFetchOptions,
  parseResponseData,
} from "../utils/tempFetchUtils"

/**
 * Unified logger scoped to content-side temp window fetch message handling.
 */
const logger = createLogger("TempWindowFetchHandler")

interface TempWindowContentFetchRequest {
  expectedOrigin?: string
  fetchUrl?: string
  fetchOptions?: DispatchBoundRequestInit
  requestId?: string
  responseType?: TempWindowResponseType
  siteType?: SiteType
}

/**
 * Handles temporary window fetch requests.
 */
export function handlePerformTempWindowFetch(
  message: unknown,
  sendResponse: (res: TempWindowFetch) => void,
) {
  const request = message as TempWindowContentFetchRequest
  const transportLifecycle: ApiTransportRemoteLifecycleEvidence = {
    upstreamRequestDispatched: false,
    upstreamResponseReceived: false,
  }
  const perform = async () => {
    try {
      const {
        expectedOrigin,
        fetchUrl,
        fetchOptions = {},
        responseType = "json",
        requestId,
      } = request

      if (!fetchUrl || !expectedOrigin) {
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
      normalizedOptions.redirect = "error"
      // Respect caller-provided credentials so token-auth flows can omit cookies.
      // Cookie-auth flows should explicitly set credentials="include" when needed.
      if (!normalizedOptions.credentials) {
        normalizedOptions.credentials = "include"
      }

      const requestHeaders = new Headers(normalizedOptions.headers)
      requestHeaders.set(EXTENSION_HEADER_NAME, EXTENSION_HEADER_VALUE)
      normalizedOptions.headers = Object.fromEntries(requestHeaders.entries())

      const normalizedExpectedOrigin = new URL(expectedOrigin).origin
      const assertDispatchAllowed = () => {
        if (
          globalThis.location.origin !== normalizedExpectedOrigin ||
          new URL(fetchUrl).origin !== normalizedExpectedOrigin
        ) {
          throw new Error("Temporary context origin changed before fetch")
        }
        assertFetchDispatchDeadline(normalizedOptions)
      }
      assertDispatchAllowed()
      const dispatch = async (options: RequestInit) => {
        // Preparation may fail before fetch; report only actual dispatches.
        assertDispatchAllowed()
        transportLifecycle.upstreamRequestDispatched = true
        if (typeof requestId === "string" && requestId.length > 0) {
          announceRemoteFetchDispatch(requestId)
        }
        const response = await fetch(fetchUrl, options)
        transportLifecycle.upstreamResponseReceived = true
        return response
      }
      const protocol = await getRequestProtocol(request.siteType)
      const response = protocol?.fetchInBrowser
        ? await protocol.fetchInBrowser(fetchUrl, normalizedOptions, dispatch)
        : await dispatch(normalizedOptions)

      const headers: Record<string, string> = {}
      response.headers.forEach((value, key) => {
        headers[key] = value
      })

      let data: any = null
      try {
        data = await parseResponseData(response, responseType)
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
        transportLifecycle,
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
      const message = getErrorMessage(error)
      if (request.requestId) {
        logCloudflareGuard("tempFetchError", {
          requestId: request.requestId,
          fetchUrl: request.fetchUrl
            ? sanitizeUrlForLog(String(request.fetchUrl))
            : null,
          error: message,
        })
      }
      sendResponse({
        transportLifecycle,
        success: false,
        error: message,
        ...(error instanceof ApiError
          ? {
              code: error.code,
              localError: {
                statusCode: error.statusCode,
                upstreamCode: error.upstreamCode,
              },
            }
          : {}),
      })
    }
  }

  void perform()

  return true
}
