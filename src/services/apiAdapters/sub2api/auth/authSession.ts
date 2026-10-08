import type { Sub2ApiAuthConfig } from "~/types"

/** Browser sessions can contain finite expired timestamps; persistence admits positive ones only. */
export function normalizeSub2ApiAuth(
  value: unknown,
): Sub2ApiAuthConfig | undefined {
  if (!value || typeof value !== "object") return undefined
  const candidate = value as {
    refreshToken?: unknown
    tokenExpiresAt?: unknown
  }
  const refreshToken =
    typeof candidate.refreshToken === "string"
      ? candidate.refreshToken.trim()
      : ""
  if (!refreshToken) return undefined
  const tokenExpiresAt = candidate.tokenExpiresAt
  return {
    refreshToken,
    ...(typeof tokenExpiresAt === "number" && Number.isFinite(tokenExpiresAt)
      ? { tokenExpiresAt }
      : {}),
  }
}
