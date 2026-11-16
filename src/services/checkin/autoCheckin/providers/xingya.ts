import { BROWSER_LOGIN_STATUS } from "~/constants/browserLogin"
import {
  CHECK_IN_METHOD_AVAILABILITIES,
  CHECK_IN_METHOD_DETECTION_EVIDENCE_SOURCES,
  CHECK_IN_METHOD_DETECTION_OUTCOMES,
  CHECK_IN_METHOD_STATUS_EVIDENCE_SOURCES,
  CHECK_IN_METHOD_STATUS_OUTCOMES,
  CHECK_IN_METHOD_TODAY_STATUSES,
  CHECK_IN_METHOD_UNKNOWN_REASON_CODES,
  CHECK_IN_PROVIDER_READINESS_REASONS,
} from "~/constants/checkIn"
import { loginAccount } from "~/services/accountLogin"
import { getAccountLoginMethods } from "~/services/accountLogin/capabilities"
import {
  isAccountLoginConfigured,
  resolveAccountLogin,
} from "~/services/accountLogin/configCodec"
import {
  createNewApiAuthenticatedSessionRequest,
  NewApiSessionIdentityError,
} from "~/services/apiAdapters/newApi/account/authenticatedSession"
import { newApiFamilyRequests } from "~/services/apiService/newApiFamily/request"
import {
  XINGYA_CHECK_IN_STATUS_ENDPOINT,
  XINGYA_DAILY_CLAIM_ENDPOINT,
} from "~/services/apiService/newApiFamily/variants/xingyaCheckInProtocol"
import { API_ERROR_CODES, ApiError } from "~/services/apiTransport/errors"
import {
  API_DIRECT_REQUEST_REASONS,
  type ApiServiceRequest,
} from "~/services/apiTransport/type"
import {
  CHECK_IN_CONFIRMATION_KINDS,
  completeSessionCheckIn,
  confirmCheckInAttempt,
  withCheckInConfirmation,
} from "~/services/checkin/autoCheckin/confirmation"
import type {
  AutoCheckinProvider,
  AutoCheckinProviderContext,
} from "~/services/checkin/autoCheckin/providers/contracts"
import {
  detectWithStatusReadback,
  readProviderDetectResult,
} from "~/services/checkin/autoCheckin/providers/detection"
import {
  AUTO_CHECKIN_PROVIDER_FALLBACK_MESSAGE_KEYS,
  createTerminalFailureResult,
  createUpstreamFailureResult,
  getEffectiveAuthType,
  normalizeCheckinMessage,
  readQuotaReward,
  resolveCheckinLoginFailure,
  resolveNativePageFailureResult,
  resolveProviderErrorResult,
} from "~/services/checkin/autoCheckin/providers/shared"
import type { AutoCheckinProviderOutcome } from "~/services/checkin/autoCheckin/providers/types"
import { readDayStableCheckInObservation } from "~/services/checkin/statusObservation"
import type { SiteAccount } from "~/types"
import { AuthTypeEnum } from "~/types"
import {
  AUTO_CHECKIN_SKIP_REASON,
  CHECKIN_RESULT_STATUS,
} from "~/types/autoCheckin"
import {
  TEMP_WINDOW_CHECKIN_PAGE_ACTION_REASONS,
  TEMP_WINDOW_REQUEST_SOURCES,
} from "~/types/tempWindowFetch"
import { safeRandomUUID } from "~/utils/core/identifier"
import { isRecord } from "~/utils/core/object"

/**
 * 星芽 fork check-in status payload (`GET /api/user/xingya-checkin`).
 *
 * Verified 2026-10-25 on https://xingya.site (`version: "xingya-rc46"`): the
 * console polls this read-only route (staleTime 15s / refetch 60s) and never
 * posts through it.
 */
export interface XingyaCheckInStatusData {
  /** Administrator claim switch; the console button is dead while false. */
  claim_enabled: boolean
  /** Whether this account may use the check-in group. */
  group_accessible: boolean
  /** Extra claim rounds the administrator opened for today. */
  claim_round: number
  today: string
  today_record: {
    checked_in: boolean
    quota_awarded: number
    source: string
  }
  min_reward: number
  max_reward: number
  wallet: { available: number }
}

