import type {
  ApiResponseErrorDecoder,
  ApiTransportResponse,
  DecodedApiResponseError,
} from "~/services/apiTransport/type"
import { getErrorMessage } from "~/utils/core/error"

const KNOWN_LEGACY_BACKEND_ERROR_TYPES = new Set(["new_api_error"])

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value)

const readMessage = (value: unknown): string | undefined =>
  typeof value === "string" && value.trim() ? value.trim() : undefined

/** Keeps only bounded scalar provider codes suitable for shared errors. */
export const readSafeUpstreamCode = (value: unknown): string | undefined => {
  if (typeof value !== "string" && typeof value !== "number") return undefined
  const code = String(value).trim()
  return code.length <= 64 && /^[A-Za-z0-9_.-]+$/.test(code) ? code : undefined
}

const isLegacyBusinessEnvelope = (body: Record<string, unknown>): boolean => {
  const code = body.code
  return (
    body.success === false ||
    (typeof code === "number" && code !== 0) ||
    (typeof code === "string" && code.trim() !== "" && code.trim() !== "0")
  )
}

/**
 * Preserves the historical fetchApi/fetchApiData response behavior while
 * provider modules migrate to explicit decoders. Remove this compatibility
 * decoder once remaining callers either provide a provider decoder or consume
 * the raw transport response.
 */
const decodeLegacyCompatibilityResponseError: ApiResponseErrorDecoder = (
  response,
) => {
  if (!isRecord(response.body)) return null
  const body = response.body
  const topLevelMessage = readMessage(body.message) ?? readMessage(body.msg)
  if (topLevelMessage) {
    const upstreamCode = readSafeUpstreamCode(body.code)
    return {
      kind: isLegacyBusinessEnvelope(body) ? "business" : "http",
      message: topLevelMessage,
      ...(upstreamCode ? { upstreamCode } : {}),
    }
  }

  if (!isRecord(body.error)) return null
  const message = readMessage(body.error.message)
  if (!message) return null

  const type = readMessage(body.error.type)
  const upstreamCode = readSafeUpstreamCode(body.error.code)
  return {
    kind:
      type && KNOWN_LEGACY_BACKEND_ERROR_TYPES.has(type) ? "business" : "http",
    message,
    ...(upstreamCode ? { upstreamCode } : {}),
  }
}

/** Applies provider priority, then legacy message fallback, without disclosure policy. */
export function resolveResponseErrorDetails(
  response: ApiTransportResponse<unknown>,
  endpoint: string,
  providerDecoder?: ApiResponseErrorDecoder,
): DecodedApiResponseError | null {
  const providerDetails = providerDecoder?.(response, { endpoint }) ?? null
  if (!providerDetails) {
    return decodeLegacyCompatibilityResponseError(response, { endpoint })
  }

  const providerMessage = getErrorMessage(providerDetails.message)
  const message = providerMessage
    ? providerMessage
    : getErrorMessage(
        decodeLegacyCompatibilityResponseError(response, { endpoint })?.message,
      )
  return {
    kind: providerDetails.kind,
    ...(message ? { message } : {}),
    ...(providerDetails.upstreamCode
      ? { upstreamCode: providerDetails.upstreamCode }
      : {}),
  }
}
