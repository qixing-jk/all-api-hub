import {
  CHECK_IN_METHOD_AVAILABILITIES,
  CHECK_IN_METHOD_STATUS_EVIDENCE_SOURCES,
  CHECK_IN_METHOD_STATUS_OUTCOMES,
  CHECK_IN_METHOD_TODAY_STATUSES,
  CHECK_IN_METHOD_UNKNOWN_REASON_CODES,
  CHECK_IN_PROVIDER_READINESS_REASONS,
} from "~/constants/checkIn"
import type {
  NewApiCheckInRecord,
  NewApiCheckInResponse,
} from "~/services/apiService/newApiFamily/checkInDto"
import { newApiFamilyRequests } from "~/services/apiService/newApiFamily/request"
import { API_ERROR_CODES, ApiError } from "~/services/apiTransport/errors"
import { getCheckInMethodUnknownReason } from "~/services/checkin/autoCheckin/errors"
import type {
  AutoCheckinProvider,
  AutoCheckinProviderContext,
} from "~/services/checkin/autoCheckin/providers/contracts"
import { detectWithStatusReadback } from "~/services/checkin/autoCheckin/providers/detection"
import { resolveNativePageCheckinResult } from "~/services/checkin/autoCheckin/providers/newApiNativePage"
import {
  createCheckInRequest,
  fetchCheckedInTodayStatus,
  getProviderErrorMessage,
  isCheckInDisabled,
  resolveStandardCheckinResult,
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
  normalizeCheckinMessage,
  readQuotaReward,
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

const ENDPOINT = AUTO_CHECKIN_USER_CHECKIN_ENDPOINT
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
 * Call POST /api/user/checkin to perform the daily check-in.
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
      endpoint: ENDPOINT,
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
  try {
    const checkinResponse = await performCheckin(
      account,
      tempWindowRequestSource,
      context.protectionBypassExecution,
      context.mutationLifecycle,
    )
    const responseMessage = normalizeCheckinMessage(checkinResponse.message)

    if (!checkinResponse.success) {
      const statusAfterFailure = await fetchCheckedInTodayStatus(
        account,
        tempWindowRequestSource,
        context.protectionBypassExecution,
      )
      if (statusAfterFailure?.enabled === false) {
        return {
          status: CHECKIN_RESULT_STATUS.FAILED,
          reasonCode: AUTO_CHECKIN_SKIP_REASON.METHOD_DISABLED,
          messageKey:
            AUTO_CHECKIN_PROVIDER_FALLBACK_MESSAGE_KEYS.checkinDisabled,
          rawMessage: responseMessage || undefined,
          data: checkinResponse,
        }
      }
      if (statusAfterFailure?.checkedInToday === true) {
        return {
          status: CHECKIN_RESULT_STATUS.ALREADY_CHECKED,
          rawMessage: responseMessage || undefined,
          reward: readQuotaReward(statusAfterFailure.todayQuotaAwarded),
          data: checkinResponse.data,
        }
      }
    }

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
      return await resolveNativePageCheckinResult({
        account,
        responseMessage,
        tempWindowRequestSource,
        protectionBypassExecution: context.protectionBypassExecution,
      })
    }

    const directReason = resolveDirectFailureReason({
      message: responseMessage,
    })
    return {
      status: CHECKIN_RESULT_STATUS.FAILED,
      reasonCode: directReason,
      rawMessage: responseMessage || undefined,
      messageKey: responseMessage
        ? undefined
        : AUTO_CHECKIN_PROVIDER_FALLBACK_MESSAGE_KEYS.checkinFailed,
      data: checkinResponse ?? undefined,
    }
  } catch (error: unknown) {
    if (context.mutationLifecycle?.dispatched) {
      return resolveProviderErrorResult({
        error,
        mutationDispatched: true,
      })
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
      return await resolveNativePageCheckinResult({
        account,
        responseMessage: errorMessage,
        tempWindowRequestSource,
        protectionBypassExecution: context.protectionBypassExecution,
      })
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
}) => {
  const observation = await fetchCheckedInTodayStatus(
    account,
    undefined,
    undefined,
    true,
    signal,
    true,
    request,
  )
  return observation
    ? {
        outcome: CHECK_IN_METHOD_STATUS_OUTCOMES.Known,
        availability: observation.enabled
          ? CHECK_IN_METHOD_AVAILABILITIES.Enabled
          : CHECK_IN_METHOD_AVAILABILITIES.Disabled,
        ...(typeof observation.checkedInToday === "boolean"
          ? {
              today: observation.checkedInToday
                ? CHECK_IN_METHOD_TODAY_STATUSES.Checked
                : CHECK_IN_METHOD_TODAY_STATUSES.NotChecked,
            }
          : {}),
        evidence: {
          source: CHECK_IN_METHOD_STATUS_EVIDENCE_SOURCES.Probe,
          observedAt,
        },
      }
    : undefined
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
  classifyStatusError,
  getReadiness,
  detect: (context) =>
    detectWithStatusReadback(context, getStatus, classifyStatusError),
  getStatus,
  checkIn: checkinNewApi,
}
