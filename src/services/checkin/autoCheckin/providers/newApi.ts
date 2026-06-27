import { TURNSTILE_DEFAULT_WAIT_TIMEOUT_MS } from "~/constants/turnstile"
import { normalizeAccountIdentity } from "~/services/accounts/accountIdentity"
import {
  resolveAccountSiteRouteUrl,
  SITE_ROUTE_KINDS,
} from "~/services/accounts/utils/siteRouteResolver"
import { buildCompatUserIdHeaders } from "~/services/apiService/common/compatHeaders"
import { REQUEST_CONFIG } from "~/services/apiService/common/constant"
import { ApiError } from "~/services/apiService/common/errors"
import type {
  CheckinRecord,
  CheckInStatus,
  NewApiCheckinResponse,
} from "~/services/apiService/common/type"
import { fetchApi, fetchApiData } from "~/services/apiService/common/utils"
import type { AutoCheckinProvider } from "~/services/checkin/autoCheckin/providers/index"
import {
  AUTO_CHECKIN_PROVIDER_FALLBACK_MESSAGE_KEYS,
  AUTO_CHECKIN_USER_CHECKIN_ENDPOINT,
  getEffectiveAuthType,
  isAlreadyCheckedMessage,
  normalizeCheckinMessage,
  resolveProviderErrorResult,
} from "~/services/checkin/autoCheckin/providers/shared"
import type { AutoCheckinProviderResult } from "~/services/checkin/autoCheckin/providers/types"
import type { SiteAccount } from "~/types"
import { AuthTypeEnum } from "~/types"
import { CHECKIN_RESULT_STATUS } from "~/types/autoCheckin"
import type {
  TempWindowCheckinPageAction,
  TempWindowTurnstileFetch,
} from "~/types/tempWindowFetch"
import type { TurnstilePreTrigger } from "~/types/turnstile"
import { isAllowedIncognitoAccess } from "~/utils/browser/browserApi"
import {
  tempWindowTriggerCheckinPageAction,
  tempWindowTurnstileFetch,
} from "~/utils/browser/tempWindowFetch"
import { safeRandomUUID } from "~/utils/core/identifier"
import { joinUrl } from "~/utils/core/url"

const NEW_API_MESSAGE_KEYS = {
  turnstileManualRequired:
    "autoCheckin:providerFallback.turnstileManualRequired",
  turnstileIncognitoAccessRequired:
    "autoCheckin:providerFallback.turnstileIncognitoAccessRequired",
  nativePageIdentityMissing:
    "autoCheckin:providerFallback.nativePageIdentityMissing",
  nativePageIdentityMismatch:
    "autoCheckin:providerFallback.nativePageIdentityMismatch",
  nativePageTargetNotFound:
    "autoCheckin:providerFallback.nativePageTargetNotFound",
  nativePageTriggerFailed:
    "autoCheckin:providerFallback.nativePageTriggerFailed",
  nativePageStatusUnconfirmed:
    "autoCheckin:providerFallback.nativePageStatusUnconfirmed",
} as const

/**
 * Provider result that the scheduler/UI understands.
 *
 * - `messageKey` should be an i18n key (e.g. `autoCheckin:providerFallback.*`).
 * - `rawMessage` is kept when the backend returns a human readable message.
 */
type CheckinResult = AutoCheckinProviderResult

/**
 * daily check-in endpoint.
 *
 * - GET: fetch current day's check-in status.
 * - POST: perform check-in.
 */
const ENDPOINT = AUTO_CHECKIN_USER_CHECKIN_ENDPOINT
const TURNSTILE_ASSIST_TIMEOUT_MS = TURNSTILE_DEFAULT_WAIT_TIMEOUT_MS
const NATIVE_PAGE_STATUS_POLL_TIMEOUT_MS = 8_000
const NATIVE_PAGE_STATUS_POLL_INTERVAL_MS = 1_000
const CHECKIN_STATUS_MONTH_FORMAT_LENGTH = 7

/**
 * Determine whether a check-in failure message indicates Turnstile verification is required.
 */
