import { normalizeAccountIdentity } from "~/services/accounts/identity/accountIdentity"
import {
  fetchCheckedInTodayStatus,
  getProviderErrorMessage,
  NEW_API_MESSAGE_KEYS,
  resolveCheckInUrl,
  resolveTurnstilePreTrigger,
} from "~/services/checkin/autoCheckin/providers/newApiProtocol"
import {
  AUTO_CHECKIN_PROVIDER_FALLBACK_MESSAGE_KEYS,
  getEffectiveAuthType,
  readQuotaReward,
} from "~/services/checkin/autoCheckin/providers/shared"
import type { AutoCheckinProviderOutcome } from "~/services/checkin/autoCheckin/providers/types"
import type { ProtectionBypassExecution } from "~/services/protectionBypass/contracts"
import type { SiteAccount } from "~/types"
import {
  AUTO_CHECKIN_SKIP_REASON,
  CHECKIN_RESULT_STATUS,
} from "~/types/autoCheckin"
import type {
  TempWindowCheckinPageAction,
  TempWindowRequestSource,
} from "~/types/tempWindowFetch"
import { tempWindowTriggerCheckinPageAction } from "~/utils/browser/tempWindowFetch"
import { safeRandomUUID } from "~/utils/core/identifier"

type CheckinResult = AutoCheckinProviderOutcome
const NATIVE_PAGE_STATUS_POLL_TIMEOUT_MS = 8_000
const NATIVE_PAGE_STATUS_POLL_INTERVAL_MS = 1_000
/**
 * Poll the server-side check-in status after a native page click.
 */
async function pollCheckedInTodayStatus(
  account: SiteAccount,
  tempWindowRequestSource: TempWindowRequestSource,
  protectionBypassExecution: ProtectionBypassExecution,
): ReturnType<typeof fetchCheckedInTodayStatus> {
  const deadline = Date.now() + NATIVE_PAGE_STATUS_POLL_TIMEOUT_MS
  let lastStatus: Awaited<ReturnType<typeof fetchCheckedInTodayStatus>>

  while (Date.now() <= deadline) {
    lastStatus = await fetchCheckedInTodayStatus(
      account,
      tempWindowRequestSource,
      protectionBypassExecution,
    )
    if (lastStatus?.checkedInToday === true) return lastStatus

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
 * Map native page trigger failures to provider-facing fallback keys.
 */
function resolveNativePageFailureResult(params: {
  action: TempWindowCheckinPageAction
  checkInUrl: string
}): CheckinResult {
  const identityReasonCode =
    params.action.reason === "identity_missing" ||
    params.action.reason === "identity_mismatch"
      ? AUTO_CHECKIN_SKIP_REASON.AUTHENTICATION_REQUIRED
      : null
  const base = {
    status: CHECKIN_RESULT_STATUS.FAILED,
    reasonCode:
      identityReasonCode ?? AUTO_CHECKIN_SKIP_REASON.CHECKIN_PAGE_UNAVAILABLE,
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
export async function resolveNativePageCheckinResult(params: {
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
  const expectedUserId = normalizeAccountIdentity(
    params.account.account_info?.id,
  )

  if (!expectedUserId) {
    return {
      status: CHECKIN_RESULT_STATUS.FAILED,
      reasonCode: AUTO_CHECKIN_SKIP_REASON.AUTHENTICATION_REQUIRED,
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
      tempWindowRequestSource: params.tempWindowRequestSource,
      protectionBypassExecution: params.protectionBypassExecution,
    })
  } catch (error: unknown) {
    const errorMessage = getProviderErrorMessage(error)
    return {
      status: CHECKIN_RESULT_STATUS.FAILED,
      reasonCode: AUTO_CHECKIN_SKIP_REASON.CHECKIN_PAGE_UNAVAILABLE,
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

  const observedAfterNativeAction = await pollCheckedInTodayStatus(
    params.account,
    params.tempWindowRequestSource,
    params.protectionBypassExecution,
  )
  if (observedAfterNativeAction?.checkedInToday === true) {
    return {
      status: CHECKIN_RESULT_STATUS.ALREADY_CHECKED,
      messageKey:
        AUTO_CHECKIN_PROVIDER_FALLBACK_MESSAGE_KEYS.alreadyCheckedToday,
      reward: readQuotaReward(observedAfterNativeAction.todayQuotaAwarded),
      data: action,
    }
  }

  return {
    status: CHECKIN_RESULT_STATUS.FAILED,
    reasonCode: AUTO_CHECKIN_SKIP_REASON.CHECKIN_UNCONFIRMED,
    messageKey: NEW_API_MESSAGE_KEYS.nativePageStatusUnconfirmed,
    messageParams: { checkInUrl },
    rawMessage: action.error || undefined,
    data: action,
  }
}
