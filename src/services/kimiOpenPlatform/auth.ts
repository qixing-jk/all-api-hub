/**
 * Console session kept beside the access token.
 *
 * `refreshToken` is a long-lived secret and is included in account exports.
 * `organizationId` selects which org the BFF calls use. Verified 2026-09-29:
 * access JWTs last 900 seconds and refresh JWTs last 90 days.
 */
import type { KimiOpenPlatformAuthConfig } from "~/types"

export type { KimiOpenPlatformAuthConfig } from "~/types"

/** Projects a mutable console session into the exportable account fields. */
export function getKimiOpenPlatformAuthConfig(
  state: KimiOpenPlatformAuthConfig,
): KimiOpenPlatformAuthConfig {
  return {
    refreshToken: state.refreshToken,
    organizationId: state.organizationId,
    ...(state.tokenExpiresAt !== undefined
      ? { tokenExpiresAt: state.tokenExpiresAt }
      : {}),
  }
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

/** Decodes claims for local hints only; authenticated userInfo verifies identity. */
function readJwtClaims(token: string): Record<string, unknown> | undefined {
  const payload = token.split(".")[1]
  if (!payload) return undefined
  try {
    const json: unknown = JSON.parse(
      atob(payload.replace(/-/g, "+").replace(/_/g, "/")),
    )
    return json && typeof json === "object" && !Array.isArray(json)
      ? (json as Record<string, unknown>)
      : undefined
  } catch {
    return undefined
  }
}

/** Reads the `exp` claim in milliseconds. Invalid tokens return undefined. */
export function readJwtExpiry(token: string): number | undefined {
  const exp = readJwtClaims(token)?.exp
  return typeof exp === "number" && Number.isFinite(exp)
    ? exp * 1000
    : undefined
}

/** Reads the `sub` claim. The consoles use it as the account uid. */
export function readJwtSubject(token: string): string | undefined {
  const sub = readJwtClaims(token)?.sub
  return typeof sub === "string" && sub.trim() ? sub.trim() : undefined
}
