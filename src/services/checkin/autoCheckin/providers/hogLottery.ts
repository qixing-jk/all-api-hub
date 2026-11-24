import { BROWSER_LOGIN_STATUS } from "~/constants/browserLogin"
import {
  CHECK_IN_METHOD_DETECTION_EVIDENCE_SOURCES,
  CHECK_IN_METHOD_DETECTION_OUTCOMES,
  CHECK_IN_METHOD_STATUS_EVIDENCE_SOURCES,
  CHECK_IN_METHOD_STATUS_OUTCOMES,
  CHECK_IN_PROVIDER_READINESS_REASONS,
} from "~/constants/checkIn"
import { loginAccount } from "~/services/accountLogin"
import { getAccountLoginMethods } from "~/services/accountLogin/capabilities"
import {
  isAccountLoginConfigured,
  resolveAccountLogin,
} from "~/services/accountLogin/configCodec"
import { createAccountApiRequestFromStoredAccount } from "~/services/accounts/utils/apiServiceRequest"
import {
  ASSET_KINDS,
  AWARD_FULFILLMENT,
  AWARD_TARGETS,
} from "~/services/amounts/financialConstants"
import {
  createNewApiAuthenticatedSessionRequest,
  NewApiSessionIdentityError,
} from "~/services/apiAdapters/newApi/account/authenticatedSession"
import { newApiQuotaAsset } from "~/services/apiService/newApiFamily/quotaAsset"
import {
  fetchHogLotteryConfigured,
  fetchHogLotteryPublicMarker,
  fetchHogLotteryStatus,
  performHogLotteryDraw,
  type HogLotteryStatus,
} from "~/services/apiService/newApiFamily/variants/hogDailyLottery"
import {
  getHogLotteryPeriodKey,
  HOG_LOTTERY_ENDPOINTS,
} from "~/services/apiService/newApiFamily/variants/hogDailyLotteryProtocol"
import { API_ERROR_CODES, ApiError } from "~/services/apiTransport/errors"
import {
  API_DIRECT_REQUEST_REASONS,
  type ApiServiceRequest,
} from "~/services/apiTransport/type"
import { accountAward } from "~/services/checkin/autoCheckin/awards"
import {
  CHECK_IN_CONFIRMATION_KINDS,
  completeSessionCheckIn,
  createUnconfirmedCheckInResult,
  withCheckInConfirmation,
} from "~/services/checkin/autoCheckin/confirmation"
import type {
  AutoCheckinProvider,
  AutoCheckinProviderContext,
} from "~/services/checkin/autoCheckin/providers/contracts"
import { detectWithStatusReadback } from "~/services/checkin/autoCheckin/providers/detection"
import {
  createTerminalFailureResult,
  AUTO_CHECKIN_PROVIDER_FALLBACK_MESSAGE_KEYS as messages,
  resolveCheckinLoginFailure,
  resolveProviderErrorResult,
} from "~/services/checkin/autoCheckin/providers/shared"
import type { AutoCheckinProviderOutcome } from "~/services/checkin/autoCheckin/providers/types"
import { AuthTypeEnum, type SiteAccount } from "~/types"
import {
  AUTO_CHECKIN_SKIP_REASON,
  CHECKIN_RESULT_STATUS,
} from "~/types/autoCheckin"
import { safeRandomUUID } from "~/utils/core/identifier"

const toStatus = (
  status: HogLotteryStatus,
  enabled: boolean,
  observedAt: number,
) =>
  ({
    outcome: CHECK_IN_METHOD_STATUS_OUTCOMES.Known,
    availability: enabled ? "enabled" : "disabled",
    today: status.remaining === 0 ? "checked" : "not_checked",
    evidence: {
      source: CHECK_IN_METHOD_STATUS_EVIDENCE_SOURCES.Probe,
      observedAt,
    },
  }) as const

/**
 *
 */
/** Read the current lottery status and derive its availability. */
async function readStatus(request: ApiServiceRequest) {
  const period = getHogLotteryPeriodKey(Date.now())
  const status = await fetchHogLotteryStatus(request)
  const enabled =
    status.remaining === 0 || (await fetchHogLotteryConfigured(request))
  if (period !== getHogLotteryPeriodKey(Date.now()))
    throw new Error("Hog status crossed its day boundary")
  return { status, methodStatus: toStatus(status, enabled, Date.now()) }
}

