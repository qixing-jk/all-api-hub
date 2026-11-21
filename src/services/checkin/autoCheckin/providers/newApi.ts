import {
  CHECK_IN_METHOD_UNKNOWN_REASON_CODES,
  CHECK_IN_PROVIDER_READINESS_REASONS,
} from "~/constants/checkIn"
import { getAccountLoginMethods } from "~/services/accountLogin/capabilities"
import {
  isAccountLoginConfigured,
  resolveAccountLogin,
} from "~/services/accountLogin/configCodec"
import type {
  NewApiCheckInRecord,
  NewApiCheckInResponse,
} from "~/services/apiService/newApiFamily/checkInDto"
import { newApiFamilyRequests } from "~/services/apiService/newApiFamily/request"
import {
  API_ERROR_CODES,
  ApiError,
  isAuthenticationRequiredError,
} from "~/services/apiTransport/errors"
import { completeSessionCheckIn } from "~/services/checkin/autoCheckin/confirmation"
import { getCheckInMethodUnknownReason } from "~/services/checkin/autoCheckin/errors"
import {
  CHECK_IN_STATUS_DAY_GUARD_OWNERS,
  type AutoCheckinProvider,
  type AutoCheckinProviderContext,
} from "~/services/checkin/autoCheckin/providers/contracts"
import { detectWithStatusReadback } from "~/services/checkin/autoCheckin/providers/detection"
import { resolveNativePageCheckinResult } from "~/services/checkin/autoCheckin/providers/newApiNativePage"
import {
  createCheckInRequest,
  fetchCheckedInTodayStatus,
  fetchSingleNewApiCheckInStatus,
  getProviderErrorMessage,
  isCheckInDisabled,
  probeCheckInRoute,
  readNewApiAwards,
  resolveCheckInEndpoint,
  resolveNewApiCheckInReadback,
  resolveStandardCheckinResult,
  toNewApiMethodStatus,
  withNewApiStatusConfirmation,
} from "~/services/checkin/autoCheckin/providers/newApiProtocol"
import {
  isTurnstileRelatedMessage,
  isTurnstileRequiredMessage,
  resolveTurnstileAssistedCheckinResult,
} from "~/services/checkin/autoCheckin/providers/newApiTurnstile"
import {
  AUTO_CHECKIN_PROVIDER_FALLBACK_MESSAGE_KEYS,
  AUTO_CHECKIN_USER_CHECKIN_ENDPOINT,
  getEffectiveAuthType,
  isAlreadyCheckedMessage,
  isPermissionFailureMessage,
  matchTerminalFailureReason,
  normalizeCheckinMessage,
  resolveProviderErrorResult,
} from "~/services/checkin/autoCheckin/providers/shared"
import type { AutoCheckinProviderOutcome } from "~/services/checkin/autoCheckin/providers/types"
import type { ProtectionBypassExecution } from "~/services/protectionBypass/contracts"
import type { SiteAccount } from "~/types"
import { AuthTypeEnum } from "~/types"
import {
  AUTO_CHECKIN_SKIP_REASON,
  CHECKIN_RESULT_STATUS,
  type AutoCheckinSkipReason,
} from "~/types/autoCheckin"
import type { TempWindowRequestSource } from "~/types/tempWindowFetch"
import { normalizeTempWindowRequestSource } from "~/utils/browser/tempWindowRequestSource"
import { formatLocalDayKey } from "~/utils/core/dayKey"

