import { TURNSTILE_DEFAULT_WAIT_TIMEOUT_MS } from "~/constants/turnstile"
import type { NewApiCheckInResponse } from "~/services/apiService/newApiFamily/checkInDto"
import { buildCompatUserIdHeaders } from "~/services/apiTransport/compatHeaders"
import { REQUEST_CONFIG } from "~/services/apiTransport/constant"
import {
  fetchCheckedInTodayStatus,
  NEW_API_MESSAGE_KEYS,
  resolveCheckInUrl,
  resolveStandardCheckinResult,
  resolveTurnstilePreTrigger,
} from "~/services/checkin/autoCheckin/providers/newApiProtocol"
import {
  AUTO_CHECKIN_PROVIDER_FALLBACK_MESSAGE_KEYS,
  AUTO_CHECKIN_USER_CHECKIN_ENDPOINT,
  getEffectiveAuthType,
  normalizeCheckinMessage,
  readQuotaReward,
} from "~/services/checkin/autoCheckin/providers/shared"
import type { AutoCheckinProviderOutcome } from "~/services/checkin/autoCheckin/providers/types"
import type { ProtectionBypassExecution } from "~/services/protectionBypass/contracts"
import type { SiteAccount } from "~/types"
import { AuthTypeEnum } from "~/types"
import {
  AUTO_CHECKIN_SKIP_REASON,
  CHECKIN_RESULT_STATUS,
} from "~/types/autoCheckin"
import type {
  TempWindowRequestSource,
  TempWindowTurnstileFetch,
} from "~/types/tempWindowFetch"
import { isAllowedIncognitoAccess } from "~/utils/browser/browserApi"
import { tempWindowTurnstileFetch } from "~/utils/browser/tempWindowFetch"
import { joinUrl } from "~/utils/core/url"

type CheckinResult = AutoCheckinProviderOutcome
const ENDPOINT = AUTO_CHECKIN_USER_CHECKIN_ENDPOINT
const TURNSTILE_ASSIST_TIMEOUT_MS = TURNSTILE_DEFAULT_WAIT_TIMEOUT_MS
/**
 * Determine whether a check-in failure message indicates Turnstile verification is required.
 */
export function isTurnstileRequiredMessage(message: string): boolean {
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
export function isTurnstileRelatedMessage(message: string): boolean {
  return message.toLowerCase().includes("turnstile")
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
  tempWindowRequestSource: TempWindowRequestSource,
  protectionBypassExecution: ProtectionBypassExecution,
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
    tempWindowRequestSource,
    protectionBypassExecution,
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
      reasonCode: AUTO_CHECKIN_SKIP_REASON.MANUAL_VERIFICATION_REQUIRED,
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
    | NewApiCheckInResponse
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
export async function resolveTurnstileAssistedCheckinResult(params: {
  account: SiteAccount
  responseMessage: string
  tempWindowRequestSource: TempWindowRequestSource
  protectionBypassExecution: ProtectionBypassExecution
}): Promise<CheckinResult> {
  const checkInUrl = await resolveCheckInUrl(params.account)
  if (!checkInUrl) {
    return {
      status: CHECKIN_RESULT_STATUS.FAILED,
      reasonCode: AUTO_CHECKIN_SKIP_REASON.CHECKIN_PAGE_UNAVAILABLE,
      messageKey: AUTO_CHECKIN_PROVIDER_FALLBACK_MESSAGE_KEYS.checkinFailed,
      rawMessage: params.responseMessage,
    }
  }
  const assistedParams = buildTurnstileAssistedParams(
    params.account,
    checkInUrl,
    params.tempWindowRequestSource,
    params.protectionBypassExecution,
  )

  const initialAttempt = await runPreferredTurnstileAssistedAttempt({
    account: params.account,
    assistedParams,
  })
  let assisted = initialAttempt.assisted

  if (!assisted) {
    return {
      status: CHECKIN_RESULT_STATUS.FAILED,
      reasonCode: AUTO_CHECKIN_SKIP_REASON.CHECKIN_PAGE_UNAVAILABLE,
      messageKey: AUTO_CHECKIN_PROVIDER_FALLBACK_MESSAGE_KEYS.checkinFailed,
      rawMessage: params.responseMessage,
      data: assisted ?? undefined,
    }
  }

  if (!assisted.success) {
    if (assisted.turnstile?.status !== "token_obtained") {
      const observedAfterAssistFailure = await fetchCheckedInTodayStatus(
        params.account,
        params.tempWindowRequestSource,
        params.protectionBypassExecution,
      )
      if (observedAfterAssistFailure?.checkedInToday === true) {
        return {
          status: CHECKIN_RESULT_STATUS.ALREADY_CHECKED,
          messageKey:
            AUTO_CHECKIN_PROVIDER_FALLBACK_MESSAGE_KEYS.alreadyCheckedToday,
          reward: readQuotaReward(observedAfterAssistFailure.todayQuotaAwarded),
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
            | NewApiCheckInResponse
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
            reasonCode: AUTO_CHECKIN_SKIP_REASON.MANUAL_VERIFICATION_REQUIRED,
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
        reasonCode: AUTO_CHECKIN_SKIP_REASON.MANUAL_VERIFICATION_REQUIRED,
        data: assisted ?? undefined,
      }
    }

    return {
      status: CHECKIN_RESULT_STATUS.FAILED,
      reasonCode: AUTO_CHECKIN_SKIP_REASON.UPSTREAM_ERROR,
      rawMessage: assisted.error || params.responseMessage || undefined,
      messageKey: assisted.error
        ? undefined
        : AUTO_CHECKIN_PROVIDER_FALLBACK_MESSAGE_KEYS.checkinFailed,
      data: assisted ?? undefined,
    }
  }

  const assistedPayload = assisted.data as NewApiCheckInResponse | undefined
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
    const observedAfterAssist = await fetchCheckedInTodayStatus(
      params.account,
      params.tempWindowRequestSource,
      params.protectionBypassExecution,
    )
    if (observedAfterAssist?.checkedInToday === true) {
      return {
        status: CHECKIN_RESULT_STATUS.ALREADY_CHECKED,
        messageKey:
          AUTO_CHECKIN_PROVIDER_FALLBACK_MESSAGE_KEYS.alreadyCheckedToday,
        reward: readQuotaReward(observedAfterAssist.todayQuotaAwarded),
        data: assistedPayload ?? undefined,
      }
    }

    return {
      status: CHECKIN_RESULT_STATUS.FAILED,
      messageKey: NEW_API_MESSAGE_KEYS.turnstileManualRequired,
      messageParams: { checkInUrl },
      rawMessage: params.responseMessage || assistedMessage || undefined,
      reasonCode: AUTO_CHECKIN_SKIP_REASON.MANUAL_VERIFICATION_REQUIRED,
      data: assistedPayload ?? undefined,
    }
  }

  return {
    status: CHECKIN_RESULT_STATUS.FAILED,
    reasonCode: AUTO_CHECKIN_SKIP_REASON.UPSTREAM_ERROR,
    rawMessage: assistedMessage || undefined,
    messageKey: assistedMessage
      ? undefined
      : AUTO_CHECKIN_PROVIDER_FALLBACK_MESSAGE_KEYS.checkinFailed,
    data: assistedPayload ?? undefined,
  }
}
