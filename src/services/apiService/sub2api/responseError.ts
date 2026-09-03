import { readSafeUpstreamCode } from "~/services/apiTransport/responseError"
import type { ApiResponseErrorDecoder } from "~/services/apiTransport/type"
import { getErrorMessage } from "~/utils/core/error"

import { SUB2API_SESSION_BINDING_MISMATCH_CODE } from "./browserAuth"

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value)

type Sub2ApiFailureEnvelope = {
  message?: string
  upstreamCode: string
}

/** Reads only verified Sub2API failure envelopes and machine codes. */
export const readSub2ApiFailureEnvelope = (
  body: unknown,
): Sub2ApiFailureEnvelope | null => {
  if (!isRecord(body)) return null

  const isNumericFailure = typeof body.code === "number" && body.code !== 0
  const isSessionBindingMismatch =
    body.code === SUB2API_SESSION_BINDING_MISMATCH_CODE
  if (!isNumericFailure && !isSessionBindingMismatch) return null

  const upstreamCode = readSafeUpstreamCode(body.code)
  if (!upstreamCode) return null

  const message =
    typeof body.message === "string" ? body.message.trim() : undefined
  if (!message && !isSessionBindingMismatch) return null
  return { ...(message ? { message } : {}), upstreamCode }
}

/**
 * Decodes Sub2API HTTP failures without applying disclosure policy.
 * The standard provider contract uses numeric `code`, string `message`, and
 * `code === 0` for success. Session binding middleware has one documented
 * string-code exception that auth recovery must preserve. The existing 2xx
 * parser remains authoritative for business data.
 * https://github.com/Wei-Shaw/sub2api/blob/b1748c4ea99ce2120401a269142aa071e18a84da/backend/internal/pkg/response/response.go
 * https://github.com/Wei-Shaw/sub2api/blob/b1748c4ea99ce2120401a269142aa071e18a84da/backend/internal/server/middleware/session_binding.go
 */
export const decodeSub2ApiResponseError: ApiResponseErrorDecoder = (
  response,
) => {
  if (response.ok) return null

  const failure = readSub2ApiFailureEnvelope(response.body)
  return {
    kind: failure ? "business" : "http",
    message: getErrorMessage(
      failure?.message,
      `Sub2API request failed: ${response.status}`,
    ),
    ...(failure ? { upstreamCode: failure.upstreamCode } : {}),
  }
}
