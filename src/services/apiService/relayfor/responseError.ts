import type { ApiResponseErrorDecoder } from "~/services/apiTransport/type"

/**
 * Decodes RelayFor error responses.
 *
 * RelayFor returns either:
 * - `{ error: { message: string, type?: string } }`
 * - `{ error: string }`
 * - `{ message: string }`
 */
export const decodeRelayForResponseError: ApiResponseErrorDecoder = (
  response,
) => {
  if (
    !response.body ||
    typeof response.body !== "object" ||
    Array.isArray(response.body)
  ) {
    return null
  }
  const body = response.body as Record<string, unknown>
  let message: string | undefined
  let upstreamCode: string | undefined

  if (typeof body.error === "string" && body.error.trim()) {
    message = body.error.trim()
  } else if (
    body.error &&
    typeof body.error === "object" &&
    !Array.isArray(body.error)
  ) {
    const errorObj = body.error as Record<string, unknown>
    if (typeof errorObj.type === "string") upstreamCode = errorObj.type
    if (typeof errorObj.message === "string" && errorObj.message.trim()) {
      message = errorObj.message.trim()
    }
  } else if (typeof body.message === "string" && body.message.trim()) {
    message = body.message.trim()
  }

  if (message || upstreamCode) {
    return {
      kind: "http",
      message: message ?? String(upstreamCode),
      upstreamCode,
    }
  }
  return null
}
