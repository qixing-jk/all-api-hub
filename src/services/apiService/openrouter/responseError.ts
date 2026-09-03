import { API_ERROR_CODES, ApiError } from "~/services/apiTransport/errors"
import { readSafeUpstreamCode } from "~/services/apiTransport/responseError"
import type {
  ApiResponseErrorDecoder,
  ApiTransportResponse,
} from "~/services/apiTransport/type"
import { getErrorMessage } from "~/utils/core/error"

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value)

/** Reads the documented nested OpenRouter error without applying disclosure policy. */
function readOpenRouterErrorDetails(
  body: unknown,
): { message: string; upstreamCode?: string } | null {
  if (!isRecord(body) || !isRecord(body.error)) return null
  const error = body.error
  if (!Number.isInteger(error.code)) return null
  const message =
    typeof error.message === "string" && error.message.trim()
      ? error.message.trim()
      : undefined
  const upstreamCode = readSafeUpstreamCode(error.code)
  if (!message) return null

  return {
    message,
    ...(upstreamCode ? { upstreamCode } : {}),
  }
}

/**
 * Decodes OpenRouter's documented non-2xx `{ error: { code, message } }` body.
 * https://github.com/OpenRouterTeam/docs/blob/348a977a5da325fb27e11b79c5662dc88d4ed4c8/openapi/openapi.yaml
 */
export const decodeOpenRouterResponseError: ApiResponseErrorDecoder = (
  response,
) => {
  if (response.ok) return null
  const details = readOpenRouterErrorDetails(response.body)
  if (!details) return null

  return {
    kind: "http",
    ...details,
  }
}

const getOpenRouterHttpErrorCode = (status: number) => {
  if (status === 401) return API_ERROR_CODES.HTTP_401
  if (status === 403) return API_ERROR_CODES.HTTP_403
  if (status === 429) return API_ERROR_CODES.HTTP_429
  return API_ERROR_CODES.HTTP_OTHER
}

/** Converts one raw OpenRouter failure after provider parsing, without redaction. */
export function createOpenRouterHttpError(
  response: ApiTransportResponse<unknown>,
  endpoint: string,
  fixedFallback: string,
): ApiError {
  const providerError = decodeOpenRouterResponseError(response, { endpoint })
  return new ApiError(
    getErrorMessage(providerError?.message, fixedFallback),
    response.status,
    endpoint,
    getOpenRouterHttpErrorCode(response.status),
    providerError?.upstreamCode,
  )
}