function isTurnstileRequiredMessage(message: string): boolean {
  const normalized = message.toLowerCase()
  if (!normalized.includes("turnstile")) return false

  return (
    normalized.includes("token") ||
    normalized.includes("verify") ||
    normalized.includes("invalid") ||
    normalized.includes("failed") ||
    message.includes("校验") ||
    message.includes("为空") ||
    message.includes("失败")
  )
}

/**
 * Detect messages that belong to the Turnstile/manual-verification path.
 */
function isTurnstileRelatedMessage(message: string): boolean {
  return message.toLowerCase().includes("turnstile")
}

/**
 * Extract a numeric HTTP status code from provider errors when present.
 */
function getErrorStatusCode(error: unknown): number | null {
  if (!error || typeof error !== "object") return null
  const record = error as Record<string, unknown>
  return typeof record.statusCode === "number" ? record.statusCode : null
}

/**
 * Detect failures where the check-in endpoint itself is unavailable.
 */
function isEndpointUnsupportedFailure(params: {
  message: string
  error?: unknown
}): boolean {
  if (getErrorStatusCode(params.error) === 404) return true

  const normalized = params.message.toLowerCase()
  return (
    normalized.includes("404") ||
    normalized.includes("not found") ||
    normalized.includes("unsupported") ||
    normalized.includes("not supported") ||
    params.message.includes("不支持")
  )
}

/**
 * Detect authentication and permission failures that page clicking should not mask.
 */
function isAuthOrPermissionFailureMessage(message: string): boolean {
  const normalized = message.toLowerCase()
  return (
    normalized.includes("unauthorized") ||
    normalized.includes("unauthenticated") ||
    normalized.includes("authentication") ||
    normalized.includes("authenticate") ||
    normalized.includes("forbidden") ||
    normalized.includes("permission") ||
    normalized.includes("auth required") ||
    normalized.includes("invalid auth") ||
    normalized.includes("not logged") ||
    normalized.includes("login required") ||
    message.includes("未登录") ||
    message.includes("无权限") ||
    message.includes("权限")
  )
}

/**
 * Detect rate-limit failures where retrying through a page would add noise.
 */
function isRateLimitedMessage(message: string): boolean {
  const normalized = message.toLowerCase()
  return (
    normalized.includes("429") ||
    normalized.includes("rate limit") ||
    normalized.includes("too many requests") ||
    normalized.includes("throttle") ||
    message.includes("频率") ||
    message.includes("限流") ||
    message.includes("请求过于频繁")
  )
}

/**
 * Detect direct check-in failures that should keep their original API result.
 */
function isNativePageFallbackBlockedFailure(params: {
  message: string
  error?: unknown
}): boolean {
  return (
    isAlreadyCheckedMessage(params.message) ||
    isTurnstileRelatedMessage(params.message) ||
    isEndpointUnsupportedFailure(params) ||
    isAuthOrPermissionFailureMessage(params.message) ||
    isRateLimitedMessage(params.message)
  )
}

/**
 * Decide whether a failed direct check-in should retry through the native page.
 */
function shouldAttemptNativePageCheckinFallback(params: {
  success: boolean
  message: string
  error?: unknown
}): boolean {
  return (
    !params.success &&
    !!params.message &&
    !isNativePageFallbackBlockedFailure(params)
  )
}

/**
 * Resolve a user-openable URL for manual Turnstile verification.
 */
function resolveCheckInUrl(account: SiteAccount): Promise<string> {
  return resolveAccountSiteRouteUrl(
    { baseUrl: account.site_url, siteType: account.site_type },
    SITE_ROUTE_KINDS.CheckIn,
  )
}

/**
 * Normalize a New-API check-in payload into the provider result for the common
 * success/already-checked outcomes.
 *
 * Returns `null` when the payload doesn't match those outcomes so the caller
 * can fall back to Turnstile/manual-required handling.
 */
