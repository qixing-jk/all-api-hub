import {
  CHECK_IN_METHOD_STATUS_EVIDENCE_SOURCES,
  CHECK_IN_METHOD_STATUS_OUTCOMES,
  CHECK_IN_METHOD_TODAY_STATUSES,
  CHECK_IN_PROVIDER_READINESS_REASONS,
} from "~/constants/checkIn"
import { SITE_TYPES } from "~/constants/siteType"
import { isSub2ApiAuthPersistenceError } from "~/services/apiService/sub2api"
import {
  fetchSub2ApiProCheckInStatus,
  getSub2ApiRedeemCheckInErrorReason,
  submitSub2ApiProCheckIn,
} from "~/services/apiService/sub2api/redeemCheckIn"
import {
  SUB2API_REDEEM_CHECKIN_ERROR_REASONS,
  type Sub2ApiRedeemCheckInResultData,
  type Sub2ApiRedeemCheckInStatusData,
} from "~/services/apiService/sub2api/type"
import { composeAbortSignals } from "~/services/apiTransport/abortableTask"
import type { ApiServiceRequest } from "~/services/apiTransport/type"
import type {
  AutoCheckinProvider,
  AutoCheckinProviderContext,
} from "~/services/checkin/autoCheckin/providers/contracts"
import { detectWithStatusReadback } from "~/services/checkin/autoCheckin/providers/detection"
import {
  AUTO_CHECKIN_PROVIDER_FALLBACK_MESSAGE_KEYS,
  resolveProviderErrorResult,
} from "~/services/checkin/autoCheckin/providers/shared"
import type { AutoCheckinProviderResult } from "~/services/checkin/autoCheckin/providers/types"
import { AuthTypeEnum, type SiteAccount } from "~/types"
import { CHECKIN_RESULT_STATUS } from "~/types/autoCheckin"
import type { TempWindowRequestSource } from "~/types/tempWindowFetch"
import { normalizeTempWindowRequestSource } from "~/utils/browser/tempWindowRequestSource"

// Contract pinned to jiangmuran/sub2api_pro@3f858570 and Wei-Shaw/sub2api#510:
// GET /api/v1/redeem/checkin/status is the read-only probe; POST
// /api/v1/redeem/checkin executes the mutation. Numeric `code` mirrors the
// HTTP status; string `reason` is the authoritative discriminator.

const createRequest = (
  account: SiteAccount,
  tempWindowRequestSource?: TempWindowRequestSource,
  protectionBypassExecution?: AutoCheckinProviderContext["protectionBypassExecution"],
): ApiServiceRequest => ({
  baseUrl: account.site_url,
  accountId: account.id,
  auth: {
    authType: AuthTypeEnum.AccessToken,
    accessToken: account.account_info.access_token,
  },
  ...(tempWindowRequestSource ? { tempWindowRequestSource } : {}),
  ...(protectionBypassExecution ? { protectionBypassExecution } : {}),
})

const isSub2ApiAccount = (account: SiteAccount): boolean =>
  account.site_type === SITE_TYPES.SUB2API

const getStatus: NonNullable<AutoCheckinProvider["getStatus"]> = async ({
  account,
  request,
  observedAt,
  signal,
}) => {
  const statusRequest =
    request ?? (account ? createRequest(account, undefined) : undefined)
  if (!statusRequest) return undefined
  const composedSignal = composeAbortSignals([
    statusRequest.abortSignal,
    signal,
  ])
  let status: Sub2ApiRedeemCheckInStatusData
  try {
    status = await fetchSub2ApiProCheckInStatus({
      ...statusRequest,
      ...(composedSignal.signal ? { abortSignal: composedSignal.signal } : {}),
    })
  } finally {
    composedSignal.dispose()
  }
  return {
    outcome: CHECK_IN_METHOD_STATUS_OUTCOMES.Known,
    today: status.checked_in_today
      ? CHECK_IN_METHOD_TODAY_STATUSES.Checked
      : CHECK_IN_METHOD_TODAY_STATUSES.NotChecked,
    evidence: {
      source: CHECK_IN_METHOD_STATUS_EVIDENCE_SOURCES.Probe,
      observedAt,
    },
  }
}

/**
 * Maps a redeem check-in transport error to a controlled result when the
 * pinned protocol proves a stronger outcome, otherwise defers to the shared
 * error resolver. Rotated-credential persistence failures stop execution.
 */
