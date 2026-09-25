import { decodeRightCodeResponseError } from "~/services/apiService/rightcode/responseError"
import { API_ERROR_CODES, ApiError } from "~/services/apiTransport/errors"
import { fetchPreparedJsonResponse } from "~/services/apiTransport/requestExecution"
import type { ApiServiceRequest } from "~/services/apiTransport/type"
import { getErrorMessage } from "~/utils/core/error"
import { joinUrl } from "~/utils/core/url"
import { t } from "~/utils/i18n/core"

export type RightCodeQueryValue = string | number | boolean | undefined | null

export type RightCodeRequestOptions = {
  method?: "GET" | "POST" | "PATCH" | "DELETE"
  query?: Record<string, RightCodeQueryValue>
  body?: unknown
}

const buildUrl = (
  baseUrl: string,
  endpoint: string,
  query?: Record<string, RightCodeQueryValue>,
): string => {
  const url = joinUrl(baseUrl, endpoint)
  if (!query) return url

  const params = new URLSearchParams()
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === null) continue
    params.append(key, String(value))
  }

  const search = params.toString()
  return search ? `${url}?${search}` : url
}

/** Whether a failure means the saved account token is no longer accepted. */
export const isRightCodeAuthFailureError = (
  error: unknown,
): error is ApiError => error instanceof ApiError && error.statusCode === 401

/**
 * Calls the Right Code console API with the account token as a bearer
 * credential.
 *
 * Unlike One/New API deployments there is no `/api/...` prefix: every endpoint
 * is rooted at the account's own origin, and the deployment is served from the
 * same host the user signed in on.
 */
export const fetchRightCodeData = async <T>(
  request: ApiServiceRequest,
  endpoint: string,
  options: RightCodeRequestOptions = {},
): Promise<T> => {
  const accessToken =
    typeof request.auth?.accessToken === "string"
      ? request.auth.accessToken.trim()
      : ""
  if (!accessToken) {
    throw new ApiError(
      t("messages:operations.detection.getInfoFailed"),
      401,
      endpoint,
      API_ERROR_CODES.HTTP_401,
    )
  }

  const method = options.method ?? "GET"
  const headers = new Headers()
  headers.set("Authorization", `Bearer ${accessToken}`)
  headers.set("Accept", "application/json")
  if (method !== "GET" && options.body !== undefined) {
    headers.set("Content-Type", "application/json")
  }

  const response = await fetchPreparedJsonResponse(request, {
    url: buildUrl(request.baseUrl, endpoint, options.query),
    options: {
      method,
      headers,
      credentials: "omit",
      ...(options.body === undefined
        ? {}
        : { body: JSON.stringify(options.body) }),
    },
  })

  if (!response.ok) {
    const providerError = decodeRightCodeResponseError(response, { endpoint })
    throw new ApiError(
      getErrorMessage(
        providerError?.message,
        t("messages:errors.api.requestFailed", { status: response.status }),
      ),
      response.status,
      endpoint,
      statusToErrorCode(response.status),
      providerError?.upstreamCode,
    )
  }

  return response.body as T
}

const statusToErrorCode = (status: number) => {
  if (status === 401) return API_ERROR_CODES.HTTP_401
  if (status === 403) return API_ERROR_CODES.HTTP_403
  if (status === 429) return API_ERROR_CODES.HTTP_429
  return API_ERROR_CODES.HTTP_OTHER
}