function resolveStandardCheckinResult(params: {
  payload: NewApiCheckinResponse | undefined
  message?: string
}): CheckinResult | null {
  const payload = params.payload
  if (!payload) return null

  const message = params.message ?? normalizeCheckinMessage(payload.message)

  if (message && isAlreadyCheckedMessage(message) && !payload.success) {
    return {
      status: CHECKIN_RESULT_STATUS.ALREADY_CHECKED,
      rawMessage: message || undefined,
      data: payload.data,
    }
  }

  if (payload.success) {
    return {
      status: CHECKIN_RESULT_STATUS.SUCCESS,
      rawMessage: message || undefined,
      messageKey: message
        ? undefined
        : AUTO_CHECKIN_PROVIDER_FALLBACK_MESSAGE_KEYS.checkinSuccessful,
      data: payload.data ?? undefined,
    }
  }

  return null
}

/**
 * Defensive verification: resolve whether the user is already checked in today.
 *
 * Some deployments only render Turnstile after clicking a "check-in" button.
 * That click can also advance the server-side check-in flow, so we confirm the
 * actual status when the Turnstile-assisted attempt cannot obtain a token.
 */
async function fetchCheckedInTodayStatus(
  account: SiteAccount,
): Promise<boolean | undefined> {
  const currentMonth = new Date()
    .toISOString()
    .slice(0, CHECKIN_STATUS_MONTH_FORMAT_LENGTH)

  try {
    const checkInData = await fetchApiData<CheckInStatus>(
      {
        baseUrl: account.site_url,
        accountId: account.id,
        cookieAuthSessionCookie: account.cookieAuth?.sessionCookie,
        auth: {
          authType: getEffectiveAuthType(account),
          userId: account.account_info.id,
          accessToken: account.account_info.access_token,
        },
      },
      {
        endpoint: `${ENDPOINT}?month=${currentMonth}`,
      },
    )

    return Boolean(checkInData?.stats?.checked_in_today)
  } catch (error) {
    if (
      error instanceof ApiError &&
      (error.statusCode === 404 || error.statusCode === 500)
    ) {
      return undefined
    }

    return undefined
  }
}

/**
 * Poll the server-side check-in status after a native page click.
 */
async function pollCheckedInTodayStatus(
  account: SiteAccount,
): Promise<boolean | undefined> {
  const deadline = Date.now() + NATIVE_PAGE_STATUS_POLL_TIMEOUT_MS
  let lastStatus: boolean | undefined

  while (Date.now() <= deadline) {
    lastStatus = await fetchCheckedInTodayStatus(account)
    if (lastStatus === true) return true

    const remainingMs = deadline - Date.now()
    if (remainingMs <= 0) break

    await new Promise((resolve) =>
      setTimeout(
        resolve,
        Math.min(NATIVE_PAGE_STATUS_POLL_INTERVAL_MS, remainingMs),
      ),
    )
  }

  return lastStatus
}

/**
 * Resolve the Turnstile widget pre-trigger configuration for this account.
 *
 * This is an advanced escape hatch for sites that only render Turnstile after a
 * user action (e.g. clicking a "check-in" button).
 */
function resolveTurnstilePreTrigger(account: SiteAccount): TurnstilePreTrigger {
  return (
    account.checkIn?.customCheckIn?.turnstilePreTrigger ?? {
      kind: "checkinButton",
    }
  )
}

/**
 * Fetch options used for the Turnstile-assisted POST /api/user/checkin replay.
 */
function getTurnstileAssistedFetchOptions(account: SiteAccount): RequestInit {
  const authType = getEffectiveAuthType(account)

  const userIdHeaders = buildCompatUserIdHeaders(account.account_info?.id)

  const headers: Record<string, string> = {
    "Content-Type": REQUEST_CONFIG.HEADERS.CONTENT_TYPE,
    Pragma: REQUEST_CONFIG.HEADERS.PRAGMA,
    ...userIdHeaders,
  }

  const accessToken = account.account_info?.access_token
  if (accessToken) {
    headers["Authorization"] = `Bearer ${accessToken}`
  }

  return {
    method: "POST",
    body: "{}",
    headers,
    credentials: authType === AuthTypeEnum.Cookie ? "include" : "omit",
  }
}

/**
 * When the initial check-in attempt indicates Turnstile verification is required,
 */