/** Claim mutation response; `already_claimed` mirrors the console's toast gate. */
type XingyaClaimData = {
  already_claimed: boolean
  quota_awarded: number
}

/**
 * The fork refuses its claim route to every non-session credential.
 *
 * Observed body: `{success:false, code:"AUTH_SESSION_REQUIRED", message:"a
 * dashboard login session is required"}`. The status route accepts the same
 * scoped token, so only execution needs the browser session.
 */
function isSessionRequiredFailure(message: string, code?: unknown): boolean {
  return (
    code === "AUTH_SESSION_REQUIRED" ||
    /dashboard login session is required|AUTH_SESSION_REQUIRED/i.test(message)
  )
}

/** Builds the authenticated request shared by 星芽 check-in operations. */
function createXingyaCheckInRequest(
  account: SiteAccount,
  context: Pick<AutoCheckinProviderContext, "tempWindowRequestSource"> &
    Partial<
      Pick<
        AutoCheckinProviderContext,
        "mutationLifecycle" | "protectionBypassExecution"
      >
    >,
): ApiServiceRequest {
  return {
    baseUrl: account.site_url,
    accountId: account.id,
    cookieAuthSessionCookie: account.cookieAuth?.sessionCookie,
    auth: {
      authType: getEffectiveAuthType(account),
      userId: account.account_info.id,
      accessToken: account.account_info.access_token,
    },
    tempWindowRequestSource: context.tempWindowRequestSource,
    ...(context.protectionBypassExecution
      ? { protectionBypassExecution: context.protectionBypassExecution }
      : { directRequestReason: API_DIRECT_REQUEST_REASONS.ProviderProtocol }),
    ...(context.mutationLifecycle
      ? { observer: context.mutationLifecycle }
      : {}),
  }
}

/** Strict reader: a usable status must carry today's record and the switches. */
function readStatusData(
  data: XingyaCheckInStatusData | undefined,
): XingyaCheckInStatusData | undefined {
  if (
    !isRecord(data) ||
    typeof data.claim_enabled !== "boolean" ||
    typeof data.group_accessible !== "boolean" ||
    !isRecord(data.today_record) ||
    typeof data.today_record.checked_in !== "boolean"
  ) {
    return undefined
  }
  return data
}

const getStatus: NonNullable<AutoCheckinProvider["getStatus"]> = async ({
  account,
  request,
  observedAt,
  signal,
}) => {
  if (
    !request &&
    account &&
    (getEffectiveAuthType(account) === AuthTypeEnum.Cookie ||
      !account.account_info.access_token)
  )
    return undefined
  const statusRequest =
    request ??
    (account
      ? createXingyaCheckInRequest(account, {
          tempWindowRequestSource: TEMP_WINDOW_REQUEST_SOURCES.Background,
        })
      : undefined)
  if (!statusRequest) return undefined
  const response = await newApiFamilyRequests.envelope<
    XingyaCheckInStatusData | undefined
  >(statusRequest, {
    endpoint: XINGYA_CHECK_IN_STATUS_ENDPOINT,
    options: { method: "GET", cache: "no-store", signal },
  })
  const data =
    response.success === true ? readStatusData(response.data) : undefined
  if (!data) return undefined
  return toXingyaMethodStatus(data, observedAt)
}

/** Map group access and today's record into the shared status model. */
function toXingyaMethodStatus(
  data: XingyaCheckInStatusData,
  observedAt: number,
) {
  return {
    outcome: CHECK_IN_METHOD_STATUS_OUTCOMES.Known,
    availability:
      data.claim_enabled && data.group_accessible
        ? CHECK_IN_METHOD_AVAILABILITIES.Enabled
        : CHECK_IN_METHOD_AVAILABILITIES.Disabled,
    today: data.today_record.checked_in
      ? CHECK_IN_METHOD_TODAY_STATUSES.Checked
      : CHECK_IN_METHOD_TODAY_STATUSES.NotChecked,
    evidence: {
      source: CHECK_IN_METHOD_STATUS_EVIDENCE_SOURCES.Probe,
      observedAt,
    },
  }
}

