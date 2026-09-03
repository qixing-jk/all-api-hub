import { SITE_TYPES, type AccountSiteType } from "~/constants/siteType"
import type { ContentSessionTransientAuth } from "~/services/accountSiteOnboarding/contracts"
import type { ApiServiceFetchContext } from "~/services/apiTransport/type"
import type { AuthTypeEnum, CheckInConfig, Sub2ApiAuthConfig } from "~/types"

/**
 * Private, local-only account fields retained when auto-detection cannot finish.
 * This data belongs to the current form session and must stay out of telemetry
 * and external error reports.
 */
export interface AccountAutoDetectRecoveryData {
  siteType?: AccountSiteType
  siteName?: string
  username?: string
  accessToken?: string
  userId?: string
  exchangeRate?: number | null
  authType?: AuthTypeEnum
  checkIn?: CheckInConfig
  cookieAuthSessionCookie?: string
  transientAuth?: ContentSessionTransientAuth
  sub2apiAuth?: Sub2ApiAuthConfig
  fetchContext?: ApiServiceFetchContext
}

export interface DetectedAccountRecoverySource {
  siteType: AccountSiteType
  userId?: unknown
  user?: unknown
  accessToken?: unknown
  transientAuth?: ContentSessionTransientAuth
  sub2apiAuth?: Sub2ApiAuthConfig
  fetchContext?: ApiServiceFetchContext
}

/** Keeps locally recoverable fields from a detected browser identity. */
export function createDetectedAccountRecoveryData(params: {
  detected: DetectedAccountRecoverySource
  requestedAuthType: AuthTypeEnum
  cookieAuthSessionCookie?: string
}): AccountAutoDetectRecoveryData {
  const { detected, requestedAuthType, cookieAuthSessionCookie } = params
  const detectedUser =
    detected.user && typeof detected.user === "object"
      ? (detected.user as Record<string, unknown>)
      : undefined
  const username = [
    detectedUser?.username,
    detectedUser?.name,
    detectedUser?.display_name,
    detectedUser?.nickname,
    detectedUser?.email,
  ].find(
    (value): value is string => typeof value === "string" && !!value.trim(),
  )
  const accessToken =
    typeof detected.accessToken === "string" && detected.accessToken.trim()
      ? detected.accessToken.trim()
      : undefined
  const userId =
    detected.userId === null || detected.userId === undefined
      ? ""
      : String(detected.userId).trim()

  return {
    siteType: detected.siteType,
    ...(userId ? { userId } : {}),
    ...(username ? { username: username.trim() } : {}),
    ...(accessToken ? { accessToken } : {}),
    authType: requestedAuthType,
    ...(cookieAuthSessionCookie?.trim()
      ? { cookieAuthSessionCookie: cookieAuthSessionCookie.trim() }
      : {}),
    ...(detected.transientAuth
      ? { transientAuth: detected.transientAuth }
      : {}),
    ...(detected.sub2apiAuth ? { sub2apiAuth: detected.sub2apiAuth } : {}),
    ...(detected.fetchContext ? { fetchContext: detected.fetchContext } : {}),
  }
}

/** Merges progressively captured recovery fields without dropping prior data. */
export function mergeAccountAutoDetectRecoveryData(
  current: AccountAutoDetectRecoveryData | undefined,
  next: AccountAutoDetectRecoveryData | undefined,
): AccountAutoDetectRecoveryData | undefined {
  if (!next) return current
  const nextSiteType =
    next.siteType && next.siteType !== SITE_TYPES.UNKNOWN
      ? next.siteType
      : current?.siteType

  return {
    ...current,
    ...next,
    ...(nextSiteType ? { siteType: nextSiteType } : {}),
    ...(next.sub2apiAuth || current?.sub2apiAuth
      ? { sub2apiAuth: next.sub2apiAuth ?? current?.sub2apiAuth }
      : {}),
  }
}
