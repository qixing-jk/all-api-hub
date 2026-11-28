import { API_ERROR_CODES, ApiError } from "~/services/apiTransport/errors"

/** Each self-hosted installation owns its console, Cookie session and /v1 endpoint. */
export function getPmplanOrigin(baseUrl: string): string {
  try {
    const url = new URL(baseUrl)
    if (
      ["https:", "http:"].includes(url.protocol) &&
      !url.username &&
      !url.password
    )
      return url.origin
  } catch {
    // Invalid addresses must fail before reading or sending credentials.
  }
  throw new ApiError(
    "Invalid PM-Plan deployment URL",
    undefined,
    undefined,
    API_ERROR_CODES.FEATURE_UNSUPPORTED,
  )
}
