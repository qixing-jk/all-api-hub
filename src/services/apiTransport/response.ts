import { API_ERROR_CODES, ApiError } from "~/services/apiTransport/errors"
import type { ApiResponse } from "~/services/apiTransport/type"
import { getErrorMessage } from "~/utils/core/error"
import { t } from "~/utils/i18n/core"

/** Returns whether a value is the shared API response envelope. */
export function isApiResponseBody(
  value: unknown,
): value is ApiResponse<unknown> {
  if (!value || typeof value !== "object") return false
  const record = value as Record<string, unknown>
  return (
    typeof record.success === "boolean" &&
    typeof record.message === "string" &&
    "data" in record
  )
}

/**
 * Extract the `data` field from a JSON API response, throwing on invalid shape.
 * @param body Parsed JSON body from upstream.
 * @param endpoint Optional endpoint for richer error context.
 * @returns Extracted `data` payload cast to T.
 */
export function extractDataFromApiResponseBody<T>(
  body: unknown,
  endpoint?: string,
): T {
  const invalidResponseMessage = t("messages:errors.api.invalidResponseFormat")

  if (!body || typeof body !== "object") {
    throw new ApiError(
      invalidResponseMessage,
      undefined,
      endpoint,
      API_ERROR_CODES.JSON_PARSE_ERROR,
    )
  }

  const record = body as Record<string, unknown>

  if (record.success === false) {
    const message = getErrorMessage(record.message, invalidResponseMessage)
    throw new ApiError(
      message,
      undefined,
      endpoint,
      API_ERROR_CODES.BUSINESS_ERROR,
    )
  }

  if (!("data" in record) || record.data === undefined) {
    throw new ApiError(
      invalidResponseMessage,
      undefined,
      endpoint,
      API_ERROR_CODES.JSON_PARSE_ERROR,
    )
  }

  return record.data as T
}
