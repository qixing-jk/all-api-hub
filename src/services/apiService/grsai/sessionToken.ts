/**
 * Reads the console session token without acting on it.
 *
 * The token is an HS256 JWT whose payload carries `exp` (about 30 days from
 * issuance; every `getConfig` exchange restamps it). Everything here is
 * read-only and total: a token this module cannot parse must never be reported
 * as dead, because only the console can say whether it still authenticates.
 */

/** Shape of the 32-character token the console's user-info page displays. */
const OPEN_API_TOKEN_PATTERN = /^[0-9a-f]{32}$/i

const readPayload = (token: string): Record<string, unknown> | null => {
  const segments = token.trim().split(".")
  if (segments.length !== 3) return null

  try {
    const decoded = atob(segments[1]!.replace(/-/g, "+").replace(/_/g, "/"))
    const payload: unknown = JSON.parse(decoded)
    return payload && typeof payload === "object" && !Array.isArray(payload)
      ? (payload as Record<string, unknown>)
      : null
  } catch {
    return null
  }
}

/** Expiry of the session token in epoch milliseconds, when it is readable. */
export function readGrsaiSessionTokenExpiry(token: string): number | undefined {
  const exp = readPayload(token)?.exp
  return typeof exp === "number" && Number.isFinite(exp)
    ? exp * 1000
    : undefined
}

/** Whether the token's own expiry has passed, per its stamp and a local clock. */
export function isGrsaiSessionTokenExpired(
  token: string,
  now: number = Date.now(),
): boolean {
  const expiresAt = readGrsaiSessionTokenExpiry(token)
  return expiresAt !== undefined && expiresAt <= now
}

/**
 * Whether the value is the account token the console's user-info page shows
 * for "platform open APIs".
 *
 * Saving that token as the account credential is a natural mistake — the console
 * labels it as an API credential — but neither the console API nor the
 * documented open endpoints accept it. It is recognized here only to explain the
 * failure, never to accept it.
 */
export function looksLikeGrsaiOpenApiToken(token: string): boolean {
  return OPEN_API_TOKEN_PATTERN.test(token.trim())
}
