import { readSafeUpstreamCode } from "~/services/apiTransport/responseError"
import type { ApiResponseErrorDecoder } from "~/services/apiTransport/type"
import { getErrorMessage } from "~/utils/core/error"

import { VOAPI_V2_PROTOCOL_CODES } from "./type"

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value)

/** Reads only message fields from a verified VoAPI v2 envelope. */
export const readVoApiV2EnvelopeMessage = (
  body: unknown,
): string | undefined => {
  if (!isRecord(body)) return undefined

  const msg = typeof body.msg === "string" ? body.msg.trim() : undefined
  const message =
    typeof body.message === "string" ? body.message.trim() : undefined
  return getErrorMessage(msg, message) || undefined
}

/**
 * Decodes VoAPI v2 HTTP failures without applying disclosure policy.
 * The deployed official client consumes a numeric `code` envelope with
 * `msg`/`message`; code 0 is success and remains owned by the 2xx parser.
 * https://demo.voapi.top/assets/invite-CM31Bfbx.js
 */
export const decodeVoApiV2ResponseError: ApiResponseErrorDecoder = (
  response,
) => {
  if (response.ok) return null

  const body = isRecord(response.body) ? response.body : undefined
  const upstreamCode =
    typeof body?.code === "number" &&
    body.code !== VOAPI_V2_PROTOCOL_CODES.Success
      ? readSafeUpstreamCode(body.code)
      : undefined
  const providerMessage = upstreamCode
    ? readVoApiV2EnvelopeMessage(body)
    : undefined

  return {
    kind: providerMessage ? "business" : "http",
    message: getErrorMessage(
      providerMessage,
      `VoAPI v2 request failed: ${response.status}`,
    ),
    ...(providerMessage && upstreamCode ? { upstreamCode } : {}),
  }
}
