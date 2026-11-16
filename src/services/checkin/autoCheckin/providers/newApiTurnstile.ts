import { TURNSTILE_DEFAULT_WAIT_TIMEOUT_MS } from "~/constants/turnstile"
import type { NewApiCheckInResponse } from "~/services/apiService/newApiFamily/checkInDto"
import { buildCompatUserIdHeaders } from "~/services/apiTransport/compatHeaders"
import { REQUEST_CONFIG } from "~/services/apiTransport/constant"
import {
  fetchCheckedInTodayStatus,
  NEW_API_MESSAGE_KEYS,
  resolveCheckInEndpoint,
  resolveCheckInUrl,
  resolveNewApiCheckInReadback,
  resolveStandardCheckinResult,
  resolveTurnstilePreTrigger,
  toNewApiMethodStatus,
  withNewApiStatusConfirmation,
} from "~/services/checkin/autoCheckin/providers/newApiProtocol"
import {
  AUTO_CHECKIN_PROVIDER_FALLBACK_MESSAGE_KEYS,
  createTerminalFailureResult,
  getEffectiveAuthType,
  matchTerminalFailureReason,
  normalizeCheckinMessage,
  readQuotaReward,
} from "~/services/checkin/autoCheckin/providers/shared"
import type { AutoCheckinProviderOutcome } from "~/services/checkin/autoCheckin/providers/types"
import { reconcileCheckInResult } from "~/services/checkin/autoCheckin/resultReconciliation"
import type { ProtectionBypassExecution } from "~/services/protectionBypass/contracts"
import type { SiteAccount } from "~/types"
import { AuthTypeEnum } from "~/types"
import {
  AUTO_CHECKIN_SKIP_REASON,
  CHECKIN_RESULT_STATUS,
  getAutoCheckinSkipReasonTranslationKey,
} from "~/types/autoCheckin"
import type {
  TempWindowRequestSource,
  TempWindowTurnstileFetch,
} from "~/types/tempWindowFetch"
import { TEMP_WINDOW_TURNSTILE_STATUSES } from "~/types/tempWindowFetch"
import { isAllowedIncognitoAccess } from "~/utils/browser/runtime"
import { tempWindowTurnstileFetch } from "~/utils/browser/tempWindowFetch"
import { joinUrl } from "~/utils/core/url"

type CheckinResult = AutoCheckinProviderOutcome
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
 * Fetch options used for the Turnstile-assisted replay of the account's check-in route.
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
  const fetchUrl = joinUrl(account.site_url, resolveCheckInEndpoint(account))

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

type AssistedParams = ReturnType<typeof buildTurnstileAssistedParams>
type AssistedAttempt = {
  response: TempWindowTurnstileFetch | null
  result: CheckinResult
}

/** Interpret one transport reply independently of which window produced it. */
function resolveAssistedResponse(
  account: SiteAccount,
  assisted: TempWindowTurnstileFetch | null,
  checkInUrl: string,
  responseMessage: string,
): CheckinResult {
  if (!assisted)
    return {
      status: CHECKIN_RESULT_STATUS.FAILED,
      reasonCode: AUTO_CHECKIN_SKIP_REASON.CHECKIN_PAGE_UNAVAILABLE,
      messageKey: AUTO_CHECKIN_PROVIDER_FALLBACK_MESSAGE_KEYS.checkinFailed,
      rawMessage: responseMessage,
      data: undefined,
    }
  const payload = assisted.data as NewApiCheckInResponse | undefined
  const message = normalizeCheckinMessage(payload?.message)
  // HTTP failures retain the parsed provider refusal in the transport payload.
  const terminalReason =
    payload?.success === false && matchTerminalFailureReason(message)
  if (
    terminalReason === AUTO_CHECKIN_SKIP_REASON.AUTHENTICATION_REQUIRED ||
    terminalReason === AUTO_CHECKIN_SKIP_REASON.PERMISSION_DENIED
  )
    return createTerminalFailureResult({
      reasonCode: terminalReason,
      rawMessage: message,
      data: payload,
    })
  if (assisted.success) {
    const standard = resolveStandardCheckinResult({ account, payload, message })
    if (standard) return standard
  }
  const tokenObtained =
    assisted.turnstile?.status === TEMP_WINDOW_TURNSTILE_STATUSES.TokenObtained
  if (!tokenObtained && (!assisted.success || assisted.turnstile?.status)) {
    return {
      status: CHECKIN_RESULT_STATUS.FAILED,
      reasonCode: AUTO_CHECKIN_SKIP_REASON.MANUAL_VERIFICATION_REQUIRED,
      messageKey:
        AUTO_CHECKIN_PROVIDER_FALLBACK_MESSAGE_KEYS.nativePageVerificationRequired,
      messageParams: { checkInUrl },
      rawMessage: assisted.success
        ? responseMessage || message || undefined
        : assisted.error || responseMessage || undefined,
      data: assisted.success ? payload : assisted,
    }
  }
  // A replay without a protocol refusal may still have applied the claim.
  return {
    status:
      payload?.success === false
        ? CHECKIN_RESULT_STATUS.FAILED
        : CHECKIN_RESULT_STATUS.UNCERTAIN,
    reasonCode: AUTO_CHECKIN_SKIP_REASON.UPSTREAM_ERROR,
    rawMessage: assisted.success
      ? message || undefined
      : assisted.error || responseMessage || undefined,
    messageKey: (assisted.success ? message : assisted.error)
      ? undefined
      : payload?.success === false
        ? AUTO_CHECKIN_PROVIDER_FALLBACK_MESSAGE_KEYS.checkinFailed
        : getAutoCheckinSkipReasonTranslationKey(
            AUTO_CHECKIN_SKIP_REASON.UPSTREAM_ERROR,
          ),
    data: assisted.success ? payload : assisted,
  }
}

