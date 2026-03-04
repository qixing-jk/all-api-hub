import type { SiteAccount, Sub2ApiAuthConfig } from "~/types"

const normalizeRefreshToken = (value: unknown): string | null => {
  if (typeof value !== "string") return null
  const trimmed = value.trim()
  return trimmed ? trimmed : null
}

const normalizeTokenExpiresAt = (value: unknown): number | undefined => {
  if (typeof value === "number" && Number.isFinite(value) && value > 0) {
    return value
  }
  if (typeof value === "string") {
    const parsed = Number.parseInt(value.trim(), 10)
    if (Number.isFinite(parsed) && parsed > 0) {
      return parsed
    }
  }
  return undefined
}

const sanitizeSub2ApiAuth = (value: unknown): Sub2ApiAuthConfig | undefined => {
  if (!value || typeof value !== "object") return undefined
  const raw = value as Partial<Record<keyof Sub2ApiAuthConfig, unknown>>
  const refreshToken = normalizeRefreshToken(raw.refreshToken)
  if (!refreshToken) return undefined

  const tokenExpiresAt = normalizeTokenExpiresAt(raw.tokenExpiresAt)
  return tokenExpiresAt ? { refreshToken, tokenExpiresAt } : { refreshToken }
}

/**
 * Migrate/sanitize the persisted {@link SiteAccount.sub2apiAuth} config.
 *
 * - Sub2API refresh tokens are optional and should only exist on `site_type = "sub2api"` accounts.
 * - Empty/invalid refresh tokens must be dropped to avoid persisting unusable secrets.
 * - tokenExpiresAt is optional and normalized to a positive finite integer when present.
 */
export function migrateSub2ApiAuthConfig(account: SiteAccount): SiteAccount {
  if (account.site_type !== "sub2api") {
    return {
      ...account,
      sub2apiAuth: undefined,
    }
  }

  return {
    ...account,
    sub2apiAuth: sanitizeSub2ApiAuth(account.sub2apiAuth),
  }
}
