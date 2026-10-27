import {
  API_ERROR_CODES,
  ApiError,
  type ApiErrorCode,
} from "~/services/apiTransport/errors"
import { isRecord } from "~/utils/core/object"

const statusToErrorCode = (status: number): ApiErrorCode =>
  status === 401
    ? API_ERROR_CODES.HTTP_401
    : status === 403
      ? API_ERROR_CODES.HTTP_403
      : status === 429
        ? API_ERROR_CODES.HTTP_429
        : status >= 400 && status < 500 && status !== 408 && status !== 499
          ? API_ERROR_CODES.BUSINESS_ERROR
          : API_ERROR_CODES.HTTP_OTHER

/** Decodes the provider's JSON error envelope, if one is present. */
export function decodeNovitaResponseError(
  response: { ok: boolean; status: number; body: unknown },
  context: { endpoint: string },
): ApiError {
  const envelope = isRecord(response.body) ? response.body : undefined
  const message =
    envelope && typeof envelope.message === "string" && envelope.message
      ? envelope.message
      : `Novita request failed: ${response.status}`
  const upstreamCode =
    envelope && typeof envelope.reason === "string" && envelope.reason
      ? envelope.reason
      : undefined
  return new ApiError(
    message,
    response.status,
    context.endpoint,
    statusToErrorCode(response.status),
    upstreamCode,
  )
}
