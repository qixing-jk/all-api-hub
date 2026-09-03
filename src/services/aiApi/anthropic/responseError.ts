import { readSafeUpstreamCode } from "~/services/apiTransport/responseError"
import type { ApiResponseErrorDecoder } from "~/services/apiTransport/type"

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value)

/**
 * Decodes Anthropic's documented non-2xx error envelope without applying
 * disclosure policy.
 * https://docs.anthropic.com/en/api/errors
 */
export const decodeAnthropicResponseError: ApiResponseErrorDecoder = (
  response,
) => {
  if (response.ok || !isRecord(response.body)) return null
  if (response.body.type !== "error" || !isRecord(response.body.error)) {
    return null
  }

  const error = response.body.error
  const type = typeof error.type === "string" ? error.type.trim() : ""
  const message = typeof error.message === "string" ? error.message.trim() : ""
  if (!type || !message) return null

  const upstreamCode = readSafeUpstreamCode(type)
  return {
    kind: "http",
    message,
    ...(upstreamCode ? { upstreamCode } : {}),
  }
}
