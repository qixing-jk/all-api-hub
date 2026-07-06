import { UI_CONSTANTS } from "~/constants/ui"
import { API_ERROR_CODES, ApiError } from "~/services/apiTransport/errors"

import { VOAPI_V2_PROTOCOL_CODES, type VoApiV2Envelope } from "./type"

class VoApiV2AuthExpiredError extends ApiError {}

export type VoApiV2EnvelopeOptions = {
  allowNullData?: boolean
  allowTopLevelToken?: boolean
}

const getEnvelopeMessage = (body: VoApiV2Envelope<unknown>): string =>
  (typeof body.msg === "string" && body.msg.trim()) ||
  (typeof body.message === "string" && body.message.trim()) ||
  "VoAPI v2 request failed"

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value)

const isAuthExpiredEnvelope = (body: VoApiV2Envelope<unknown>): boolean =>
  body.code === VOAPI_V2_PROTOCOL_CODES.AuthExpired &&
  /auth\s*expire|unauthorized|token|jwt|login/i.test(getEnvelopeMessage(body))

/**
 * Unwraps VoAPI v2 business envelopes and converts backend failures into ApiError.
 */
export function parseVoApiV2Envelope<TData>(
  value: unknown,
  endpoint: string,
  options: VoApiV2EnvelopeOptions = {},
): TData {
  if (!isRecord(value) || typeof value.code !== "number") {
    throw new ApiError(
      "Invalid VoAPI v2 response",
      undefined,
      endpoint,
      API_ERROR_CODES.JSON_PARSE_ERROR,
    )
  }

  const body = value as VoApiV2Envelope<TData>
  if (body.code !== VOAPI_V2_PROTOCOL_CODES.Success) {
    const message = getEnvelopeMessage(body)
    const ErrorClass = isAuthExpiredEnvelope(body)
      ? VoApiV2AuthExpiredError
      : ApiError

    throw new ErrorClass(
      message,
      undefined,
      endpoint,
      API_ERROR_CODES.BUSINESS_ERROR,
    )
  }

  if (options.allowTopLevelToken && typeof body.token === "string") {
    return body.token as TData
  }

  if (body.data === null && options.allowNullData) {
    return null as TData
  }

  if (body.data === undefined || body.data === null) {
    throw new ApiError(
      "Missing VoAPI v2 response data",
      undefined,
      endpoint,
      API_ERROR_CODES.JSON_PARSE_ERROR,
    )
  }

  return body.data
}

export const isVoApiV2AuthExpiredError = (
  error: unknown,
): error is VoApiV2AuthExpiredError => error instanceof VoApiV2AuthExpiredError

const toFiniteNumber = (value: unknown): number => {
  if (typeof value === "number" && Number.isFinite(value)) return value
  if (typeof value !== "string") return 0

  const parsed = Number.parseFloat(value.trim())
  return Number.isFinite(parsed) ? parsed : 0
}

export const amountToQuota = (amount: unknown): number => {
  const parsed = toFiniteNumber(amount)
  if (parsed <= 0) return 0

  return Math.round(parsed * UI_CONSTANTS.EXCHANGE_RATE.CONVERSION_FACTOR)
}

export const quotaToAmountString = (quota: unknown): string => {
  const parsed = typeof quota === "number" && Number.isFinite(quota) ? quota : 0
  if (parsed <= 0) return "0"

  const amount = parsed / UI_CONSTANTS.EXCHANGE_RATE.CONVERSION_FACTOR
  return Number(amount.toFixed(6)).toString()
}