type CheckinResult = AutoCheckinProviderOutcome
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
  const statusCode = getErrorStatusCode(params.error)
  if (statusCode === 404 || statusCode === 405) return true

  const normalized = params.message.toLowerCase()
  return (
    normalized.includes("404") ||
    normalized.includes("method not allowed") ||
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
 * Call the account's check-in route to perform the daily check-in.
 */
async function performCheckin(
  account: SiteAccount,
  tempWindowRequestSource: TempWindowRequestSource,
  protectionBypassExecution: ProtectionBypassExecution,
  mutationLifecycle?: AutoCheckinProviderContext["mutationLifecycle"],
): Promise<NewApiCheckInResponse> {
  return await newApiFamilyRequests.envelope<NewApiCheckInRecord>(
    createCheckInRequest(
      account,
      tempWindowRequestSource,
      protectionBypassExecution,
      mutationLifecycle,
    ),
    {
      endpoint: resolveCheckInEndpoint(account),
      options: {
        method: "POST",
        body: "{}",
      },
    },
  )
}

/**
 * Resolve the persisted reason of a direct check-in rejection that already
 * carries upstream copy, so the row keeps a filterable classification.
 */
function resolveDirectFailureReason(params: {
  message: string
  error?: unknown
}): AutoCheckinSkipReason {
  if (isEndpointUnsupportedFailure(params)) {
    return AUTO_CHECKIN_SKIP_REASON.NO_PROVIDER
  }
  if (isPermissionFailureMessage(params.message)) {
    return AUTO_CHECKIN_SKIP_REASON.PERMISSION_DENIED
  }
  if (isAuthOrPermissionFailureMessage(params.message)) {
    return AUTO_CHECKIN_SKIP_REASON.AUTHENTICATION_REQUIRED
  }
  if (isRateLimitedMessage(params.message)) {
    return AUTO_CHECKIN_SKIP_REASON.UPSTREAM_ERROR
  }
  if (isTurnstileRelatedMessage(params.message)) {
    return AUTO_CHECKIN_SKIP_REASON.MANUAL_VERIFICATION_REQUIRED
  }

  return AUTO_CHECKIN_SKIP_REASON.UPSTREAM_ERROR
}

/**
 * Provider entry: execute check-in directly and normalize the response.
 */
async function checkinNewApi(
  account: SiteAccount,
  context: AutoCheckinProviderContext,
): Promise<CheckinResult> {
  const tempWindowRequestSource = normalizeTempWindowRequestSource(
    context.tempWindowRequestSource,
  )
  const configuredLogin = resolveAccountLogin(account)
  const nativeFallback = (responseMessage: string) =>
    resolveNativePageCheckinResult({
      account,
      responseMessage,
      tempWindowRequestSource,
      protectionBypassExecution: context.protectionBypassExecution,
      mutationLifecycle: context.mutationLifecycle,
      beforeRecoveredMutation: context.beforeRecoveredMutation,
    })
  if (configuredLogin) {
    // This provider owns status admission when it can prepare a login session.
    try {
      const status = await fetchCheckedInTodayStatus(
        account,
        tempWindowRequestSource,
        context.protectionBypassExecution,
        false,
        undefined,
        true,
      )
      if (status?.checkedInToday === true)
        return withNewApiStatusConfirmation(
          account,
          {
            status: CHECKIN_RESULT_STATUS.ALREADY_CHECKED,
            awards: readNewApiAwards(
              account,
              status.todayQuotaAwarded,
              status.todayCheckinDate,
              "stats.records[].quota_awarded",
            ),
          },
          status,
        )
      if (status?.enabled === false)
        return {
          status: CHECKIN_RESULT_STATUS.FAILED,
          reasonCode: AUTO_CHECKIN_SKIP_REASON.METHOD_DISABLED,
        }
      if (status?.checkedInToday !== false || status.enabled !== true)
        return nativeFallback("")
    } catch (error) {
      if (
        getErrorStatusCode(error) === 429 ||
        isRateLimitedMessage(getProviderErrorMessage(error))
      )
        return resolveProviderErrorResult({ error })
      return nativeFallback(getProviderErrorMessage(error))
    }
    if (
      context.beforeRecoveredMutation &&
      !(await context.beforeRecoveredMutation())
    )
      return {
        status: CHECKIN_RESULT_STATUS.SKIPPED,
        reasonCode: AUTO_CHECKIN_SKIP_REASON.AUTO_CHECKIN_DISABLED,
      }
  }
  try {
    const checkinResponse = await performCheckin(
      account,
      tempWindowRequestSource,
      context.protectionBypassExecution,
      context.mutationLifecycle,
    )
    const responseMessage = normalizeCheckinMessage(checkinResponse.message)
    let statusAfterFailure: Awaited<
      ReturnType<typeof fetchCheckedInTodayStatus>
    >

    if (!checkinResponse.success) {
      statusAfterFailure = await fetchCheckedInTodayStatus(
        account,
        tempWindowRequestSource,
        context.protectionBypassExecution,
      )
      if (statusAfterFailure?.enabled === false) {
        return withNewApiStatusConfirmation(
          account,
          {
            status: CHECKIN_RESULT_STATUS.FAILED,
            reasonCode: AUTO_CHECKIN_SKIP_REASON.METHOD_DISABLED,
            messageKey:
              AUTO_CHECKIN_PROVIDER_FALLBACK_MESSAGE_KEYS.checkinDisabled,
            rawMessage: responseMessage || undefined,
            data: checkinResponse,
          },
          statusAfterFailure,
        )
      }
      const terminalReason = matchTerminalFailureReason(responseMessage)
      if (
        (terminalReason === AUTO_CHECKIN_SKIP_REASON.AUTHENTICATION_REQUIRED &&
          !configuredLogin) ||
        terminalReason === AUTO_CHECKIN_SKIP_REASON.PERMISSION_DENIED
      )
        return withNewApiStatusConfirmation(
          account,
          {
            status: CHECKIN_RESULT_STATUS.FAILED,
            reasonCode: terminalReason,
            rawMessage: responseMessage,
            data: checkinResponse,
          },
          statusAfterFailure,
        )
      // An expired saved credential may recover through the configured login.
      const confirmed =
        terminalReason === AUTO_CHECKIN_SKIP_REASON.AUTHENTICATION_REQUIRED
          ? null
          : resolveNewApiCheckInReadback(statusAfterFailure, {
              account,
              data: checkinResponse.data,
            })
      if (confirmed) return confirmed
    }

    const standardResult = resolveStandardCheckinResult({
      account,
      payload: checkinResponse,
      message: responseMessage,
    })
    if (standardResult) {
      return standardResult
    }
    if (
      configuredLogin &&
      !checkinResponse.success &&
      isAuthOrPermissionFailureMessage(responseMessage) &&
      !isPermissionFailureMessage(responseMessage)
    )
      return nativeFallback(responseMessage)

    if (
      responseMessage &&
      isTurnstileRequiredMessage(responseMessage) &&
      !checkinResponse.success
    ) {
      if (configuredLogin) return nativeFallback(responseMessage)
      return await resolveTurnstileAssistedCheckinResult({
        account,
        responseMessage,
        tempWindowRequestSource,
        protectionBypassExecution: context.protectionBypassExecution,
      })
    }

    if (
      shouldAttemptNativePageCheckinFallback({
        success: checkinResponse.success,
        message: responseMessage,
      })
    ) {
      return await nativeFallback(responseMessage)
    }

    const directReason = resolveDirectFailureReason({
      message: responseMessage,
    })
    const result: CheckinResult = {
      status: CHECKIN_RESULT_STATUS.FAILED,
      reasonCode: directReason,
      rawMessage: responseMessage || undefined,
      messageKey: responseMessage
        ? undefined
        : AUTO_CHECKIN_PROVIDER_FALLBACK_MESSAGE_KEYS.checkinFailed,
      data: checkinResponse ?? undefined,
    }
    return statusAfterFailure
      ? withNewApiStatusConfirmation(account, result, statusAfterFailure)
      : result
  } catch (error: unknown) {
    // An attributed 401 confirms rejection; a lost response cannot permit replay.
    if (configuredLogin && isAuthenticationRequiredError(error))
      return nativeFallback(getProviderErrorMessage(error))
    if (context.mutationLifecycle?.dispatched) {
      const result = resolveProviderErrorResult({
        error,
        mutationDispatched: true,
      })
      // Configured login makes this provider own readback even when the direct
      // API path ran. A lost response must never start a native-page mutation.
      if (
        configuredLogin &&
        result.status === CHECKIN_RESULT_STATUS.UNCERTAIN
      ) {
        try {
          const status = await fetchCheckedInTodayStatus(
            account,
            tempWindowRequestSource,
            context.protectionBypassExecution,
            false,
            undefined,
            true,
          )
          const confirmed = resolveNewApiCheckInReadback(status, {
            account,
            status: CHECKIN_RESULT_STATUS.SUCCESS,
          })
          if (confirmed) return confirmed
          return withNewApiStatusConfirmation(account, result, status)
        } catch {
          // Unavailable readback leaves the original dispatch uncertain.
        }
      }
      return result
    }

    const errorMessage = getProviderErrorMessage(error)
    if (
      await isCheckInDisabled(
        createCheckInRequest(
          account,
          tempWindowRequestSource,
          context.protectionBypassExecution,
        ),
      )
    ) {
      return resolveProviderErrorResult({
        error,
        mutationDispatched: context.mutationLifecycle?.dispatched,
      })
    }
    if (
      shouldAttemptNativePageCheckinFallback({
        success: false,
        message: errorMessage,
        error,
      })
    ) {
      return await nativeFallback(errorMessage)
    }

    return resolveProviderErrorResult({
      error,
      mutationDispatched: context.mutationLifecycle?.dispatched,
    })
  }
}

/**
 * Determine whether this account has the required configuration for check-in.
 */
function getReadiness(account: SiteAccount) {
  if (!account.account_info?.id) {
    return {
      ready: false,
      reason: CHECK_IN_PROVIDER_READINESS_REASONS.AccountDataMissing,
    } as const
  }

  const authType = getEffectiveAuthType(account)
  const login = resolveAccountLogin(account)
  if (login && isAccountLoginConfigured(login, getAccountLoginMethods(account)))
    return { ready: true } as const

  if (authType === AuthTypeEnum.AccessToken) {
    return account.account_info?.access_token
      ? ({ ready: true } as const)
      : ({
          ready: false,
          reason: CHECK_IN_PROVIDER_READINESS_REASONS.CredentialsMissing,
        } as const)
  }

  return { ready: true } as const
}

/**
 * Exported provider implementation for `site_type = new-api`.
 */
const getStatus: NonNullable<AutoCheckinProvider["getStatus"]> = async ({
  account,
  request,
  observedAt,
  signal,
  dayBoundaryGuardOwner,
}) => {
  const startedDay = formatLocalDayKey()
  const readStatus =
    dayBoundaryGuardOwner === CHECK_IN_STATUS_DAY_GUARD_OWNERS.Caller
      ? fetchSingleNewApiCheckInStatus
      : fetchCheckedInTodayStatus
  const observation = await readStatus(
    account,
    undefined,
    undefined,
    true,
    signal,
    true,
    request,
  )
  const readObservedAt =
    observation &&
    "observedAt" in observation &&
    typeof observation.observedAt === "number"
      ? observation.observedAt
      : observedAt
  // Preserve caller probe metadata unless a rollover required a new day's read.
  return toNewApiMethodStatus(
    observation,
    observation && startedDay !== formatLocalDayKey(new Date(readObservedAt))
      ? readObservedAt
      : observedAt,
  )
}

/** Classifies legacy permission envelopes without treating them as support evidence. */
function classifyStatusError(error: unknown) {
  // New API's auth middleware uses AUTH_INSUFFICIENT_PRIVILEGE; older
  // deployments (including AgentRouter) return only the localized message.
  // https://github.com/QuantumNous/new-api/blob/2d8e50bf36e94200b809dfb39e73624ec48b1e23/middleware/auth.go
  if (
    error instanceof ApiError &&
    error.code === API_ERROR_CODES.BUSINESS_ERROR &&
    (error.statusCode === undefined || error.statusCode === 200) &&
    (error.upstreamCode === "AUTH_INSUFFICIENT_PRIVILEGE" ||
      error.message.trim() === "无权进行此操作，权限不足" ||
      error.message.trim() === "Permission denied. Insufficient privileges.")
  ) {
    return CHECK_IN_METHOD_UNKNOWN_REASON_CODES.PermissionDenied
  }
  return getCheckInMethodUnknownReason(error)
}

export const newApiProvider: AutoCheckinProvider = {
  requiresAuthoritativeStatusBeforeMutation: true,
  ownsStatusAdmission: (account) => Boolean(resolveAccountLogin(account)),
  supportsRouteOverride: true,
  canonicalRoutePath: AUTO_CHECKIN_USER_CHECKIN_ENDPOINT,
  probeRouteOverride: ({ account, path, signal }) =>
    probeCheckInRoute({
      account,
      path,
      ...(signal ? { signal } : {}),
      observedAt: Date.now(),
    }),
  classifyStatusError,
  getReadiness,
  detect: (context) =>
    detectWithStatusReadback(context, getStatus, classifyStatusError),
  getStatus,
  async checkIn(account, context) {
    const siteAccount = account as SiteAccount
    const outcome = await checkinNewApi(siteAccount, context)
    return resolveAccountLogin(siteAccount)
      ? completeSessionCheckIn(siteAccount, outcome)
      : outcome
  },
}
