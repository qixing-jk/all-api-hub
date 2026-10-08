import { DEFAULT_USD_TO_CNY_RATE, QUOTA_PER_USD } from "~/constants/money"
import {
  isAccountSiteType,
  SITE_TYPES,
  type AccountSiteType,
} from "~/constants/siteType"
import {
  getAccountSiteProductProfile,
  isAccountAuthTypeAllowed,
} from "~/services/accounts/accountSiteProfile"
import { AuthTypeEnum } from "~/types"

/** Converts a non-negative manual USD balance to quota units. */
export function parseManualQuotaFromUsd(
  value: string | undefined,
): number | undefined {
  if (value === undefined) return undefined
  const trimmed = value.trim()
  if (!trimmed) return undefined

  const amount = Number(trimmed)
  if (!Number.isFinite(amount) || amount < 0) return undefined

  return Math.round(amount * QUOTA_PER_USD)
}

/** Checks the account form's required fields against the selected site profile. */
export function isValidAccount({
  siteName,
  username,
  userId,
  siteType,
  authType,
  accessToken,
  cookieAuthSessionCookie,
  exchangeRate,
}: {
  siteName: string
  username: string
  userId: string
  siteType?: AccountSiteType
  authType: AuthTypeEnum
  accessToken: string
  cookieAuthSessionCookie?: string
  exchangeRate: string
}) {
  const normalizedSiteType = isAccountSiteType(siteType)
    ? siteType
    : SITE_TYPES.UNKNOWN
  const profile = getAccountSiteProductProfile(normalizedSiteType)

  return (
    !!siteName.trim() &&
    (authType === AuthTypeEnum.None ||
      isAccountAuthTypeAllowed(normalizedSiteType, authType)) &&
    (!profile.identity.usernameRequired || !!username.trim()) &&
    (!profile.identity.userIdRequired || !!userId.trim()) &&
    isValidExchangeRate(exchangeRate) &&
    (authType !== AuthTypeEnum.AccessToken || !!accessToken.trim()) &&
    (authType !== AuthTypeEnum.Cookie || !!cookieAuthSessionCookie?.trim())
  )
}

/** Parses a positive exchange rate, returning undefined for invalid input. */
function parsePositiveExchangeRate(input: string): number | undefined {
  const trimmed = input.trim()
  if (!trimmed) return undefined

  const value = Number(trimmed)
  if (!Number.isFinite(value) || value <= 0) {
    return undefined
  }

  return value
}

/** Resolves an invalid or empty exchange rate to the product default. */
export function resolveExchangeRate(input: string): number {
  return parsePositiveExchangeRate(input) ?? DEFAULT_USD_TO_CNY_RATE
}

/** Checks whether the supplied exchange rate is a positive finite number. */
export function isValidExchangeRate(rate: string): boolean {
  return parsePositiveExchangeRate(rate) !== undefined
}
