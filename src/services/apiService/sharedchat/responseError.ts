import type { ApiResponseErrorDecoder } from "~/services/apiTransport/type"
import { getErrorMessage } from "~/utils/core/error"

const SHAREDCHAT_SUCCESS_CODE = 1

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value)

/**
 * Decodes the deployed SharedChat frontend envelope without applying disclosure policy.
 * Verified routes return `{ code, msg, data }`, with `code === 1` as success.
 * https://new.sharedchat.cc/frontend-api/vibe-code/quota
 */
export const decodeSharedChatResponseError: ApiResponseErrorDecoder = (
  response,
) => {
  if (response.ok) return null

  const body = isRecord(response.body) ? response.body : undefined
  const providerMessage =
    typeof body?.code === "number" &&
    body.code !== SHAREDCHAT_SUCCESS_CODE &&
    typeof body.msg === "string"
      ? body.msg.trim()
      : undefined

  return {
    kind: "http",
    message: getErrorMessage(
      providerMessage,
      `SharedChat request failed: ${response.status}`,
    ),
  }
}
