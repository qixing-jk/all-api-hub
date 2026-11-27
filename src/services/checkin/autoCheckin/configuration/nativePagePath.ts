import { isAccountSiteType } from "~/constants/siteType"
import { normalizeAccountIdentity } from "~/services/accounts/identity/accountIdentity"
import type { SiteAccount } from "~/types"
import type { CheckInConfig } from "~/types/checkIn"
import { tryParseHttpUrl } from "~/utils/core/urlParsing"

/**
 * Validate a user-owned check-in page path. Unlike API routes, page navigation
 * may need query parameters or a hash router. Full URLs and normalized dot
 * segments are rejected so the destination stays on the account's origin.
 */
export function normalizeCheckInPagePath(value: unknown): string | null {
  if (
    typeof value !== "string" ||
    value.length > 1000 ||
    !value.startsWith("/") ||
    value.startsWith("//") ||
    /[\\\s<>"`\p{Cc}]/u.test(value)
  )
    return null
  try {
    const parsed = new URL(value, "https://page.invalid")
    return parsed.origin === "https://page.invalid" &&
      parsed.pathname === value.split(/[?#]/, 1)[0]
      ? value
      : null
  } catch {
    return null
  }
}

/** Strict storage decoding; no cached credential or browser identity is retained. */
export function normalizeNativeCheckInPageHint(
  value: unknown,
): CheckInConfig["nativePageHint"] {
  if (!value || typeof value !== "object" || Array.isArray(value))
    return undefined
  const raw = value as Record<string, unknown>
  const path = normalizeCheckInPagePath(raw.path)
  const origin =
    typeof raw.origin === "string"
      ? tryParseHttpUrl(raw.origin)?.origin
      : undefined
  const userId = normalizeAccountIdentity(raw.userId)
  const configuredPath =
    raw.configuredPath === undefined
      ? undefined
      : normalizeCheckInPagePath(raw.configuredPath)
  if (
    !path ||
    !origin ||
    raw.origin !== origin ||
    !userId ||
    !isAccountSiteType(raw.siteType) ||
    configuredPath === null ||
    typeof raw.observedAt !== "number" ||
    !Number.isFinite(raw.observedAt) ||
    raw.observedAt < 0
  )
    return undefined
  return {
    path,
    origin,
    userId,
    siteType: raw.siteType,
    observedAt: raw.observedAt,
    ...(configuredPath ? { configuredPath } : {}),
  }
}

/** Imported or stale hints remain unusable outside their account, deployment and manual destination. */
export function readNativeCheckInPageHint(
  account: SiteAccount,
): string | undefined {
  const hint = normalizeNativeCheckInPageHint(account.checkIn.nativePageHint)
  return hint &&
    hint.origin === tryParseHttpUrl(account.site_url)?.origin &&
    hint.siteType === account.site_type &&
    hint.userId === normalizeAccountIdentity(account.account_info.id) &&
    hint.configuredPath ===
      (normalizeCheckInPagePath(account.checkIn.nativePagePath) ?? undefined)
    ? hint.path
    : undefined
}
