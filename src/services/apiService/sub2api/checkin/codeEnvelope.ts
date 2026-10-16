import { API_ERROR_CODES, ApiError } from "~/services/apiTransport/errors"
import type { ApiTransportResponse } from "~/services/apiTransport/type"

const toRecord = (value: unknown): Record<string, unknown> | null =>
  value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null

const getHttpErrorCode = (status: number) => {
  if (status === 401) return API_ERROR_CODES.HTTP_401
  if (status === 403) return API_ERROR_CODES.HTTP_403
  if (status === 429) return API_ERROR_CODES.HTTP_429
  return API_ERROR_CODES.HTTP_OTHER
}

/**
 * Parses the code/message/data envelope shared by FreeAPI and Clawhud.
 * Keep reason precedence, HTTP classification and source-specific copy here;
 * deployment status fields and mutation results remain with each adapter.
 */
export function createCheckInCodeEnvelopeParser(sourceName: string) {
  const invalidResponse = (endpoint: string) =>
    new ApiError(
      `Invalid ${sourceName} daily check-in response`,
      undefined,
      endpoint,
      API_ERROR_CODES.JSON_PARSE_ERROR,
    )

  const parseEnvelopeData = (
    response: ApiTransportResponse<unknown>,
    endpoint: string,
  ): Record<string, unknown> => {
    const envelope = toRecord(response.body)
    if (!envelope) {
      if (!response.ok) {
        throw new ApiError(
          `${sourceName} daily check-in request failed with HTTP ${response.status}`,
          response.status,
          endpoint,
          getHttpErrorCode(response.status),
        )
      }
      throw invalidResponse(endpoint)
    }

    if (
      (typeof envelope.code !== "string" &&
        typeof envelope.code !== "number") ||
      typeof envelope.message !== "string"
    ) {
      throw invalidResponse(endpoint)
    }

    const upstreamCode =
      typeof envelope.reason === "string" && envelope.reason
        ? envelope.reason
        : String(envelope.code)
    const message = envelope.message.trim() || undefined
    const isSuccessEnvelope = envelope.code === 0 && response.ok

    if (!isSuccessEnvelope) {
      throw new ApiError(
        message ??
          `${sourceName} daily check-in request failed with HTTP ${response.status}`,
        response.ok ? undefined : response.status,
        endpoint,
        response.ok
          ? API_ERROR_CODES.BUSINESS_ERROR
          : getHttpErrorCode(response.status),
        upstreamCode,
      )
    }

    const data = toRecord(envelope.data)
    if (!data) throw invalidResponse(endpoint)
    return data
  }

  return { parseEnvelopeData, invalidResponse }
}
