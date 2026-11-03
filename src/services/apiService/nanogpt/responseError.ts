import type { ApiResponseErrorDecoder } from "~/services/apiTransport/type"
import { isRecord } from "~/utils/core/object"

/**
 * Decodes NanoGPT error bodies.
 *
 * The deployment uses three shapes (verified 2026-10-25, see evidence/probe-06,
 * probe-10 and evidence/management-openapi.json):
 * - `{ error: { code, message, request_id } }` for API and management routes
 * - `{ error: { message, type } }` when a credential is missing
 * - `{ error: "STEP_UP_REQUIRED", message }` for console mutations
 * - `{ error: <int>, message }` for the documented check-balance schema
 */
export const decodeNanoGptResponseError: ApiResponseErrorDecoder = (
  response,
) => {
  const body = response.body
  if (!isRecord(body) || !Object.hasOwn(body, "error")) return null

  const message =
    typeof body.message === "string" && body.message.trim()
      ? body.message.trim()
      : undefined

  if (typeof body.error === "string" && body.error.trim()) {
    return {
      kind: "http",
      message: message ?? body.error.trim(),
      upstreamCode: body.error.trim(),
    }
  }

  if (typeof body.error === "number") {
    return message ? { kind: "http", message } : null
  }

  if (isRecord(body.error)) {
    const errorMessage =
      typeof body.error.message === "string" && body.error.message.trim()
        ? body.error.message.trim()
        : undefined
    const upstreamCode =
      typeof body.error.type === "string" && body.error.type.trim()
        ? body.error.type.trim()
        : typeof body.error.code === "string" && body.error.code.trim()
          ? body.error.code.trim()
          : undefined
    const resolvedMessage = errorMessage ?? message
    if (!resolvedMessage && !upstreamCode) return null
    return {
      kind: "http",
      message: resolvedMessage ?? String(upstreamCode),
      ...(upstreamCode ? { upstreamCode } : {}),
    }
  }

  return message ? { kind: "http", message } : null
}