/** Verify today's state and claim while the login context remains owned. */
async function checkInUsingLoginSession(
  account: SiteAccount,
  context: AutoCheckinProviderContext,
  login: NonNullable<ReturnType<typeof resolveAccountLogin>>,
): Promise<AutoCheckinProviderOutcome> {
  let outcome: AutoCheckinProviderOutcome | undefined
  const result = await loginAccount({
    account,
    methodId: login.methodId,
    requestId: safeRandomUUID("xingya-checkin"),
    attended: context.protectionBypassExecution.kind !== "automatic",
    async onAuthenticated(session) {
      try {
        const request = await createNewApiAuthenticatedSessionRequest(
          session,
          account,
        )
        outcome = await performXingyaSessionCheckin(account, context, request)
      } catch (error) {
        if (error instanceof NewApiSessionIdentityError) {
          outcome = resolveNativePageFailureResult({
            action: {
              success: false,
              reason:
                error.kind === "missing"
                  ? TEMP_WINDOW_CHECKIN_PAGE_ACTION_REASONS.IdentityMissing
                  : TEMP_WINDOW_CHECKIN_PAGE_ACTION_REASONS.IdentityMismatch,
            },
            checkInUrl: account.site_url,
          })
          return
        }
        outcome = resolveProviderErrorResult({
          error,
          mutationDispatched: context.mutationLifecycle?.dispatched,
        })
      }
    },
  })
  if (result.status === BROWSER_LOGIN_STATUS.Authenticated && outcome)
    return outcome
  if (context.mutationLifecycle?.dispatched)
    return {
      status: CHECKIN_RESULT_STATUS.UNCERTAIN,
      reasonCode: AUTO_CHECKIN_SKIP_REASON.CHECKIN_UNCONFIRMED,
    }
  return resolveCheckinLoginFailure(result, account.site_url)
}

/** Only a successful envelope can admit or confirm a session-owned claim. */
async function fetchXingyaSessionStatus(request: ApiServiceRequest) {
  const response = await newApiFamilyRequests.envelope<XingyaCheckInStatusData>(
    request,
    {
      endpoint: XINGYA_CHECK_IN_STATUS_ENDPOINT,
      options: { method: "GET", cache: "no-store" },
    },
  )
  return response.success === true ? readStatusData(response.data) : undefined
}

/** Gate one claim with status and current intent, then reconcile with reads only. */
async function performXingyaSessionCheckin(
  account: SiteAccount,
  context: AutoCheckinProviderContext,
  request: ApiServiceRequest,
): Promise<AutoCheckinProviderOutcome> {
  const statusRead = await readDayStableCheckInObservation(() =>
    fetchXingyaSessionStatus(request),
  )
  if (!statusRead)
    return createTerminalFailureResult({
      reasonCode: AUTO_CHECKIN_SKIP_REASON.STATUS_UNAVAILABLE,
    })
  const status = statusRead.observation
  if (status.today_record.checked_in)
    return withCheckInConfirmation(
      account,
      {
        status: CHECKIN_RESULT_STATUS.ALREADY_CHECKED,
        reward: readQuotaReward(status.today_record.quota_awarded),
        data: status,
        messageKey:
          AUTO_CHECKIN_PROVIDER_FALLBACK_MESSAGE_KEYS.alreadyCheckedToday,
      },
      {
        kind: CHECK_IN_CONFIRMATION_KINDS.Observed,
        status: toXingyaMethodStatus(status, statusRead.observedAt),
      },
    )
  if (!status.claim_enabled || !status.group_accessible)
    return createTerminalFailureResult({
      reasonCode: AUTO_CHECKIN_SKIP_REASON.METHOD_DISABLED,
    })
  if (
    context.beforeRecoveredMutation &&
    !(await context.beforeRecoveredMutation())
  )
    return createTerminalFailureResult({
      reasonCode: AUTO_CHECKIN_SKIP_REASON.AUTO_CHECKIN_DISABLED,
    })

  const startedAt = Date.now()
  const outcome = await performXingyaClaim(account, context, request)
  const execution = await confirmCheckInAttempt({
    account,
    result: outcome,
    startedAt,
    readStatus: async () => {
      const data = await fetchXingyaSessionStatus(request)
      return data
        ? {
            status: toXingyaMethodStatus(data, Date.now()),
            reward: data.today_record.checked_in
              ? readQuotaReward(data.today_record.quota_awarded)
              : undefined,
          }
        : undefined
    },
  })
  return { ...execution.result, confirmation: execution.confirmation }
}

