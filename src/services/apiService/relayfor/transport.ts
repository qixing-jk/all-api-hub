import { decodeRelayForResponseError } from "~/services/apiService/relayfor/responseError"
import { API_ERROR_CODES, ApiError } from "~/services/apiTransport/errors"
import { fetchPreparedJsonResponse } from "~/services/apiTransport/requestExecution"
import type { ApiServiceRequest } from "~/services/apiTransport/type"
import { getErrorMessage } from "~/utils/core/error"
import { joinUrl } from "~/utils/core/url"
import { t } from "~/utils/i18n/core"

export type RelayForQueryValue = string | number | boolean | undefined | null

export type RelayForRequestOptions = {
  method?: "GET" | "POST" | "PUT" | "DELETE"
  query?: Record<string, RelayForQueryValue>
  body?: unknown
}

const buildUrl = (
  baseUrl: string,
  endpoint: string,
  query?: Record<string, RelayForQueryValue>,
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

/** Whether a failure indicates the access token is invalid or expired (HTTP 401). */
export const isRelayForAuthFailureError = (error: unknown): error is ApiError =>
  error instanceof ApiError && error.statusCode === 401

const statusToErrorCode = (status: number) => {
  if (status === 401) return API_ERROR_CODES.HTTP_401
  if (status === 403) return API_ERROR_CODES.HTTP_403
  if (status === 429) return API_ERROR_CODES.HTTP_429
  return API_ERROR_CODES.HTTP_OTHER
}

/**
 * Calls the RelayFor API with the account token as a bearer credential.
 */
export const fetchRelayForData = async <T>(
  request: ApiServiceRequest,
  endpoint: string,
  options: RelayForRequestOptions = {},
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
    const providerError = decodeRelayForResponseError(response, { endpoint })
    throw new ApiError(
      getErrorMessage(
        ["totp_required", "totp_invalid"].includes(
          providerError?.upstreamCode ?? "",
        )
          ? t("messages:errors.relayForVerificationRequired")
          : providerError?.message,
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
