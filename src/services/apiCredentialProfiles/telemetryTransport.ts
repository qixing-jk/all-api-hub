import { TelemetryEndpointError } from "~/services/apiCredentialProfiles/telemetryAttempts"
import { ApiError } from "~/services/apiTransport/errors"
import { fetchApi } from "~/services/apiTransport/request"
import type { ApiAuthTokenMode } from "~/services/apiTransport/type"
import { AuthTypeEnum } from "~/types"
import { getErrorMessage } from "~/utils/core/error"

type TelemetryJsonFetchResult = {
  endpoint: string
  json: unknown
}

/**
 * Bounds each telemetry request so a stalled provider endpoint cannot hang
 * the whole refresh flow; telemetry is best-effort and retried on the next
 * scheduled refresh.
 */
const TELEMETRY_REQUEST_TIMEOUT_MS = 10_000

/** Fetches one read-only telemetry endpoint and normalizes transport failures. */
export async function fetchTelemetryJson(params: {
  baseUrl: string
  endpoint: string
  bearerToken?: string
  authTokenMode?: ApiAuthTokenMode
}): Promise<TelemetryJsonFetchResult> {
  try {
    const json = await fetchApi<unknown>(
      {
        baseUrl: params.baseUrl,
        auth: {
          authType: params.bearerToken
            ? AuthTypeEnum.AccessToken
            : AuthTypeEnum.None,
          accessToken: params.bearerToken,
        },
        requestTimeoutMs: TELEMETRY_REQUEST_TIMEOUT_MS,
      },
      {
        endpoint: params.endpoint,
        options: {
          method: "GET",
          headers: {
            Accept: "application/json",
          },
        },
        ...(params.authTokenMode
          ? { authTokenMode: params.authTokenMode }
          : {}),
      },
    )
    // Raw response mode: provider envelopes (success/data) stay intact so
    // envelope-style parsers such as parseGlmQuota see the full payload.

    return {
      endpoint: params.endpoint,
      json,
    }
  } catch (error) {
    if (error instanceof ApiError) {
      throw new TelemetryEndpointError(
        error.message,
        error.endpoint ?? params.endpoint,
        error.statusCode === 404 || error.statusCode === 405,
      )
    }

    if (error instanceof SyntaxError) {
      throw new TelemetryEndpointError("Non-JSON response", params.endpoint)
    }

    throw new TelemetryEndpointError(
      `Network request failed: ${getErrorMessage(error)}`,
      params.endpoint,
    )
  }
}