const resolveRedeemCheckInErrorResult = (
  error: unknown,
): AutoCheckinProviderResult => {
  if (isSub2ApiAuthPersistenceError(error)) {
    // Credential rotation failed; the POST never reached the business handler.
    // Treat as a retryable failure so the next run re-attempts from GET.
    return {
      status: CHECKIN_RESULT_STATUS.FAILED,
      messageKey: AUTO_CHECKIN_PROVIDER_FALLBACK_MESSAGE_KEYS.checkinFailed,
    }
  }

  const reason = getSub2ApiRedeemCheckInErrorReason(error)
  if (reason === SUB2API_REDEEM_CHECKIN_ERROR_REASONS.DailyCheckinAlreadyDone) {
    return {
      status: CHECKIN_RESULT_STATUS.ALREADY_CHECKED,
      messageKey:
        AUTO_CHECKIN_PROVIDER_FALLBACK_MESSAGE_KEYS.alreadyCheckedToday,
    }
  }
  if (
    reason === SUB2API_REDEEM_CHECKIN_ERROR_REASONS.DailyCheckinDisabled ||
    reason === SUB2API_REDEEM_CHECKIN_ERROR_REASONS.DailyCheckinRoleForbidden
  ) {
    // Disabled (site-wide) and role-forbidden (per-user) both mean the method
    // cannot run for this account; skip rather than fail.
    return {
      status: CHECKIN_RESULT_STATUS.SKIPPED,
      messageKey:
        AUTO_CHECKIN_PROVIDER_FALLBACK_MESSAGE_KEYS.endpointNotSupported,
    }
  }
  return resolveProviderErrorResult({ error })
}

/**
 * Reconciles after an uncertain POST by reading the authoritative status.
 * checked → applied; not_checked → failed+retryable (no same-cycle repost);
 * unknown → failed (no ordinary retry for unresolved uncertain).
 */
const reconcileUncertainPost = async (
  request: ApiServiceRequest,
): Promise<AutoCheckinProviderResult> => {
  try {
    const status = await fetchSub2ApiProCheckInStatus(request)
    if (status.checked_in_today) {
      return {
        status: CHECKIN_RESULT_STATUS.SUCCESS,
        messageKey:
          AUTO_CHECKIN_PROVIDER_FALLBACK_MESSAGE_KEYS.checkinSuccessful,
        data: status,
      }
    }
    // Authoritative not-checked after an uncertain POST: the server did not
    // apply the mutation. Permit a later retry but never repost this cycle.
    return {
      status: CHECKIN_RESULT_STATUS.FAILED,
      messageKey: AUTO_CHECKIN_PROVIDER_FALLBACK_MESSAGE_KEYS.checkinFailed,
      data: status,
    }
  } catch {
    // Reconciliation itself failed; remain uncertain without ordinary retry.
    return {
      status: CHECKIN_RESULT_STATUS.FAILED,
      messageKey: AUTO_CHECKIN_PROVIDER_FALLBACK_MESSAGE_KEYS.unknownError,
    }
  }
}

const runCheckIn = async (
  request: ApiServiceRequest,
): Promise<AutoCheckinProviderResult> => {
  let result: Sub2ApiRedeemCheckInResultData
  try {
    result = await submitSub2ApiProCheckIn(request)
  } catch (error) {
    if (isSub2ApiAuthPersistenceError(error)) {
      return resolveRedeemCheckInErrorResult(error)
    }
    const reason = getSub2ApiRedeemCheckInErrorReason(error)
    if (
      reason === SUB2API_REDEEM_CHECKIN_ERROR_REASONS.DailyCheckinAlreadyDone ||
      reason === SUB2API_REDEEM_CHECKIN_ERROR_REASONS.DailyCheckinDisabled ||
      reason === SUB2API_REDEEM_CHECKIN_ERROR_REASONS.DailyCheckinRoleForbidden
    ) {
      // The pinned protocol proves a stronger outcome than uncertain dispatch.
      return resolveRedeemCheckInErrorResult(error)
    }
    // Uncertain dispatch (timeout, 5xx, unparseable, network). Perform one
    // bounded GET reconciliation; never blindly repost.
    return reconcileUncertainPost(request)
  }

  return {
    status: CHECKIN_RESULT_STATUS.SUCCESS,
    messageKey: AUTO_CHECKIN_PROVIDER_FALLBACK_MESSAGE_KEYS.checkinSuccessful,
    data: result,
  }
}

export const sub2ApiProvider: AutoCheckinProvider = {
  getReadiness(account) {
    if (!isSub2ApiAccount(account)) {
      return {
        ready: false,
        reason: CHECK_IN_PROVIDER_READINESS_REASONS.AccountDataMissing,
      }
    }
    return account.account_info?.access_token
      ? { ready: true }
      : {
          ready: false,
          reason: CHECK_IN_PROVIDER_READINESS_REASONS.CredentialsMissing,
        }
  },
  detect: (context) => detectWithStatusReadback(context, getStatus),
  getStatus,
  async checkIn(
    account,
    context: AutoCheckinProviderContext,
  ): Promise<AutoCheckinProviderResult> {
    const tempWindowRequestSource = normalizeTempWindowRequestSource(
      context.tempWindowRequestSource,
    )
    const siteAccount = account as SiteAccount
    const request = createRequest(
      siteAccount,
      tempWindowRequestSource,
      context.protectionBypassExecution,
    )
    try {
      return await runCheckIn(request)
    } catch (error) {
      return resolveRedeemCheckInErrorResult(error)
    }
  },
}