const getStatus: NonNullable<AutoCheckinProvider["getStatus"]> = async (
  context,
) => {
  const request =
    context.request ??
    (context.account
      ? createAccountApiRequestFromStoredAccount(context.account).request
      : undefined)
  if (!request) return undefined
  const result = await readStatus({
    ...request,
    ...(context.signal ? { abortSignal: context.signal } : {}),
  })
  return result.methodStatus
}

/** The owned session survives through admission, one free draw, and readback. */
async function drawInSession(
  account: SiteAccount,
  context: AutoCheckinProviderContext,
  request: ApiServiceRequest,
): Promise<AutoCheckinProviderOutcome> {
  const admittedPeriod = getHogLotteryPeriodKey(Date.now())
  const before = await readStatus(request)
  if (admittedPeriod !== getHogLotteryPeriodKey(Date.now()))
    return createUnconfirmedCheckInResult(account)
  if (before.status.remaining === 0) {
    return withCheckInConfirmation(
      account,
      {
        status: CHECKIN_RESULT_STATUS.ALREADY_CHECKED,
        messageKey: messages.alreadyCheckedToday,
      },
      {
        kind: CHECK_IN_CONFIRMATION_KINDS.Observed,
        status: before.methodStatus,
      },
    )
  }
  if (before.methodStatus.availability !== "enabled")
    return createTerminalFailureResult({
      reasonCode: AUTO_CHECKIN_SKIP_REASON.METHOD_DISABLED,
    })
  if (
    context.beforeRecoveredMutation &&
    !(await context.beforeRecoveredMutation())
  )
    return createTerminalFailureResult({
      reasonCode: AUTO_CHECKIN_SKIP_REASON.ACCOUNT_UNAVAILABLE,
    })
  if (admittedPeriod !== getHogLotteryPeriodKey(Date.now()))
    return createUnconfirmedCheckInResult(account)

  const startedAt = Date.now()
  let mutationError: unknown
  let applied: Awaited<ReturnType<typeof performHogLotteryDraw>> | undefined
  try {
    applied = await performHogLotteryDraw({
      ...request,
      observer: context.mutationLifecycle,
    })
  } catch (error) {
    mutationError = error
  }
  // A duplicate or lost response is never permission to send another draw.
  let after: Awaited<ReturnType<typeof readStatus>>
  try {
    after = await readStatus(request)
  } catch {
    return createUnconfirmedCheckInResult(account)
  }
  if (admittedPeriod !== getHogLotteryPeriodKey(Date.now()))
    return createUnconfirmedCheckInResult(account)
  if (
    mutationError instanceof ApiError &&
    mutationError.upstreamCode === "LOTTERY_DAILY_LIMIT_REACHED"
  ) {
    return after.status.remaining === 0
      ? withCheckInConfirmation(
          account,
          {
            status: CHECKIN_RESULT_STATUS.ALREADY_CHECKED,
            messageKey: messages.alreadyCheckedToday,
          },
          {
            kind: CHECK_IN_CONFIRMATION_KINDS.Observed,
            status: after.methodStatus,
          },
        )
      : createUnconfirmedCheckInResult(account)
  }
  // A definite rejection cannot make another tab's concurrent draw ours.
  if (
    mutationError instanceof ApiError &&
    (mutationError.code === API_ERROR_CODES.BUSINESS_ERROR ||
      (mutationError.statusCode !== undefined &&
        mutationError.statusCode >= 400 &&
        mutationError.statusCode < 500))
  )
    return resolveProviderErrorResult({ error: mutationError })
  const draw = after.status.my_draw
  const confirmedResponse =
    applied &&
    draw &&
    applied.quotaAmount === draw.quotaAmount &&
    applied.prizeName === draw.prizeName &&
    applied.prizeLabel === draw.prizeLabel
  const confirmedLostResponse =
    !applied &&
    context.mutationLifecycle?.dispatched === true &&
    draw &&
    Date.parse(draw.createdAt) >= startedAt
  if (
    after.status.remaining === 0 &&
    draw &&
    (confirmedResponse || confirmedLostResponse)
  ) {
    return withCheckInConfirmation(
      account,
      {
        status: CHECKIN_RESULT_STATUS.SUCCESS,
        messageKey: messages.checkinSuccessful,
        awards: [
          accountAward(account, {
            id: "daily-draw",
            operation: HOG_LOTTERY_ENDPOINTS.Status,
            field: "my_draw.quotaAmount",
            value: draw.quotaAmount,
            asset: {
              kind: ASSET_KINDS.Quota,
              ...newApiQuotaAsset(account.site_url),
            },
            target: AWARD_TARGETS.Wallet,
            fulfillment: AWARD_FULFILLMENT.Credited,
            event: { namespace: "hog-daily-draw", id: admittedPeriod },
          }),
        ],
      },
      {
        kind: CHECK_IN_CONFIRMATION_KINDS.Observed,
        status: after.methodStatus,
      },
    )
  }
  if (mutationError && after.status.remaining === 1) {
    return resolveProviderErrorResult({
      error: mutationError,
      mutationDispatched: context.mutationLifecycle?.dispatched,
    })
  }
  return createUnconfirmedCheckInResult(account)
}

