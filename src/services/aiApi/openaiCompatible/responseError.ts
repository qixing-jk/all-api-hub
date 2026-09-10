import { readSafeUpstreamCode } from "~/services/apiTransport/responseError"
import type { ApiResponseErrorDecoder } from "~/services/apiTransport/type"

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value)

/**
 * Decodes OpenAI's documented non-2xx `{ error: { type, code, message } }`
 * response without applying disclosure policy.
 * https://platform.openai.com/docs/guides/error-codes/api-errors
 */
export const decodeOpenAICompatibleResponseError: ApiResponseErrorDecoder = (
  response,
) => {
  if (response.ok || !isRecord(response.body)) return null

  const error = response.body.error
  if (!isRecord(error)) return null

  const type = typeof error.type === "string" ? error.type.trim() : ""
  const message = typeof error.message === "string" ? error.message.trim() : ""
  if (!type || !message) return null

  const upstreamCode = readSafeUpstreamCode(error.code)
  return {
    kind: "http",
    message,
    ...(upstreamCode ? { upstreamCode } : {}),
  }
}