function buildTurnstileAssistedParams(
  account: SiteAccount,
  checkInUrl: string,
) {
  const fetchUrl = joinUrl(account.site_url, ENDPOINT)

  return {
    originUrl: account.site_url,
    pageUrl: checkInUrl,
    fetchUrl,
    fetchOptions: getTurnstileAssistedFetchOptions(account),
    responseType: "json",
    accountId: account.id,
    authType: getEffectiveAuthType(account),
    cookieAuthSessionCookie: account.cookieAuth?.sessionCookie,
    turnstileTimeoutMs: TURNSTILE_ASSIST_TIMEOUT_MS,
    turnstilePreTrigger: resolveTurnstilePreTrigger(account),
  } as const
}

/**
 * When the Turnstile-assisted check-in attempt fails due to missing token and no
 */
async function maybeRetryTurnstileInIncognito(params: {
  assisted: TempWindowTurnstileFetch
  assistedParams: ReturnType<typeof buildTurnstileAssistedParams>
  checkInUrl: string
}): Promise<CheckinResult | null> {
  const incognitoAllowed = await isAllowedIncognitoAccess()
  if (incognitoAllowed === false) {
    return {
      status: CHECKIN_RESULT_STATUS.FAILED,
      messageKey: NEW_API_MESSAGE_KEYS.turnstileIncognitoAccessRequired,
      messageParams: { checkInUrl: params.checkInUrl },
      data: params.assisted ?? undefined,
    }
  }

  const incognitoAssisted = await tempWindowTurnstileFetch({
    ...params.assistedParams,
    useIncognito: true,
  })

  if (!incognitoAssisted.success) {
    return null
  }

  const incognitoPayload = incognitoAssisted.data as
    | NewApiCheckinResponse
    | undefined
  const incognitoMessage = normalizeCheckinMessage(incognitoPayload?.message)

  return (
    resolveStandardCheckinResult({
      payload: incognitoPayload,
      message: incognitoMessage,
    }) ?? null
  )
}

type TurnstileAssistedAttempt = {
  assisted: TempWindowTurnstileFetch | null
  usedIncognito: boolean
  incognitoAllowed: boolean | null
}

/**
 * Map native page trigger failures to provider-facing fallback keys.
 */
function resolveNativePageFailureResult(params: {
  action: TempWindowCheckinPageAction
  checkInUrl: string
}): CheckinResult {
  const base = {
    status: CHECKIN_RESULT_STATUS.FAILED,
    messageParams: { checkInUrl: params.checkInUrl },
    rawMessage: params.action.error || undefined,
    data: params.action,
  } satisfies Partial<CheckinResult>

  if (params.action.reason === "identity_missing") {
    return {
      ...base,
      messageKey: NEW_API_MESSAGE_KEYS.nativePageIdentityMissing,
    } as CheckinResult
  }

  if (params.action.reason === "identity_mismatch") {
    return {
      ...base,
      messageKey: NEW_API_MESSAGE_KEYS.nativePageIdentityMismatch,
    } as CheckinResult
  }

  if (params.action.reason === "target_not_found") {
    return {
      ...base,
      messageKey: NEW_API_MESSAGE_KEYS.nativePageTargetNotFound,
    } as CheckinResult
  }

  if (params.action.reason === "throttled") {
    return {
      ...base,
      messageKey: NEW_API_MESSAGE_KEYS.nativePageTriggerFailed,
    } as CheckinResult
  }

  return {
    ...base,
    messageKey: NEW_API_MESSAGE_KEYS.nativePageTriggerFailed,
  } as CheckinResult
}

/**
 * Execute the site page's native check-in action and confirm it server-side.
 */
