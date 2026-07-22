import { API_ERROR_CODES, ApiError } from "~/services/apiTransport/errors"
import { t } from "~/utils/i18n/core"

/**
 * Validate whether a string is an HTTP(S) URL.
 * @param url Candidate URL string.
 * @returns true when protocol is http/https; false on invalid or other schemes.
 */
export function isHttpUrl(url: string): boolean {
  try {
    const parsed = new URL(url)
    return parsed.protocol === "http:" || parsed.protocol === "https:"
  } catch {
    return false
  }
}

/**
 * Extract the `data` field from a JSON API response, throwing on invalid shape.
 * @param body Parsed JSON body from upstream.
 * @param endpoint Optional endpoint for richer error context.
 * @returns Extracted `data` payload cast to T.
 */
export function extractDataFromApiResponseBody<T>(
  body: any,
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

  if (body.success === false) {
    const message = body.message || invalidResponseMessage
    throw new ApiError(
      message,
      undefined,
      endpoint,
      API_ERROR_CODES.BUSINESS_ERROR,
    )
  }

  if (!("data" in body) || body.data === undefined) {
    throw new ApiError(
      invalidResponseMessage,
      undefined,
      endpoint,
      API_ERROR_CODES.JSON_PARSE_ERROR,
    )
  }

  return body.data as T
}
