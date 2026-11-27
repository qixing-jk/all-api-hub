import { readSub2ApiSessionBindingMismatch } from "~/services/apiService/sub2api/responseError"
import { API_ERROR_CODES, ApiError } from "~/services/apiTransport/errors"
import { fetchApiResponse } from "~/services/apiTransport/request"
import type { ApiServiceRequest } from "~/services/apiTransport/type"

import {
  readAuthenticatedCheckInStatus,
  type Sub2ApiCheckInStatusAuth,
} from "./statusAuthentication"

/** A non-JSON page can be the deployment's frontend fallback. */
export function tryParseCheckInJson(body: string): unknown {
  try {
    return JSON.parse(body) as unknown
  } catch {
    return undefined
  }
}

/** Read the raw reply so each probe can distinguish its app from the frontend fallback. */
export function fetchCheckInStatusText(
  request: ApiServiceRequest,
  endpoint: string,
) {
  return fetchApiResponse<string>(request, {
    endpoint,
    options: { method: "GET", cache: "no-store" },
    responseType: "text",
  })
}

/** Preserve HTTP 401 and session-binding evidence before a probe classifies the text response. */
export function fetchAuthenticatedCheckInStatusText(
  request: ApiServiceRequest,
  endpoint: string,
  auth?: Sub2ApiCheckInStatusAuth,
) {
  return readAuthenticatedCheckInStatus(
    request,
    endpoint,
    async (authenticated) => {
      const response = await fetchCheckInStatusText(authenticated, endpoint)
      if (auth?.allowAuthenticationRecovery && response.status === 401) {
        throw new ApiError(
          "Check-in status requires authentication",
          401,
          endpoint,
          API_ERROR_CODES.HTTP_401,
          readSub2ApiSessionBindingMismatch(tryParseCheckInJson(response.body)),
        )
      }
      return response
    },
    auth,
  )
}