async function resolveNativePageCheckinResult(params: {
  account: SiteAccount
  responseMessage: string
}): Promise<CheckinResult> {
  const checkInUrl = await resolveCheckInUrl(params.account)
  const expectedUserId = normalizeAccountIdentity(
    params.account.account_info?.id,
  )

  if (!expectedUserId) {
    return {
      status: CHECKIN_RESULT_STATUS.FAILED,
      messageKey: NEW_API_MESSAGE_KEYS.nativePageIdentityMissing,
      messageParams: { checkInUrl },
    }
  }

  let action: TempWindowCheckinPageAction
  try {
    action = await tempWindowTriggerCheckinPageAction({
      originUrl: params.account.site_url,
      pageUrl: checkInUrl,
      requestId: safeRandomUUID(`native-checkin-${params.account.id}`),
      accountId: params.account.id,
      authType: getEffectiveAuthType(params.account),
      cookieAuthSessionCookie: params.account.cookieAuth?.sessionCookie,
      siteType: params.account.site_type,
      expectedUserId,
      trigger: resolveTurnstilePreTrigger(params.account),
    })
  } catch (error: unknown) {
    const errorMessage = getProviderErrorMessage(error)
    return {
      status: CHECKIN_RESULT_STATUS.FAILED,
      messageKey: NEW_API_MESSAGE_KEYS.nativePageTriggerFailed,
      messageParams: { checkInUrl },
      rawMessage: errorMessage || undefined,
    }
  }

  if (!action.success || action.reason !== "clicked") {
    return resolveNativePageFailureResult({
      action,
      checkInUrl,
    })
  }

  const checkedInToday = await pollCheckedInTodayStatus(params.account)
  if (checkedInToday === true) {
    return {
      status: CHECKIN_RESULT_STATUS.ALREADY_CHECKED,
      messageKey:
        AUTO_CHECKIN_PROVIDER_FALLBACK_MESSAGE_KEYS.alreadyCheckedToday,
      data: action,
    }
  }

  return {
    status: CHECKIN_RESULT_STATUS.FAILED,
    messageKey: NEW_API_MESSAGE_KEYS.nativePageStatusUnconfirmed,
    messageParams: { checkInUrl },
    rawMessage: action.error || undefined,
    data: action,
  }
}

/**
 * Run one Turnstile-assisted temp-window check-in attempt.
 */
async function runTurnstileAssistedAttempt(params: {
  assistedParams: ReturnType<typeof buildTurnstileAssistedParams>
  useIncognito: boolean
}): Promise<TempWindowTurnstileFetch | null> {
  return await tempWindowTurnstileFetch({
    ...params.assistedParams,
    ...(params.useIncognito ? { useIncognito: true } : {}),
  })
}

/**
 * Prefer an incognito Turnstile context for access-token accounts.
 */
async function runPreferredTurnstileAssistedAttempt(params: {
  account: SiteAccount
  assistedParams: ReturnType<typeof buildTurnstileAssistedParams>
}): Promise<TurnstileAssistedAttempt> {
  if (getEffectiveAuthType(params.account) !== AuthTypeEnum.AccessToken) {
    return {
      assisted: await runTurnstileAssistedAttempt({
        assistedParams: params.assistedParams,
        useIncognito: false,
      }),
      usedIncognito: false,
      incognitoAllowed: null,
    }
  }

  const incognitoAllowed = await isAllowedIncognitoAccess()
  if (incognitoAllowed === true) {
    return {
      assisted: await runTurnstileAssistedAttempt({
        assistedParams: params.assistedParams,
        useIncognito: true,
      }),
      usedIncognito: true,
      incognitoAllowed,
    }
  }

  return {
    assisted: await runTurnstileAssistedAttempt({
      assistedParams: params.assistedParams,
      useIncognito: false,
    }),
    usedIncognito: false,
    incognitoAllowed,
  }
}

/**
 * When the initial check-in attempt indicates Turnstile verification is required,
 */
