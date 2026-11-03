import {
  NANOGPT_API_ORIGIN,
  NANOGPT_WEB_ORIGIN,
} from "~/services/accountSiteDefinitions/identifiers"
import { NANOGPT_MANAGEMENT_TOKEN_PREFIX } from "~/services/apiService/nanogpt/constants"
import { parseNanoGptCredentials } from "~/services/apiService/nanogpt/credentials"
import { decodeNanoGptResponseError } from "~/services/apiService/nanogpt/responseError"
import { API_ERROR_CODES, ApiError } from "~/services/apiTransport/errors"
import { fetchPreparedJsonResponse } from "~/services/apiTransport/requestExecution"
import type { ApiServiceRequest } from "~/services/apiTransport/type"
import { toSanitizedErrorSummary } from "~/services/verification/aiApiVerification/utils"
import { getErrorMessage } from "~/utils/core/error"
import { joinUrl } from "~/utils/core/url"
import { t } from "~/utils/i18n/core"

export type NanoGptRequestOptions = {
  method?: "GET" | "POST" | "PATCH" | "DELETE"
  idempotencyKey?: string
  body?: unknown
}

const statusToErrorCode = (status: number) => {
  if (status === 401) return API_ERROR_CODES.HTTP_401
  if (status === 403) return API_ERROR_CODES.HTTP_403
  if (status === 429) return API_ERROR_CODES.HTTP_429
  return API_ERROR_CODES.HTTP_OTHER
}

/**
 * Reads one NanoGPT inference endpoint with the account's API key.
 *
 * Requests go to the documented direct host (`https://api.nano-gpt.com`) with
 * `Authorization: Bearer`; the console origin is a separate role and never
 * receives the saved key from here.
 * https://docs.nano-gpt.com/getting-started/authentication
 */
async function fetchNanoGptEndpoint<T>(
  request: ApiServiceRequest,
  endpoint: string,
  options: NanoGptRequestOptions,
  management: boolean,
): Promise<T> {
  const credentials = parseNanoGptCredentials(request.auth?.accessToken)
  const accessToken = management
    ? credentials.managementToken
    : credentials.apiKey
  if (
    (management && !accessToken.startsWith(NANOGPT_MANAGEMENT_TOKEN_PREFIX)) ||
    (!management && accessToken.startsWith(NANOGPT_MANAGEMENT_TOKEN_PREFIX))
  )
    throw new ApiError(
      "NanoGPT credential type does not match this endpoint",
      undefined,
      endpoint,
      API_ERROR_CODES.FEATURE_UNSUPPORTED,
    )
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
  if (options.idempotencyKey)
    headers.set("Idempotency-Key", options.idempotencyKey)
  if (method !== "GET" && options.body !== undefined) {
    headers.set("Content-Type", "application/json")
  }

  const response = await fetchPreparedJsonResponse(request, {
    url: joinUrl(
      management
        ? `${NANOGPT_WEB_ORIGIN}/api/management/v1`
        : NANOGPT_API_ORIGIN,
      endpoint,
    ),
    options: {
      method,
      headers,
      // The API key is the only credential; never attach browser cookies.
      credentials: "omit",
      ...(options.body === undefined
        ? {}
        : { body: JSON.stringify(options.body) }),
    },
  })

  if (!response.ok) {
    const providerError = decodeNanoGptResponseError(response, { endpoint })
    throw new ApiError(
      // This boundary still owns the exact key, including legacy bare UUIDs
      // that cannot be recognized safely by generic secret-pattern matching.
      toSanitizedErrorSummary(
        getErrorMessage(
          providerError?.message,
          t("messages:errors.api.requestFailed", { status: response.status }),
        ),
        [credentials.apiKey, credentials.managementToken],
      ),
      response.status,
      endpoint,
      statusToErrorCode(response.status),
      providerError?.upstreamCode,
    )
  }

  if (method === "DELETE" && response.status !== 204)
    throw new ApiError(
      "Unexpected NanoGPT revoke response",
      response.status,
      endpoint,
      API_ERROR_CODES.JSON_PARSE_ERROR,
    )
  return response.body as T
}

/** Inference credentials never leave the direct inference host. */
export const fetchNanoGptData = <T>(
  request: ApiServiceRequest,
  endpoint: string,
  options: NanoGptRequestOptions = {},
) => fetchNanoGptEndpoint<T>(request, endpoint, options, false)

/** Management credentials never reach inference endpoints; cookies are always omitted. */
export const fetchNanoGptManagementData = <T>(
  request: ApiServiceRequest,
  endpoint: string,
  options: NanoGptRequestOptions = {},
) => fetchNanoGptEndpoint<T>(request, endpoint, options, true)
