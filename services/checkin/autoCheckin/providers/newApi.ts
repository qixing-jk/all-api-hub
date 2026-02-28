import { getSiteApiRouter } from "~/constants/siteType"
import { TURNSTILE_DEFAULT_WAIT_TIMEOUT_MS } from "~/constants/turnstile"
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
  isAlreadyCheckedMessage,
  normalizeCheckinMessage,
  resolveProviderErrorResult,
} from "~/services/checkin/autoCheckin/providers/shared"
import type { AutoCheckinProviderResult } from "~/services/checkin/autoCheckin/providers/types"
import type { SiteAccount } from "~/types"
import { AuthTypeEnum } from "~/types"
import { CHECKIN_RESULT_STATUS } from "~/types/autoCheckin"
import type { TempWindowTurnstileFetch } from "~/types/tempWindowFetch"
import type { TurnstilePreTrigger } from "~/types/turnstile"
import { isAllowedIncognitoAccess } from "~/utils/browserApi"
import { tempWindowTurnstileFetch } from "~/utils/tempWindowFetch"
import { joinUrl } from "~/utils/url"

const NEW_API_MESSAGE_KEYS = {
  turnstileManualRequired:
    "autoCheckin:providerFallback.turnstileManualRequired",
  turnstileIncognitoAccessRequired:
    "autoCheckin:providerFallback.turnstileIncognitoAccessRequired",
} as const

/**
 * Provider result that the scheduler/UI understands.
 *
 * - `messageKey` should be an i18n key (e.g. `autoCheckin:providerFallback.*`).
 * - `rawMessage` is kept when the backend returns a human readable message.
 */
export type CheckinResult = AutoCheckinProviderResult

/**
 * daily check-in endpoint.
 *
 * - GET: fetch current day's check-in status.
 * - POST: perform check-in.
 */
const ENDPOINT = AUTO_CHECKIN_USER_CHECKIN_ENDPOINT
const TURNSTILE_ASSIST_TIMEOUT_MS = TURNSTILE_DEFAULT_WAIT_TIMEOUT_MS
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
 * Resolve a user-openable URL for manual Turnstile verification.
 */
function resolveCheckInUrl(account: SiteAccount): string {
  const customUrl = account.checkIn?.customCheckIn?.url
  if (typeof customUrl === "string" && customUrl.trim()) {
    return customUrl.trim()
  }

  return joinUrl(
    account.site_url,
    getSiteApiRouter(account.site_type).checkInPath,
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
        auth: {
          authType: account.authType ?? AuthTypeEnum.AccessToken,
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
  const authType = account.authType || AuthTypeEnum.AccessToken

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
 *
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
    authType: account.authType,
    cookieAuthSessionCookie: account.cookieAuth?.sessionCookie,
    turnstileTimeoutMs: TURNSTILE_ASSIST_TIMEOUT_MS,
    turnstilePreTrigger: resolveTurnstilePreTrigger(account),
  } as const
}

/**
 *
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

/**
 * When the initial check-in attempt indicates Turnstile verification is required,
 */
async function resolveTurnstileAssistedCheckinResult(params: {
  account: SiteAccount
  responseMessage: string
}): Promise<CheckinResult> {
  const checkInUrl = resolveCheckInUrl(params.account)
  const assistedParams = buildTurnstileAssistedParams(
    params.account,
    checkInUrl,
  )

  const assisted = await tempWindowTurnstileFetch(assistedParams)

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
        assisted.turnstile?.status === "not_present" &&
        !assisted.turnstile?.hasTurnstile
      ) {
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
  const { site_url, account_info, authType } = account

  return await fetchApi<CheckinRecord>(
    {
      baseUrl: site_url,
      auth: {
        authType: authType ?? AuthTypeEnum.AccessToken,
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

    return {
      status: CHECKIN_RESULT_STATUS.FAILED,
      rawMessage: responseMessage || undefined,
      messageKey: responseMessage
        ? undefined
        : AUTO_CHECKIN_PROVIDER_FALLBACK_MESSAGE_KEYS.checkinFailed,
      data: checkinResponse ?? undefined,
    }
  } catch (error: unknown) {
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

  const authType = account.authType || AuthTypeEnum.AccessToken

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