async function resolveTurnstileAssistedCheckinResult(params: {
  account: SiteAccount
  responseMessage: string
}): Promise<CheckinResult> {
  const checkInUrl = await resolveCheckInUrl(params.account)
  const assistedParams = buildTurnstileAssistedParams(
    params.account,
    checkInUrl,
  )

  const initialAttempt = await runPreferredTurnstileAssistedAttempt({
    account: params.account,
    assistedParams,
  })
  let assisted = initialAttempt.assisted

  if (!assisted) {
    return {
      status: CHECKIN_RESULT_STATUS.FAILED,
      messageKey: AUTO_CHECKIN_PROVIDER_FALLBACK_MESSAGE_KEYS.checkinFailed,
      rawMessage: params.responseMessage,
      data: assisted ?? undefined,
    }
  }

  if (!assisted.success) {
    if (assisted.turnstile?.status !== "token_obtained") {
      const checkedInToday = await fetchCheckedInTodayStatus(params.account)
      if (checkedInToday === true) {
        return {
          status: CHECKIN_RESULT_STATUS.ALREADY_CHECKED,
          messageKey:
            AUTO_CHECKIN_PROVIDER_FALLBACK_MESSAGE_KEYS.alreadyCheckedToday,
          data: assisted ?? undefined,
        }
      }

      if (initialAttempt.usedIncognito) {
        const normalAssisted = await runTurnstileAssistedAttempt({
          assistedParams,
          useIncognito: false,
        })

        if (normalAssisted) {
          const normalPayload = normalAssisted.data as
            | NewApiCheckinResponse
            | undefined
          const normalMessage = normalizeCheckinMessage(normalPayload?.message)
          const normalResult = resolveStandardCheckinResult({
            payload: normalPayload,
            message: normalMessage,
          })

          if (normalResult) {
            return normalResult
          }

          if (
            normalAssisted.success ||
            normalAssisted.turnstile?.status === "token_obtained"
          ) {
            assisted = normalAssisted
          }
        }
      }

      /**
       * Multi-account edge case:
       * - The API call is made with this account's auth (usually access token),
       *   but the temp-context page inherits the user's currently logged-in web UI.
       * - When that web UI user has already checked in, the check-in page may not
       *   render Turnstile anymore, so no token can be obtained.
       *
       * Retrying once in an incognito/private temp window provides a clean storage
       * context that can render Turnstile again (typically via login redirects),
       * without mutating normal browsing state.
       */
      if (
        !initialAttempt.usedIncognito &&
        assisted.turnstile?.status === "not_present" &&
        !assisted.turnstile?.hasTurnstile
      ) {
        if (initialAttempt.incognitoAllowed === false) {
          return {
            status: CHECKIN_RESULT_STATUS.FAILED,
            messageKey: NEW_API_MESSAGE_KEYS.turnstileIncognitoAccessRequired,
            messageParams: { checkInUrl },
            data: assisted ?? undefined,
          }
        }

        const incognitoResult = await maybeRetryTurnstileInIncognito({
          assisted,
          assistedParams,
          checkInUrl,
        })
        if (incognitoResult) {
          return incognitoResult
        }
      }

      return {
        status: CHECKIN_RESULT_STATUS.FAILED,
        messageKey: NEW_API_MESSAGE_KEYS.turnstileManualRequired,
        messageParams: { checkInUrl },
        rawMessage: assisted.error || params.responseMessage || undefined,
        data: assisted ?? undefined,
      }
    }

    return {
      status: CHECKIN_RESULT_STATUS.FAILED,
      rawMessage: assisted.error || params.responseMessage || undefined,
      messageKey: assisted.error
        ? undefined
        : AUTO_CHECKIN_PROVIDER_FALLBACK_MESSAGE_KEYS.checkinFailed,
      data: assisted ?? undefined,
    }
  }

  const assistedPayload = assisted.data as NewApiCheckinResponse | undefined
  const assistedMessage = normalizeCheckinMessage(assistedPayload?.message)

  const assistedResult = resolveStandardCheckinResult({
    payload: assistedPayload,
    message: assistedMessage,
  })
  if (assistedResult) {
    return assistedResult
  }

  if (
    assisted.turnstile?.status &&
    assisted.turnstile.status !== "token_obtained"
  ) {
    const checkedInToday = await fetchCheckedInTodayStatus(params.account)
    if (checkedInToday === true) {
      return {
        status: CHECKIN_RESULT_STATUS.ALREADY_CHECKED,
        messageKey:
          AUTO_CHECKIN_PROVIDER_FALLBACK_MESSAGE_KEYS.alreadyCheckedToday,
        data: assistedPayload ?? undefined,
      }
    }

    return {
      status: CHECKIN_RESULT_STATUS.FAILED,
      messageKey: NEW_API_MESSAGE_KEYS.turnstileManualRequired,
      messageParams: { checkInUrl },
      rawMessage: params.responseMessage || assistedMessage || undefined,
      data: assistedPayload ?? undefined,
    }
  }

  return {
    status: CHECKIN_RESULT_STATUS.FAILED,
    rawMessage: assistedMessage || undefined,
    messageKey: assistedMessage
      ? undefined
      : AUTO_CHECKIN_PROVIDER_FALLBACK_MESSAGE_KEYS.checkinFailed,
    data: assistedPayload ?? undefined,
  }
}