/** Both preferred and fallback windows settle through the same authenticated readback. */
async function runTurnstileAssistedAttempt(input: {
  account: SiteAccount
  assistedParams: AssistedParams
  useIncognito: boolean
  responseMessage: string
}): Promise<AssistedAttempt> {
  const response = await tempWindowTurnstileFetch({
    ...input.assistedParams,
    ...(input.useIncognito ? { useIncognito: true } : {}),
  })
  const result = resolveAssistedResponse(
    input.account,
    response,
    input.assistedParams.pageUrl,
    input.responseMessage,
  )
  if (
    !response ||
    (result.status !== CHECKIN_RESULT_STATUS.FAILED &&
      result.status !== CHECKIN_RESULT_STATUS.UNCERTAIN)
  )
    return { response, result }

  // The page may have submitted its own claim before our replay consumed a token.
  try {
    const observation = await fetchCheckedInTodayStatus(
      input.account,
      input.assistedParams.tempWindowRequestSource,
      input.assistedParams.protectionBypassExecution,
    )
    const reconciled = reconcileCheckInResult({
      result,
      status: toNewApiMethodStatus(observation, Date.now()),
      reward: observation?.checkedInToday
        ? readQuotaReward(observation.todayQuotaAwarded)
        : undefined,
    })
    if (reconciled.status !== CHECKIN_RESULT_STATUS.FAILED) {
      const confirmed = resolveNewApiCheckInReadback(observation, {
        account: input.account,
        data: result.data,
      })
      if (confirmed) return { response, result: confirmed }
    }
    return {
      response,
      result: withNewApiStatusConfirmation(input.account, result, observation),
    }
  } catch {
    // Unavailable readback preserves the original verification/replay failure.
  }
  return { response, result }
}

/** A confirmed outcome or a replay response is stronger than a missing-widget failure. */
function hasDecisiveAssistedResult(attempt: AssistedAttempt): boolean {
  return (
    attempt.result.status !== CHECKIN_RESULT_STATUS.FAILED ||
    attempt.response?.success === true ||
    attempt.response?.turnstile?.status ===
      TEMP_WINDOW_TURNSTILE_STATUSES.TokenObtained
  )
}

/** Choose at most one fallback context; each attempt owns reply parsing and readback. */
export async function resolveTurnstileAssistedCheckinResult(params: {
  account: SiteAccount
  responseMessage: string
  tempWindowRequestSource: TempWindowRequestSource
  protectionBypassExecution: ProtectionBypassExecution
}): Promise<CheckinResult> {
  const checkInUrl = await resolveCheckInUrl(params.account)
  if (!checkInUrl)
    return {
      status: CHECKIN_RESULT_STATUS.FAILED,
      reasonCode: AUTO_CHECKIN_SKIP_REASON.CHECKIN_PAGE_UNAVAILABLE,
      messageKey: AUTO_CHECKIN_PROVIDER_FALLBACK_MESSAGE_KEYS.checkinFailed,
      rawMessage: params.responseMessage,
    }
  const assistedParams = buildTurnstileAssistedParams(
    params.account,
    checkInUrl,
    params.tempWindowRequestSource,
    params.protectionBypassExecution,
  )
  const incognitoAllowed =
    getEffectiveAuthType(params.account) === AuthTypeEnum.AccessToken
      ? await isAllowedIncognitoAccess()
      : null
  const useIncognito = incognitoAllowed === true
  const attemptInput = {
    account: params.account,
    assistedParams,
    responseMessage: params.responseMessage,
  }
  const initial = await runTurnstileAssistedAttempt({
    ...attemptInput,
    useIncognito,
  })
  if (!initial.response || hasDecisiveAssistedResult(initial))
    return initial.result

  if (!useIncognito) {
    // A page inherited from another account may no longer render the widget.
    if (
      initial.response.turnstile?.status !==
        TEMP_WINDOW_TURNSTILE_STATUSES.NotPresent ||
      initial.response.turnstile.hasTurnstile
    )
      return initial.result
    if ((incognitoAllowed ?? (await isAllowedIncognitoAccess())) === false)
      return {
        ...initial.result,
        messageKey: NEW_API_MESSAGE_KEYS.turnstileIncognitoAccessRequired,
        messageParams: { checkInUrl },
        data: initial.response,
      }
  }
  const fallback = await runTurnstileAssistedAttempt({
    ...attemptInput,
    useIncognito: !useIncognito,
  })
  if (hasDecisiveAssistedResult(fallback)) return fallback.result
  // Retain the actionable message, but only the last attempt can supply final evidence.
  const { confirmation: _initialConfirmation, ...result } = initial.result
  return fallback.result.confirmation
    ? { ...result, confirmation: fallback.result.confirmation }
    : result
}
