import { readSub2ApiFailureEnvelope } from "~/services/apiService/sub2api/responseError"
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

/** Some check-in deployments report string business codes outside the family envelope. */
function readCheckInFailure(body: Record<string, unknown> | null) {
  if (
    !body ||
    typeof body.message !== "string" ||
    (typeof body.code !== "string" && typeof body.code !== "number")
  )
    return null
  return {
    message: body.message.trim(),
    upstreamCode: String(body.code),
    reason:
      typeof body.reason === "string" && body.reason ? body.reason : undefined,
  }
}

/**
 * Parses the code/message/data envelope shared by Sub2API check-in providers.
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
    if (!response.ok || envelope?.code !== 0) {
      const failure =
        (!response.ok ? readSub2ApiFailureEnvelope(envelope) : null) ??
        readCheckInFailure(envelope)
      if (response.ok && !failure) throw invalidResponse(endpoint)
      throw new ApiError(
        failure?.message ||
          `${sourceName} daily check-in request failed with HTTP ${response.status}`,
        response.ok ? undefined : response.status,
        endpoint,
        response.ok
          ? API_ERROR_CODES.BUSINESS_ERROR
          : getHttpErrorCode(response.status),
        failure?.reason ?? failure?.upstreamCode,
      )
    }
    if (typeof envelope.message !== "string") throw invalidResponse(endpoint)
    const data = toRecord(envelope.data)
    if (!data) throw invalidResponse(endpoint)
    return data
  }

  return { parseEnvelopeData, invalidResponse }
}