export const xingyaProvider: AutoCheckinProvider = {
  // The claim is not proven idempotent; today's status must gate the POST.
  requiresAuthoritativeStatusBeforeMutation: true,
  ownsStatusAdmission: (account) => Boolean(resolveAccountLogin(account)),
  getReadiness(account) {
    if (!account.account_info?.id) {
      return {
        ready: false,
        reason: CHECK_IN_PROVIDER_READINESS_REASONS.AccountDataMissing,
      }
    }
    const login = resolveAccountLogin(account)
    if (login)
      return isAccountLoginConfigured(login, getAccountLoginMethods(account))
        ? { ready: true }
        : {
            ready: false,
            reason: CHECK_IN_PROVIDER_READINESS_REASONS.CredentialsMissing,
          }
    if (getEffectiveAuthType(account) === AuthTypeEnum.AccessToken) {
      return account.account_info?.access_token
        ? { ready: true }
        : {
            ready: false,
            reason: CHECK_IN_PROVIDER_READINESS_REASONS.CredentialsMissing,
          }
    }
    return {
      ready: false,
      reason: CHECK_IN_PROVIDER_READINESS_REASONS.CredentialsMissing,
    }
  },
  async detect(context) {
    const account = context.account
    if (!account) return detectWithStatusReadback(context, getStatus)
    const statusResult =
      getEffectiveAuthType(account) !== AuthTypeEnum.Cookie &&
      account.account_info.access_token
        ? await detectWithStatusReadback(context, getStatus)
        : undefined
    if (
      statusResult &&
      readProviderDetectResult(statusResult).detection.outcome !==
        CHECK_IN_METHOD_DETECTION_OUTCOMES.Unknown
    )
      return statusResult

    // Shared auth middleware may reject an unrelated dedicated route before
    // checking whether it exists. A valid public marker distinguishes that
    // deployment without logging in or borrowing another origin's credentials.
    try {
      const status = await newApiFamilyRequests.envelope<unknown>(
        {
          baseUrl: account.site_url,
          auth: { authType: AuthTypeEnum.None },
          directRequestReason: API_DIRECT_REQUEST_REASONS.ProviderProtocol,
          ...(context.request?.fetchContext
            ? { fetchContext: context.request.fetchContext }
            : {}),
          ...(context.request?.currentTabFallback
            ? { currentTabFallback: context.request.currentTabFallback }
            : {}),
        },
        {
          endpoint: "/api/status",
          options: { method: "GET", signal: context.signal },
        },
      )
      if (
        status.success !== true ||
        !isRecord(status.data) ||
        (Object.hasOwn(status.data, "xingya_checkin_available") &&
          typeof status.data.xingya_checkin_available !== "boolean")
      )
        return (
          statusResult ?? {
            outcome: CHECK_IN_METHOD_DETECTION_OUTCOMES.Unknown,
            reason: CHECK_IN_METHOD_UNKNOWN_REASON_CODES.InvalidResponse,
            attemptedAt: context.observedAt,
          }
        )
      return {
        outcome:
          typeof status.data.xingya_checkin_available === "boolean"
            ? CHECK_IN_METHOD_DETECTION_OUTCOMES.Matched
            : CHECK_IN_METHOD_DETECTION_OUTCOMES.Unsupported,
        evidence: {
          source: CHECK_IN_METHOD_DETECTION_EVIDENCE_SOURCES.Probe,
          observedAt: context.observedAt,
        },
      }
    } catch (error) {
      if (statusResult) return statusResult
      throw error
    }
  },
  getStatus,
  async checkIn(account, context) {
    if ("site_type" in account) {
      const login = resolveAccountLogin(account)
      if (login)
        return completeSessionCheckIn(
          account,
          await checkInUsingLoginSession(account, context, login),
        )
    }
    return performXingyaClaim(account as SiteAccount, context)
  },
}