/** Implements a free daily draw using a verified, transient account session. */
export const hogLotteryProvider: AutoCheckinProvider = {
  requiresAuthoritativeStatusBeforeMutation: true,
  // Management PATs cannot read this protocol; only the verified dashboard session can.
  ownsStatusAdmission: () => true,
  getReadiness(account) {
    if (!account.account_info?.id)
      return {
        ready: false,
        reason: CHECK_IN_PROVIDER_READINESS_REASONS.AccountDataMissing,
      }
    const login = resolveAccountLogin(account)
    return login &&
      isAccountLoginConfigured(login, getAccountLoginMethods(account))
      ? { ready: true }
      : {
          ready: false,
          reason: CHECK_IN_PROVIDER_READINESS_REASONS.CredentialsMissing,
        }
  },
  async detect(context) {
    const baseUrl = context.account?.site_url ?? context.request?.baseUrl
    if (baseUrl) {
      try {
        if (
          await fetchHogLotteryPublicMarker({
            baseUrl,
            auth: { authType: AuthTypeEnum.None },
            directRequestReason: API_DIRECT_REQUEST_REASONS.Passive,
            ...(context.signal ? { abortSignal: context.signal } : {}),
          })
        )
          return {
            outcome: CHECK_IN_METHOD_DETECTION_OUTCOMES.Matched,
            evidence: {
              source: CHECK_IN_METHOD_DETECTION_EVIDENCE_SOURCES.Probe,
              observedAt: context.observedAt,
            },
          }
      } catch {
        /* A failed notice cannot settle authenticated protocol support. */
      }
    }
    return detectWithStatusReadback(context, getStatus)
  },
  getStatus,
  async checkIn(account, context) {
    const site = account as SiteAccount
    const login = resolveAccountLogin(site)
    if (!login || !this.getReadiness(site).ready)
      return createTerminalFailureResult({
        reasonCode: AUTO_CHECKIN_SKIP_REASON.CREDENTIALS_MISSING,
      })
    let outcome: AutoCheckinProviderOutcome | undefined
    const loginResult = await loginAccount({
      account: site,
      methodId: login.methodId,
      requestId: safeRandomUUID("hog-free-draw"),
      attended: context.protectionBypassExecution.kind !== "automatic",
      async onAuthenticated(session) {
        try {
          const request = await createNewApiAuthenticatedSessionRequest(
            session,
            site,
          )
          if (request.auth.authType !== AuthTypeEnum.AccessToken)
            throw new NewApiSessionIdentityError("missing")
          outcome = await drawInSession(site, context, request)
        } catch (error) {
          outcome = resolveProviderErrorResult({
            error,
            mutationDispatched: context.mutationLifecycle?.dispatched,
          })
        }
      },
    })
    if (loginResult.status === BROWSER_LOGIN_STATUS.Authenticated && outcome)
      return completeSessionCheckIn(site, outcome)
    if (context.mutationLifecycle?.dispatched)
      return createUnconfirmedCheckInResult(site)
    return completeSessionCheckIn(
      site,
      resolveCheckinLoginFailure(loginResult, site.site_url),
    )
  },
}