/**
 * Call POST /api/user/checkin to perform the daily check-in.
 */
async function performCheckin(
  account: SiteAccount,
): Promise<NewApiCheckinResponse> {
  const { site_url, account_info } = account

  return await fetchApi<CheckinRecord>(
    {
      baseUrl: site_url,
      accountId: account.id,
      cookieAuthSessionCookie: account.cookieAuth?.sessionCookie,
      auth: {
        authType: getEffectiveAuthType(account),
        userId: account_info.id,
        accessToken: account_info.access_token,
      },
    },
    {
      endpoint: ENDPOINT,
      options: {
        method: "POST",
        body: "{}",
      },
    },
    false,
  )
}

/**
 * Extract a provider error message without assuming the thrown value shape.
 */
function getProviderErrorMessage(error: unknown): string {
  if (typeof error === "string") return error
  if (error instanceof Error) return error.message
  if (error && typeof error === "object") {
    const record = error as Record<string, unknown>
    if (typeof record.message === "string") return record.message
  }
  return ""
}

/**
 * Provider entry: execute check-in directly and normalize the response.
 */
async function checkinNewApi(account: SiteAccount): Promise<CheckinResult> {
  try {
    const checkinResponse = await performCheckin(account)
    const responseMessage = normalizeCheckinMessage(checkinResponse.message)

    const standardResult = resolveStandardCheckinResult({
      payload: checkinResponse,
      message: responseMessage,
    })
    if (standardResult) {
      return standardResult
    }

    if (
      responseMessage &&
      isTurnstileRequiredMessage(responseMessage) &&
      !checkinResponse.success
    ) {
      return await resolveTurnstileAssistedCheckinResult({
        account,
        responseMessage,
      })
    }

    if (
      shouldAttemptNativePageCheckinFallback({
        success: checkinResponse.success,
        message: responseMessage,
      })
    ) {
      return await resolveNativePageCheckinResult({
        account,
        responseMessage,
      })
    }

    return {
      status: CHECKIN_RESULT_STATUS.FAILED,
      rawMessage: responseMessage || undefined,
      messageKey: responseMessage
        ? undefined
        : AUTO_CHECKIN_PROVIDER_FALLBACK_MESSAGE_KEYS.checkinFailed,
      data: checkinResponse ?? undefined,
    }
  } catch (error: unknown) {
    const errorMessage = getProviderErrorMessage(error)
    if (
      shouldAttemptNativePageCheckinFallback({
        success: false,
        message: errorMessage,
        error,
      })
    ) {
      return await resolveNativePageCheckinResult({
        account,
        responseMessage: errorMessage,
      })
    }

    return resolveProviderErrorResult({ error })
  }
}

/**
 * Determine whether this account has the required configuration for check-in.
 */
function canCheckIn(account: SiteAccount): boolean {
  if (!account.checkIn?.enableDetection) {
    return false
  }

  if (!account.account_info?.id) {
    return false
  }

  const authType = getEffectiveAuthType(account)

  if (authType === AuthTypeEnum.AccessToken) {
    return !!account.account_info?.access_token
  }

  return true
}

/**
 * Exported provider implementation for `site_type = new-api`.
 */
export const newApiProvider: AutoCheckinProvider = {
  canCheckIn,
  checkIn: checkinNewApi,
}