/** Submit one claim and preserve an unconfirmed mutation for readback. */
async function performXingyaClaim(
  account: SiteAccount,
  context: AutoCheckinProviderContext,
  sessionRequest?: ApiServiceRequest,
): Promise<AutoCheckinProviderOutcome> {
  try {
    const claimResponse = await newApiFamilyRequests.envelope<
      XingyaClaimData | undefined
    >(
      sessionRequest
        ? { ...sessionRequest, observer: context.mutationLifecycle }
        : createXingyaCheckInRequest(account, context),
      {
        endpoint: XINGYA_DAILY_CLAIM_ENDPOINT,
        options: { method: "POST" },
      },
    )
    // A successful HTTP response without the protocol outcome cannot prove
    // rejection. Keep the claim uncertain so the session can confirm by reads.
    if (!isRecord(claimResponse) || typeof claimResponse.success !== "boolean")
      return {
        status: CHECKIN_RESULT_STATUS.UNCERTAIN,
        reasonCode: AUTO_CHECKIN_SKIP_REASON.CHECKIN_UNCONFIRMED,
      }
    const message = normalizeCheckinMessage(claimResponse.message)

    if (claimResponse.success !== true) {
      // The fork declares its claim route as a browser-session-only route
      // (`accessTokenRuleSession` upstream): a scoped `nap_` access token
      // reads the status route but is refused the mutation with
      // `403 AUTH_SESSION_REQUIRED`. Retrying cannot succeed, so this is a
      // terminal sign-in requirement, not a retryable upstream refusal.
      // Verified 2026-10-26 on https://xingya.site.
      if (isSessionRequiredFailure(message, claimResponse.code)) {
        return createTerminalFailureResult({
          reasonCode: AUTO_CHECKIN_SKIP_REASON.AUTHENTICATION_REQUIRED,
          rawMessage: message || undefined,
          data: claimResponse.data,
        })
      }
      return createUpstreamFailureResult({
        rawMessage: message,
        data: claimResponse.data,
      })
    }

    if (
      !isRecord(claimResponse.data) ||
      typeof claimResponse.data.already_claimed !== "boolean"
    )
      return {
        status: CHECKIN_RESULT_STATUS.UNCERTAIN,
        reasonCode: AUTO_CHECKIN_SKIP_REASON.CHECKIN_UNCONFIRMED,
        data: claimResponse.data,
      }

    if (claimResponse.data.already_claimed === true) {
      return {
        status: CHECKIN_RESULT_STATUS.ALREADY_CHECKED,
        rawMessage: message || undefined,
        messageKey: message
          ? undefined
          : AUTO_CHECKIN_PROVIDER_FALLBACK_MESSAGE_KEYS.alreadyCheckedToday,
        // The repeat answer still reports the day's authoritative award.
        reward: readQuotaReward(claimResponse.data.quota_awarded),
        data: claimResponse.data,
      }
    }

    return {
      status: CHECKIN_RESULT_STATUS.SUCCESS,
      rawMessage: message || undefined,
      messageKey: message
        ? undefined
        : AUTO_CHECKIN_PROVIDER_FALLBACK_MESSAGE_KEYS.checkinSuccessful,
      reward: readQuotaReward(claimResponse.data.quota_awarded),
      data: claimResponse.data,
    }
  } catch (error: unknown) {
    if (
      error instanceof ApiError &&
      error.code === API_ERROR_CODES.BUSINESS_ERROR &&
      !error.unattributedMessage &&
      isSessionRequiredFailure(error.message, error.upstreamCode)
    )
      return createTerminalFailureResult({
        reasonCode: AUTO_CHECKIN_SKIP_REASON.AUTHENTICATION_REQUIRED,
        rawMessage: error.message,
      })
    return resolveProviderErrorResult({
      error,
      mutationDispatched: context.mutationLifecycle?.dispatched,
    })
  }
}
