import { readSafeUpstreamCode } from "~/services/apiTransport/responseError"
import type { ApiResponseErrorDecoder } from "~/services/apiTransport/type"

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value)

/**
 * Decodes Google's documented non-2xx REST `google.rpc.Status` envelope
 * without applying disclosure policy.
 * https://ai.google.dev/api/rest#rest-resource:-v1beta.status
 */
export const decodeGoogleResponseError: ApiResponseErrorDecoder = (
  response,
) => {
  if (response.ok || !isRecord(response.body)) return null

  const error = response.body.error
  if (!isRecord(error) || !Number.isInteger(error.code)) return null

  const message = typeof error.message === "string" ? error.message.trim() : ""
  if (!message) return null

  const upstreamCode =
    readSafeUpstreamCode(error.status) ?? readSafeUpstreamCode(error.code)
  return {
    kind: "http",
    message,
    ...(upstreamCode ? { upstreamCode } : {}),
  }
}
