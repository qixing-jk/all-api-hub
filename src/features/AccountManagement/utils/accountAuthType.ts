import { resolveAccountSiteDefaultAuthType } from "~/services/accounts/accountSiteProfile"
import { AuthTypeEnum } from "~/types"

const AUTH_TYPE_VALUES = new Set<string>(Object.values(AuthTypeEnum))

interface AccountAuthDefaultInput {
  siteType?: string | null
  siteUrl?: string | null
}

/**
 * Resolves the locally known default auth mode for account add flows.
 * `siteUrl` is accepted so future domain-backed rules can share this boundary.
 */
export function resolveDefaultAccountAuthType({
  siteType,
  siteUrl,
}: AccountAuthDefaultInput = {}): AuthTypeEnum {
  return resolveAccountSiteDefaultAuthType({ siteType, url: siteUrl })
}

/**
 * Normalizes externally supplied optional auth values: blank means omitted,
 * unknown non-blank values are invalid.
 */
export function normalizeOptionalAccountAuthType(
  value: unknown,
): AuthTypeEnum | undefined | false {
  if (value === undefined) return undefined
  if (typeof value === "string" && value.trim() === "") return undefined

  return isAccountAuthType(value) ? value : false
}

/** Keeps account form state from inheriting blank or malformed auth values. */
export function normalizeAccountAuthTypeOrDefault(
  value: unknown,
  fallback = AuthTypeEnum.AccessToken,
): AuthTypeEnum {
  return isAccountAuthType(value) ? value : fallback
}

/** Checks whether a value maps to a supported account auth mode. */
export function isAccountAuthType(value: unknown): value is AuthTypeEnum {
  return typeof value === "string" && AUTH_TYPE_VALUES.has(value)
}
