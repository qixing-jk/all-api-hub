/**
 * Sub2API deals with JWT values stored in localStorage.
 *
 * To avoid accidentally leaking secrets into extension logs, prefer logging
 * error *messages* after passing them through these helpers, instead of logging
 * raw error objects that may contain request details.
 */

const JWT_PATTERN = /\beyJ[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+\b/g
const BEARER_PATTERN = /\bBearer\s+([a-zA-Z0-9._-]+)\b/gi

export const redactSecrets = (value: string): string =>
  value
    .replace(BEARER_PATTERN, "Bearer [REDACTED]")
    .replace(JWT_PATTERN, "[REDACTED_JWT]")

export const getSafeErrorMessage = (error: unknown): string => {
  const message =
    error instanceof Error
      ? error.message
      : typeof error === "string"
        ? error
        : String(error ?? "")

  return redactSecrets(message)
}
