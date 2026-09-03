import { readSafeUpstreamCode } from "~/services/apiTransport/responseError"
import type {
  ApiResponseErrorDecoder,
  DecodedApiResponseError,
} from "~/services/apiTransport/type"

const NEW_API_ERROR_TYPE = "new_api_error"

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value)

const readMessage = (value: unknown): string | undefined =>
  typeof value === "string" && value.trim() ? value.trim() : undefined

const isFailedBusinessEnvelope = (body: Record<string, unknown>): boolean => {
  if (body.success === false) return true
  const code = body.code
  return (
    (typeof code === "number" && code !== 0) ||
    (typeof code === "string" && code.trim() !== "" && code.trim() !== "0")
  )
}

/**
 * Interprets New API's `{ success, message }` and nested `new_api_error`
 * envelopes before transport fallback.
 * https://github.com/QuantumNous/new-api/blob/9df450fe54e1a874a5339b7c38a61014217f02c3/common/gin.go
 * https://github.com/QuantumNous/new-api/blob/9df450fe54e1a874a5339b7c38a61014217f02c3/middleware/utils.go
 */
export const decodeNewApiResponseError: ApiResponseErrorDecoder = (
  response,
) => {
  if (!isRecord(response.body)) return null

  const body = response.body
  const message = readMessage(body.message)
  const upstreamCode = readSafeUpstreamCode(body.code)
  if (isFailedBusinessEnvelope(body)) {
    return {
      kind: "business",
      ...(message ? { message } : {}),
      ...(upstreamCode ? { upstreamCode } : {}),
    }
  }
  if (message) {
    return { kind: "http", message }
  }

  if (!isRecord(body.error)) return null
  const error = body.error
  if (readMessage(error.type) !== NEW_API_ERROR_TYPE) return null

  const nestedMessage = readMessage(error.message)
  const nestedUpstreamCode = readSafeUpstreamCode(error.code)
  return {
    kind: "business",
    ...(nestedMessage ? { message: nestedMessage } : {}),
    ...(nestedUpstreamCode ? { upstreamCode: nestedUpstreamCode } : {}),
  } satisfies DecodedApiResponseError
}
