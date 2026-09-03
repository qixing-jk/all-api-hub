import type { TempWindowResponseType } from "~/types/tempWindowFetch"
import { getErrorMessage } from "~/utils/core/error"
import { t } from "~/utils/i18n/core"

import { API_ERROR_CODES, ApiError, type ApiErrorCode } from "./errors"
import { extractDataFromApiResponseBody } from "./response"
import { resolveResponseErrorDetails } from "./responseError"
import type {
  ApiResponse,
  ApiResponseErrorDecoder,
  ApiTransportResponse,
} from "./type"

type CompatibilityTransportResponse<T> = ApiTransportResponse<T> & {
  decodeError?: ApiError
}

/** Maps provider-declared application failures carried by a successful HTTP response. */
function createProviderBusinessError(
  response: ApiTransportResponse<unknown>,
  context: {
    endpoint: string
    responseType: TempWindowResponseType
    decodeApplicationError: boolean
    errorResponseDecoder?: ApiResponseErrorDecoder
  },
): ApiError | null {
  if (
    context.responseType !== "json" ||
    !context.decodeApplicationError ||
    !context.errorResponseDecoder
  ) {
    return null
  }

  const decoded = resolveResponseErrorDetails(
    response,
    context.endpoint,
    context.errorResponseDecoder,
  )
  if (decoded?.kind !== "business") return null

  return new ApiError(
    getErrorMessage(
      decoded.message,
      t("messages:errors.api.invalidResponseFormat"),
    ),
    undefined,
    context.endpoint,
    API_ERROR_CODES.BUSINESS_ERROR,
    decoded.upstreamCode,
  )
}

/** Converts an unsuccessful HTTP result into the legacy shared ApiError. */
function createCompatibilityHttpError(
  response: ApiTransportResponse<unknown>,
  context: {
    endpoint: string
    responseType: TempWindowResponseType
    errorResponseDecoder?: ApiResponseErrorDecoder
  },
): ApiError {
  let errorCode: ApiErrorCode = API_ERROR_CODES.HTTP_OTHER
  const fixedFallback = `请求失败: ${response.status}`

  if (response.status === 401) {
    errorCode = API_ERROR_CODES.HTTP_401
  } else if (response.status === 403) {
    errorCode = API_ERROR_CODES.HTTP_403
  } else if (response.status === 429) {
    errorCode = API_ERROR_CODES.HTTP_429
  }

  if (
    context.responseType === "json" &&
    (response.status === 401 || response.status === 429)
  ) {
    const retryAfter =
      response.status === 429 ? response.headers["retry-after"] : undefined
    const hasRetryAfter = response.status === 429 && retryAfter !== undefined
    const contentType = response.headers["content-type"] || ""
    const looksLikeHtml =
      /\btext\/html\b/i.test(contentType) ||
      /\bapplication\/xhtml\+xml\b/i.test(contentType)

    if (!hasRetryAfter && looksLikeHtml) {
      errorCode = API_ERROR_CODES.CONTENT_TYPE_MISMATCH
    }
  }

  const decoded =
    context.responseType === "json" &&
    errorCode !== API_ERROR_CODES.CONTENT_TYPE_MISMATCH
      ? resolveResponseErrorDetails(
          response,
          context.endpoint,
          context.errorResponseDecoder,
        )
      : null

  if (decoded?.kind === "business" && response.status === 403) {
    errorCode = API_ERROR_CODES.BUSINESS_ERROR
  }

  const message = getErrorMessage(decoded?.message, fixedFallback)

  return new ApiError(
    message,
    response.status,
    context.endpoint,
    errorCode,
    decoded?.upstreamCode,
  )
}

/** Applies the existing envelope and error behavior above raw HTTP transport. */
export function mapCompatibilityResponse<T>(
  response: CompatibilityTransportResponse<T>,
  context: {
    endpoint: string
    responseType: TempWindowResponseType
    onlyData: boolean
    decodeApplicationError: boolean
    errorResponseDecoder?: ApiResponseErrorDecoder
  },
): T | ApiResponse<T> {
  if (!response.ok) {
    throw createCompatibilityHttpError(response, context)
  }

  if (response.decodeError) throw response.decodeError

  const providerBusinessError = createProviderBusinessError(response, context)
  if (providerBusinessError) throw providerBusinessError

  if (context.responseType === "json" && context.onlyData) {
    return extractDataFromApiResponseBody<T>(response.body, context.endpoint)
  }

  return response.body as T | ApiResponse<T>
}
