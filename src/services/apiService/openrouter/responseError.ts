import { readSafeUpstreamCode } from "~/services/apiTransport/responseError"
import type { ApiResponseErrorDecoder } from "~/services/apiTransport/type"

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value)

/** Reads the documented nested OpenRouter error without applying disclosure policy. */
function readOpenRouterErrorDetails(
  body: unknown,
): { message: string; upstreamCode?: string } | null {
  if (!isRecord(body) || !isRecord(body.error)) return null
  const error = body.error
  const message =
    typeof error.message === "string" && error.message.trim()
      ? error.message.trim()
      : undefined
  const upstreamCode = Number.isInteger(error.code)
    ? readSafeUpstreamCode(error.code)
    : undefined
  if (!message) return null

  return {
    message,
    ...(upstreamCode ? { upstreamCode } : {}),
  }
}

/**
 * Decodes OpenRouter's documented non-2xx `{ error: { code, message } }` body.
 * https://github.com/OpenRouterTeam/docs/blob/d369fe0d5bfc87cb9f78326b18bbbd19964406fd/openapi/openapi.yaml#L25293-L25332
 */
export const decodeOpenRouterResponseError: ApiResponseErrorDecoder = (
  response,
) => {
  if (response.ok) return null
  const details = readOpenRouterErrorDetails(response.body)
  if (!details) return null

  return {
    kind: "http",
    ...details,
  }
}
