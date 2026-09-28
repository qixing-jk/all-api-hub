/**
 * Console session kept beside the access token.
 *
 * `refreshToken` is a long-lived secret and is included in account exports.
 * `organizationId` selects which org the BFF calls use. Verified 2026-09-29:
 * access JWTs last 900 seconds and refresh JWTs last 90 days.
 */
export type KimiOpenPlatformAuthConfig = {
  refreshToken: string
  organizationId: string
  tokenExpiresAt?: number
}

/** Keeps only a complete console session. Empty pieces are dropped. */
export function normalizeKimiOpenPlatformAuth(
  value: unknown,
): KimiOpenPlatformAuthConfig | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value))
    return undefined
  const record = value as Record<string, unknown>
  const refreshToken =
    typeof record.refreshToken === "string" ? record.refreshToken.trim() : ""
  const organizationId =
    typeof record.organizationId === "string"
      ? record.organizationId.trim()
      : ""
  if (!refreshToken || !organizationId) return undefined
  const tokenExpiresAt = record.tokenExpiresAt
  return {
    refreshToken,
    organizationId,
    ...(typeof tokenExpiresAt === "number" && Number.isFinite(tokenExpiresAt)
      ? { tokenExpiresAt }
      : {}),
  }
}

/** Reads the `exp` claim in milliseconds. Invalid tokens return undefined. */
export function readJwtExpiry(token: string): number | undefined {
  const payload = token.split(".")[1]
  if (!payload) return undefined
  try {
    const json = JSON.parse(
      atob(payload.replace(/-/g, "+").replace(/_/g, "/")),
    ) as { exp?: unknown }
    return typeof json.exp === "number" && Number.isFinite(json.exp)
      ? json.exp * 1000
      : undefined
  } catch {
    return undefined
  }
}

/** Reads the `sub` claim. The consoles use it as the account uid. */
export function readJwtSubject(token: string): string | undefined {
  const payload = token.split(".")[1]
  if (!payload) return undefined
  try {
    const json = JSON.parse(
      atob(payload.replace(/-/g, "+").replace(/_/g, "/")),
    ) as { sub?: unknown }
    return typeof json.sub === "string" && json.sub.trim()
      ? json.sub.trim()
      : undefined
  } catch {
    return undefined
  }
}
