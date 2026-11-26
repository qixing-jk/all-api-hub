import { DEFAULT_USD_TO_CNY_RATE, QUOTA_PER_USD } from "~/constants/money"
import {
  isAccountSiteType,
  SITE_TYPES,
  type AccountSiteType,
} from "~/constants/siteType"
import { isAccountLoginConfigured } from "~/services/accountLogin/configCodec"
import {
  getAccountSiteProductProfile,
  isAccountAuthTypeAllowed,
} from "~/services/accounts/accountSiteProfile"
import { parseDecimal } from "~/services/amounts/decimal"
import type { AccountLoginMethodDefinition } from "~/services/apiAdapters/contracts/accountLogin"
import { AuthTypeEnum } from "~/types"
import type { AccountLoginConfiguration } from "~/types/accountLogin"

/** Normalize the editor's existing non-negative number syntax before projection. */
export function normalizeManualBalanceUsd(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined
  const trimmed = value.trim()
  if (!trimmed) return undefined
  const amount = Number(trimmed)
  if (!Number.isFinite(amount) || amount < 0) return undefined
  if (/^0(?:x[0-9a-f]+|o[0-7]+|b[01]+)$/i.test(trimmed))
    return parseDecimal(String(BigInt(trimmed)))
  const decimal = trimmed
    .replace(/^\+/, "")
    .replace(/^(-?)\./, (_match, sign: string) => `${sign}0.`)
    .replace(/\.(?=[eE]|$)/, "")
    .replace(
      /[eE]([+-]?)(\d+)$/,
      (_match, sign: string, exponent: string) =>
        `e${sign}${exponent.replace(/^0+(?=\d)/, "")}`,
    )
  return parseDecimal(decimal)
}

/** Converts a valid manual USD balance to the legacy quota projection. */
export function parseManualQuotaFromUsd(value: unknown): number | undefined {
  const amount = normalizeManualBalanceUsd(value)
  return amount === undefined
    ? undefined
    : Math.round(Number(amount) * QUOTA_PER_USD)
}

export const ACCOUNT_FORM_ISSUE_KINDS = {
  MISSING: "missing",
  INVALID: "invalid",
} as const

export const ACCOUNT_FORM_FIELDS = {
  SITE_NAME: "siteName",
  USERNAME: "username",
  USER_ID: "userId",
  AUTH_TYPE: "authType",
  ACCESS_TOKEN: "accessToken",
  COOKIE: "cookie",
  REFRESH_TOKEN: "refreshToken",
  LOGIN: "login",
  EXCHANGE_RATE: "exchangeRate",
  MANUAL_BALANCE_USD: "manualBalanceUsd",
} as const

export interface AccountFormIssue {
  field: (typeof ACCOUNT_FORM_FIELDS)[keyof typeof ACCOUNT_FORM_FIELDS]
  kind: (typeof ACCOUNT_FORM_ISSUE_KINDS)[keyof typeof ACCOUNT_FORM_ISSUE_KINDS]
}

interface AccountValidationFields {
  siteName: string
  username: string
  userId: string
  siteType?: AccountSiteType
  loginMethods?: readonly AccountLoginMethodDefinition[]
  authType: AuthTypeEnum
  accessToken: string
  cookieAuthSessionCookie?: string
  exchangeRate: string
  loginChange?: AccountLoginConfiguration | null
  refreshTokenRequired?: boolean
  manualBalanceUsd?: string
}

/** Identifies the blocking fields in the order they appear in the editor. */
export function getAccountFormIssues({
  siteName,
  username,
  userId,
  siteType,
  loginMethods = [],
  authType,
  accessToken,
  cookieAuthSessionCookie,
  exchangeRate,
  loginChange,
  refreshTokenRequired = false,
  manualBalanceUsd,
}: AccountValidationFields): AccountFormIssue[] {
  const normalizedSiteType = isAccountSiteType(siteType)
    ? siteType
    : SITE_TYPES.UNKNOWN
  const profile = getAccountSiteProductProfile(normalizedSiteType)
  const issues: AccountFormIssue[] = []

  if (!siteName.trim())
    issues.push({
      field: ACCOUNT_FORM_FIELDS.SITE_NAME,
      kind: ACCOUNT_FORM_ISSUE_KINDS.MISSING,
    })
  if (profile.identity.usernameRequired && !username.trim())
    issues.push({
      field: ACCOUNT_FORM_FIELDS.USERNAME,
      kind: ACCOUNT_FORM_ISSUE_KINDS.MISSING,
    })
  if (profile.identity.userIdRequired && !userId.trim())
    issues.push({
      field: ACCOUNT_FORM_FIELDS.USER_ID,
      kind: ACCOUNT_FORM_ISSUE_KINDS.MISSING,
    })
  if (
    authType !== AuthTypeEnum.None &&
    !isAccountAuthTypeAllowed(normalizedSiteType, authType)
  )
    issues.push({
      field: ACCOUNT_FORM_FIELDS.AUTH_TYPE,
      kind: ACCOUNT_FORM_ISSUE_KINDS.INVALID,
    })
  if (authType === AuthTypeEnum.AccessToken && !accessToken.trim())
    issues.push({
      field: ACCOUNT_FORM_FIELDS.ACCESS_TOKEN,
      kind: ACCOUNT_FORM_ISSUE_KINDS.MISSING,
    })
  if (refreshTokenRequired)
    issues.push({
      field: ACCOUNT_FORM_FIELDS.REFRESH_TOKEN,
      kind: ACCOUNT_FORM_ISSUE_KINDS.MISSING,
    })
  if (
    authType === AuthTypeEnum.Cookie &&
    !profile.auth.usesBrowserCookieSession &&
    !cookieAuthSessionCookie?.trim()
  )
    issues.push({
      field: ACCOUNT_FORM_FIELDS.COOKIE,
      kind: ACCOUNT_FORM_ISSUE_KINDS.MISSING,
    })
  if (loginChange && !isAccountLoginConfigured(loginChange, loginMethods))
    issues.push({
      field: ACCOUNT_FORM_FIELDS.LOGIN,
      kind: ACCOUNT_FORM_ISSUE_KINDS.INVALID,
    })
  if (!isValidExchangeRate(exchangeRate))
    issues.push({
      field: ACCOUNT_FORM_FIELDS.EXCHANGE_RATE,
      kind: exchangeRate.trim()
        ? ACCOUNT_FORM_ISSUE_KINDS.INVALID
        : ACCOUNT_FORM_ISSUE_KINDS.MISSING,
    })
  if (
    manualBalanceUsd?.trim() &&
    parseManualQuotaFromUsd(manualBalanceUsd) === undefined
  )
    issues.push({
      field: ACCOUNT_FORM_FIELDS.MANUAL_BALANCE_USD,
      kind: ACCOUNT_FORM_ISSUE_KINDS.INVALID,
    })

  return issues
}

/** Checks the account form against the selected site profile. */
export function isValidAccount(fields: AccountValidationFields) {
  return getAccountFormIssues(fields).length === 0
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
