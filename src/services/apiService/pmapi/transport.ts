import { API_ERROR_CODES, ApiError } from "~/services/apiTransport/errors"
import { fetchApi } from "~/services/apiTransport/request"
import type { ApiServiceRequest } from "~/services/apiTransport/type"
import { isRecord } from "~/utils/core/object"

/** Malformed console payloads are protocol errors, never partial data. */
export function invalidPmApiResponse(endpoint: string): never {
  throw new ApiError(
    "Invalid PM-API response",
    undefined,
    endpoint,
    API_ERROR_CODES.JSON_PARSE_ERROR,
  )
}

/**
 * Account routes answer `{data, message, success}` with `success === true` on
 * success. Business failures answer `success:false` with a human-readable
 * `message`; expiring sessions fail with HTTP 401 before the envelope parses.
 */
export async function fetchPmApiEnvelope(
  request: ApiServiceRequest,
  endpoint: string,
  options: RequestInit = {},
): Promise<{ data: unknown; message: unknown; success: true }> {
  const method = (options.method ?? "GET").toUpperCase()
  let body: unknown
  try {
    body = await fetchApi<unknown>(
      {
        ...request,
        // Identity/inventory reads do not establish that a mutation was sent.
        observer: ["GET", "HEAD", "OPTIONS"].includes(method)
          ? undefined
          : request.observer,
      },
      {
        endpoint,
        options: { cache: "no-store", ...options },
        currentTabTransport: "disabled",
      },
      false,
    )
  } catch (error) {
    if (error instanceof ApiError && error.statusCode === 401)
      throw new ApiError(
        "PM-API session expired",
        401,
        endpoint,
        API_ERROR_CODES.HTTP_401,
      )
    throw error
  }
  if (!isRecord(body) || typeof body.success !== "boolean" || !("data" in body))
    return invalidPmApiResponse(endpoint)
  if (!body.success) {
    const message = typeof body.message === "string" ? body.message : ""
    throw new ApiError(
      message || "PM-API request failed",
      undefined,
      endpoint,
      API_ERROR_CODES.BUSINESS_ERROR,
    )
  }
  return { data: body.data, message: body.message, success: true }
}

/** Read a payload without reusing prior operation facts. */
export async function fetchPmApiData(
  request: ApiServiceRequest,
  endpoint: string,
  options: RequestInit = {},
): Promise<unknown> {
  return (await fetchPmApiEnvelope(request, endpoint, options)).data
}
