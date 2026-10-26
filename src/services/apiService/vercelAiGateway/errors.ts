import { API_ERROR_CODES, ApiError } from "~/services/apiTransport/errors"
import { readSafeUpstreamCode } from "~/services/apiTransport/responseError"
import type {
  ApiResponseErrorDecoder,
  ApiTransportResponse,
} from "~/services/apiTransport/type"
import { isRecord } from "~/utils/core/object"

/**
 * Reads both documented error envelopes without applying disclosure policy:
 * `api.vercel.com` answers `{error:{code,message}}`, while
 * `ai-gateway.vercel.sh` answers `{error:{message,type}}`. Verified 2026-10-24.
 */
function readVercelErrorDetails(
  body: unknown,
): { message: string; upstreamCode?: string } | null {
  if (!isRecord(body) || !isRecord(body.error)) return null
  const error = body.error
  const message =
    typeof error.message === "string" && error.message.trim()
      ? error.message.trim()
      : undefined
  if (!message) return null
  const upstreamCode = readSafeUpstreamCode(error.code ?? error.type)
  return { message, ...(upstreamCode ? { upstreamCode } : {}) }
}

export const decodeVercelResponseError: ApiResponseErrorDecoder = (
  response,
) => {
  if (response.ok) return null
  const details = readVercelErrorDetails(response.body)
  if (!details) return null
  return { kind: "http", ...details }
}

const vercelHttpErrorCode = (status: number) => {
  if (status === 401) return API_ERROR_CODES.HTTP_401
  if (status === 403) return API_ERROR_CODES.HTTP_403
  if (status === 429) return API_ERROR_CODES.HTTP_429
  return API_ERROR_CODES.HTTP_OTHER
}

/** Converts one parsed Vercel failure into a transport error. */
export function createVercelHttpError(
  response: ApiTransportResponse<unknown>,
  endpoint: string,
  fallbackMessage: string,
): ApiError {
  const details = decodeVercelResponseError(response, { endpoint })
  return new ApiError(
    details?.message ?? fallbackMessage,
    response.status,
    endpoint,
    vercelHttpErrorCode(response.status),
    details?.upstreamCode,
  )
}

/** The deployment does not expose a team the extension can manage keys for. */
export class VercelTeamRequiredError extends Error {
  constructor() {
    super("vercel_team_required")
    this.name = "VercelTeamRequiredError"
  }
}
