import type {
  ApiResponseErrorDecoder,
  ApiTransportResponse,
  DecodedApiResponseError,
} from "~/services/apiTransport/type"
import { getErrorMessage } from "~/utils/core/error"

/** Keeps only bounded scalar provider codes suitable for shared errors. */
export const readSafeUpstreamCode = (value: unknown): string | undefined => {
  if (typeof value !== "string" && typeof value !== "number") return undefined
  const code = String(value).trim()
  return code.length <= 64 && /^[A-Za-z0-9_.-]+$/.test(code) ? code : undefined
}

/** Applies only the selected provider decoder, without disclosure policy. */
export function resolveResponseErrorDetails(
  response: ApiTransportResponse<unknown>,
  endpoint: string,
  providerDecoder?: ApiResponseErrorDecoder,
): DecodedApiResponseError | null {
  const providerDetails = providerDecoder?.(response, { endpoint }) ?? null
  if (!providerDetails) return null

  const message = getErrorMessage(providerDetails.message)
  return {
    kind: providerDetails.kind,
    ...(message ? { message } : {}),
    ...(providerDetails.upstreamCode
      ? { upstreamCode: providerDetails.upstreamCode }
      : {}),
  }
}
