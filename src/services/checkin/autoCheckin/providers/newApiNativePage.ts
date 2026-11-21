import {
  BROWSER_LOGIN_STATUS,
  LOGIN_VERIFICATION_REASONS,
} from "~/constants/browserLogin"
import { RuntimeActionIds } from "~/constants/runtimeActions"
import { loginAccount } from "~/services/accountLogin"
import { resolveAccountLogin } from "~/services/accountLogin/configCodec"
import { normalizeAccountIdentity } from "~/services/accounts/identity/accountIdentity"
import type { AccountAuthenticatedSession } from "~/services/apiAdapters/contracts/accountLogin"
import {
  createNewApiAuthenticatedSessionRequest,
  NewApiSessionIdentityError,
} from "~/services/apiAdapters/newApi/account/authenticatedSession"
import type { ApiServiceRequest } from "~/services/apiTransport/type"
import type { AutoCheckinProviderContext } from "~/services/checkin/autoCheckin/providers/contracts"
import {
  fetchCheckedInTodayStatus,
  getProviderErrorMessage,
  readNewApiAwards,
  resolveCheckInUrl,
  resolveNewApiCheckInReadback,
  resolveTurnstilePreTrigger,
  withNewApiStatusConfirmation,
} from "~/services/checkin/autoCheckin/providers/newApiProtocol"
import {
  AUTO_CHECKIN_PROVIDER_FALLBACK_MESSAGE_KEYS,
  getEffectiveAuthType,
  resolveCheckinLoginFailure,
  resolveNativePageFailureResult,
  resolveProviderErrorResult,
} from "~/services/checkin/autoCheckin/providers/shared"
import type { AutoCheckinProviderOutcome } from "~/services/checkin/autoCheckin/providers/types"
import type { ProtectionBypassExecution } from "~/services/protectionBypass/contracts"
import type { SiteAccount } from "~/types"
import {
  AUTO_CHECKIN_SKIP_REASON,
  CHECKIN_RESULT_STATUS,
} from "~/types/autoCheckin"
import {
  TEMP_WINDOW_CHECKIN_PAGE_ACTION_REASONS,
  type TempWindowCheckinPageAction,
  type TempWindowRequestSource,
} from "~/types/tempWindowFetch"
import type { CheckinPageActionTriggerResult } from "~/types/turnstile"
import { TURNSTILE_PRE_TRIGGER_KINDS } from "~/types/turnstile"
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
  request?: ApiServiceRequest,
): ReturnType<typeof fetchCheckedInTodayStatus> {
  const deadline = Date.now() + NATIVE_PAGE_STATUS_POLL_TIMEOUT_MS
  let lastStatus: Awaited<ReturnType<typeof fetchCheckedInTodayStatus>>

  while (Date.now() <= deadline) {
    lastStatus = await fetchCheckedInTodayStatus(
      account,
      tempWindowRequestSource,
      protectionBypassExecution,
      false,
      request?.abortSignal,
      Boolean(request),
      request,
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

/** Dependencies shared by saved-session and configured-login page actions. */
type NativePageParams = {
  account: SiteAccount
  responseMessage: string
  tempWindowRequestSource: TempWindowRequestSource
  protectionBypassExecution: ProtectionBypassExecution
  mutationLifecycle?: AutoCheckinProviderContext["mutationLifecycle"]
  beforeRecoveredMutation?: AutoCheckinProviderContext["beforeRecoveredMutation"]
}

/** Prepares the target account and lets its native page own PoW and verification. */
async function checkInWithAccountSession(
  params: NativePageParams,
  checkInUrl: string,
  login: NonNullable<ReturnType<typeof resolveAccountLogin>>,
): Promise<CheckinResult> {
  let outcome: CheckinResult | undefined
  let attempted = false
  const result = await loginAccount({
    account: params.account,
    methodId: login.methodId,
    requestId: safeRandomUUID(`native-checkin-${params.account.id}`),
    attended: params.protectionBypassExecution.kind !== "automatic",
    async onAuthenticated(session) {
      try {
        outcome = await performNativeSessionCheckin(
          params,
          checkInUrl,
          session,
          () => {
            attempted = true
            params.mutationLifecycle?.onDispatch()
          },
        )
      } catch (error) {
        if (attempted) {
          outcome = {
            status: CHECKIN_RESULT_STATUS.UNCERTAIN,
            reasonCode: AUTO_CHECKIN_SKIP_REASON.CHECKIN_UNCONFIRMED,
          }
          return
        }
        if (error instanceof NewApiSessionIdentityError) {
          outcome = resolveNativePageFailureResult({
            action: {
              success: false,
              reason:
                error.kind === "missing"
                  ? TEMP_WINDOW_CHECKIN_PAGE_ACTION_REASONS.IdentityMissing
                  : TEMP_WINDOW_CHECKIN_PAGE_ACTION_REASONS.IdentityMismatch,
            },
            checkInUrl,
          })
          return
        }
        outcome = resolveProviderErrorResult({
          error,
          mutationDispatched: attempted,
        })
      }
    },
  })
  if (result.status === BROWSER_LOGIN_STATUS.Authenticated && outcome)
    return outcome
  if (attempted)
    return {
      status: CHECKIN_RESULT_STATUS.UNCERTAIN,
      reasonCode: AUTO_CHECKIN_SKIP_REASON.CHECKIN_UNCONFIRMED,
    }
  return resolveCheckinLoginFailure(result, checkInUrl)
}

/** Verify the page identity and status before a single native click and readback. */
async function performNativeSessionCheckin(
  params: NativePageParams,
  checkInUrl: string,
  session: AccountAuthenticatedSession,
  onDispatch: () => void,
): Promise<CheckinResult> {
  await session.navigate(checkInUrl)
  await session.waitForReadyPage(checkInUrl)
  const pageTrigger = resolveTurnstilePreTrigger(params.account)
  if (pageTrigger.kind === TURNSTILE_PRE_TRIGGER_KINDS.ClickSelector) {
    const prepared = await session.sendSiteAction<{ success: boolean }>(
      RuntimeActionIds.ContentTriggerCheckinPageAction,
      { trigger: pageTrigger, prepareOnly: true },
    )
    if (!prepared.success)
      throw new Error("Native check-in target is unavailable")
  }
  session.setVerificationReason(LOGIN_VERIFICATION_REASONS.CheckIn)
  let trigger:
    (CheckinPageActionTriggerResult & { success: boolean }) | undefined
  let preparationOutcome: CheckinResult | undefined
  let dispatched = false
  let request: ApiServiceRequest | undefined
  try {
    trigger = await session.sendSiteAction(
      RuntimeActionIds.ContentTriggerCheckinPageAction,
      async () => {
        // Both page protection and target rendering have settled before proof.
        request = await createNewApiAuthenticatedSessionRequest(
          session,
          params.account,
        )
        const status = await fetchCheckedInTodayStatus(
          params.account,
          params.tempWindowRequestSource,
          params.protectionBypassExecution,
          false,
          session.abortSignal,
          true,
          request,
        )
        if (status?.checkedInToday === true)
          preparationOutcome = withNewApiStatusConfirmation(
            params.account,
            {
              status: CHECKIN_RESULT_STATUS.ALREADY_CHECKED,
              awards: readNewApiAwards(
                params.account,
                status.todayQuotaAwarded,
                status.todayCheckinDate,
                "stats.records[].quota_awarded",
              ),
            },
            status,
          )
        else if (status?.enabled !== true || status.checkedInToday !== false)
          preparationOutcome = {
            status: CHECKIN_RESULT_STATUS.FAILED,
            reasonCode:
              status?.enabled === false
                ? AUTO_CHECKIN_SKIP_REASON.METHOD_DISABLED
                : AUTO_CHECKIN_SKIP_REASON.STATUS_UNAVAILABLE,
          }
        if (
          !preparationOutcome &&
          params.beforeRecoveredMutation &&
          !(await params.beforeRecoveredMutation())
        ) {
          preparationOutcome = {
            status: CHECKIN_RESULT_STATUS.SKIPPED,
            reasonCode: AUTO_CHECKIN_SKIP_REASON.AUTO_CHECKIN_DISABLED,
          }
        }
        if (preparationOutcome)
          throw new Error("Native check-in does not require a click")
        onDispatch()
        dispatched = true
        return {
          trigger: {
            ...pageTrigger,
            ...(pageTrigger.kind === TURNSTILE_PRE_TRIGGER_KINDS.ClickSelector
              ? { targetWaitMs: 0 }
              : {}),
            throttle: { maxAttempts: 1 },
          },
        }
      },
    )
  } catch (error) {
    if (preparationOutcome) return preparationOutcome
    if (!dispatched) throw error
    // A lost reply cannot authorize another click. Confirm using reads only.
  }
  if (trigger?.clicked === false) {
    return resolveNativePageFailureResult({
      action: {
        success: false,
        reason:
          trigger.status === "target_not_found"
            ? TEMP_WINDOW_CHECKIN_PAGE_ACTION_REASONS.TargetNotFound
            : TEMP_WINDOW_CHECKIN_PAGE_ACTION_REASONS.TriggerFailed,
        trigger,
      },
      checkInUrl,
    })
  }
  const observed = await pollCheckedInTodayStatus(
    params.account,
    params.tempWindowRequestSource,
    params.protectionBypassExecution,
    request,
  )
  const confirmed = resolveNewApiCheckInReadback(observed, {
    account: params.account,
    status: CHECKIN_RESULT_STATUS.SUCCESS,
    data: trigger,
  })
  if (confirmed) return confirmed
  return withNewApiStatusConfirmation(
    params.account,
    {
      status: CHECKIN_RESULT_STATUS.UNCERTAIN,
      reasonCode:
        trigger?.verification?.status === "required"
          ? AUTO_CHECKIN_SKIP_REASON.MANUAL_VERIFICATION_REQUIRED
          : AUTO_CHECKIN_SKIP_REASON.CHECKIN_UNCONFIRMED,
      data: trigger,
    },
    observed,
  )
}

/** Execute a native page action using the target login when one is configured. */
export async function resolveNativePageCheckinResult(
  params: NativePageParams,
): Promise<CheckinResult> {
  const checkInUrl = await resolveCheckInUrl(params.account)
  if (!checkInUrl) {
    return {
      status: CHECKIN_RESULT_STATUS.FAILED,
      reasonCode: AUTO_CHECKIN_SKIP_REASON.CHECKIN_PAGE_UNAVAILABLE,
      messageKey: AUTO_CHECKIN_PROVIDER_FALLBACK_MESSAGE_KEYS.checkinFailed,
      rawMessage: params.responseMessage,
    }
  }
  const login = resolveAccountLogin(params.account)
  if (login) return checkInWithAccountSession(params, checkInUrl, login)
  const expectedUserId = normalizeAccountIdentity(
    params.account.account_info?.id,
  )

  if (!expectedUserId) {
    return {
      status: CHECKIN_RESULT_STATUS.FAILED,
      reasonCode: AUTO_CHECKIN_SKIP_REASON.AUTHENTICATION_REQUIRED,
      messageKey:
        AUTO_CHECKIN_PROVIDER_FALLBACK_MESSAGE_KEYS.nativePageIdentityMissing,
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
      messageKey:
        AUTO_CHECKIN_PROVIDER_FALLBACK_MESSAGE_KEYS.nativePageTriggerFailed,
      messageParams: { checkInUrl },
      rawMessage: errorMessage || undefined,
    }
  }

  if (
    !action.success ||
    action.reason !== TEMP_WINDOW_CHECKIN_PAGE_ACTION_REASONS.Clicked
  ) {
    return resolveNativePageFailureResult({ action, checkInUrl })
  }

  const observedAfterNativeAction = await pollCheckedInTodayStatus(
    params.account,
    params.tempWindowRequestSource,
    params.protectionBypassExecution,
  )
  const confirmed = resolveNewApiCheckInReadback(observedAfterNativeAction, {
    account: params.account,
    data: action,
  })
  if (confirmed) return confirmed

  const verificationRequired =
    action.trigger?.verification?.status === "required"
  return withNewApiStatusConfirmation(
    params.account,
    {
      status: CHECKIN_RESULT_STATUS.FAILED,
      reasonCode: verificationRequired
        ? AUTO_CHECKIN_SKIP_REASON.MANUAL_VERIFICATION_REQUIRED
        : AUTO_CHECKIN_SKIP_REASON.CHECKIN_UNCONFIRMED,
      messageKey: verificationRequired
        ? AUTO_CHECKIN_PROVIDER_FALLBACK_MESSAGE_KEYS.nativePageVerificationRequired
        : AUTO_CHECKIN_PROVIDER_FALLBACK_MESSAGE_KEYS.nativePageStatusUnconfirmed,
      messageParams: { checkInUrl },
      rawMessage: action.error || undefined,
      data: action,
    },
    observedAfterNativeAction,
  )
}
