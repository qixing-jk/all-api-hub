import {
  CHECK_IN_METHOD_AVAILABILITIES,
  CHECK_IN_METHOD_STATUS_EVIDENCE_SOURCES,
  CHECK_IN_METHOD_STATUS_OUTCOMES,
  CHECK_IN_METHOD_TODAY_STATUSES,
  CHECK_IN_PROVIDER_READINESS_REASONS,
} from "~/constants/checkIn"
import { createAccountApiRequestFromStoredAccount } from "~/services/accounts/utils/apiServiceRequest"
import {
  resolveAccountSiteRouteUrl,
  SITE_ROUTE_KINDS,
} from "~/services/accounts/utils/siteRouteResolver"
import { fetchPmApiIdentity } from "~/services/apiService/pmapi/identity"
import { performPmApiCheckIn } from "~/services/apiService/pmapi/rewards"
import { fetchPmApiStatus } from "~/services/apiService/pmapi/status"
import { composeAbortSignals } from "~/services/apiTransport/abortableTask"
import { getCheckInMethodUnknownReason } from "~/services/checkin/autoCheckin/errors"
import { AuthTypeEnum } from "~/types"
import type { SiteAccount } from "~/types"
import {
  AUTO_CHECKIN_SKIP_REASON,
  CHECKIN_RESULT_STATUS,
} from "~/types/autoCheckin"

import type {
  AutoCheckinProvider,
  AutoCheckinProviderContext,
} from "./contracts"
import { detectWithStatusReadback } from "./detection"
import { clickNativeCheckInPage } from "./pmapiNativePageClick"
import {
  AUTO_CHECKIN_PROVIDER_FALLBACK_MESSAGE_KEYS,
  resolveProviderErrorResult,
} from "./shared"
import type { AutoCheckinProviderOutcome } from "./types"
import { resolveVerificationContinuation } from "./verificationContinuationPreference"

/**
 * The console's own refusal copy. A `checkin` captcha scene means the site
 * answered 请先完成人机验证 after the POST, and a deployment without the grant
 * answers 签到功能未开启; both are determinate refusals, not transport errors.
 */
const CAPTCHA_REFUSAL = /人机验证|captcha|verify/i
const DISABLED_REFUSAL = /未开启|not enabled|disabled/i

const getStatus: NonNullable<AutoCheckinProvider["getStatus"]> = async (
  context,
) => {
  const request =
    context.request ??
    (context.account
      ? createAccountApiRequestFromStoredAccount(context.account).request
      : undefined)
  if (!request) return undefined
  const composed = composeAbortSignals([request.abortSignal, context.signal])
  try {
    // `checkin_enabled` is per deployment (pmcat.top disables it outright);
    // a disabled grant is a known state, not a failed probe.
    const status = await fetchPmApiStatus({
      ...request,
      ...(composed.signal ? { abortSignal: composed.signal } : {}),
    })
    if (!status.checkinEnabled)
      return {
        outcome: CHECK_IN_METHOD_STATUS_OUTCOMES.Known,
        availability: CHECK_IN_METHOD_AVAILABILITIES.Disabled,
        evidence: {
          source: CHECK_IN_METHOD_STATUS_EVIDENCE_SOURCES.Probe,
          observedAt: context.observedAt,
        },
      }
    // `checked_in_today` on `/api/me` is the console's own authoritative gate.
    const identity = await fetchPmApiIdentity({
      ...request,
      ...(composed.signal ? { abortSignal: composed.signal } : {}),
    })
    // The gate travels with the status: the account UI explains the check-in
    // through it, and new accounts use it as the automatic-execution default.
    return {
      outcome: CHECK_IN_METHOD_STATUS_OUTCOMES.Known,
      availability: CHECK_IN_METHOD_AVAILABILITIES.Enabled,
      requiresManualVerification: status.requiresManualVerification,
      today: identity.checkedInToday
        ? CHECK_IN_METHOD_TODAY_STATUSES.Checked
        : CHECK_IN_METHOD_TODAY_STATUSES.NotChecked,
      evidence: {
        source: CHECK_IN_METHOD_STATUS_EVIDENCE_SOURCES.Probe,
        observedAt: context.observedAt,
      },
    }
  } catch (error) {
    return {
      outcome: CHECK_IN_METHOD_STATUS_OUTCOMES.Unknown,
      reason: getCheckInMethodUnknownReason(error),
      attemptedAt: context.observedAt,
    }
  } finally {
    composed.dispose()
  }
}

/**
 * The site asked for its own human verification. When the operator opted into
 * clicking the site's check-in action, open that page, click once, and confirm
 * through the account's own state; otherwise report the manual step with the
 * page to open. The extension never solves or bypasses the verification.
 */
async function resolveVerificationRequired(
  account: SiteAccount,
  message: string,
  context: AutoCheckinProviderContext,
): Promise<AutoCheckinProviderOutcome> {
  if (await resolveVerificationContinuation(account.checkIn ?? {})) {
    return clickNativeCheckInPage(account, context)
  }

  const checkInUrl = await resolveAccountSiteRouteUrl(
    { baseUrl: account.site_url, siteType: account.site_type },
    SITE_ROUTE_KINDS.CheckIn,
  )
  return {
    status: CHECKIN_RESULT_STATUS.FAILED,
    reasonCode: AUTO_CHECKIN_SKIP_REASON.MANUAL_VERIFICATION_REQUIRED,
    messageKey:
      AUTO_CHECKIN_PROVIDER_FALLBACK_MESSAGE_KEYS.nativePageVerificationRequired,
    messageParams: { checkInUrl: checkInUrl ?? account.site_url },
    rawMessage: message,
  }
}

export const pmApiProvider: AutoCheckinProvider = {
  requiresAuthoritativeStatusBeforeMutation: true,
  getReadiness(account) {
    const token = (account as SiteAccount).account_info?.access_token?.trim()
    return account.authType === AuthTypeEnum.AccessToken && token
      ? { ready: true }
      : {
          ready: false,
          reason: CHECK_IN_PROVIDER_READINESS_REASONS.CredentialsMissing,
        }
  },
  // Detection is a read-only status probe. A captcha-gated checkin scene is
  // not a detection failure: the deployment still has the grant and the
  // readback is authoritative, while execution reports manual verification.
  detect: (context) => detectWithStatusReadback(context, getStatus),
  getStatus,
  async checkIn(account, context) {
    try {
      const result = await performPmApiCheckIn({
        ...createAccountApiRequestFromStoredAccount(account as SiteAccount)
          .request,
        tempWindowRequestSource: context.tempWindowRequestSource,
        protectionBypassExecution: context.protectionBypassExecution,
        observer: context.mutationLifecycle,
      })
      return {
        status: result.alreadyChecked
          ? CHECKIN_RESULT_STATUS.ALREADY_CHECKED
          : CHECKIN_RESULT_STATUS.SUCCESS,
        messageKey: result.alreadyChecked
          ? AUTO_CHECKIN_PROVIDER_FALLBACK_MESSAGE_KEYS.alreadyCheckedToday
          : AUTO_CHECKIN_PROVIDER_FALLBACK_MESSAGE_KEYS.checkinSuccessful,
        ...(!result.alreadyChecked
          ? {
              // The console reports the grant in its New API quota unit,
              // which is the extension's internal monetary quota.
              reward: { quota: result.quotaGranted },
              data: result.raw,
            }
          : {}),
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      if (CAPTCHA_REFUSAL.test(message))
        return await resolveVerificationRequired(
          account as SiteAccount,
          message,
          context,
        )
      if (DISABLED_REFUSAL.test(message))
        return {
          status: CHECKIN_RESULT_STATUS.FAILED,
          reasonCode: AUTO_CHECKIN_SKIP_REASON.METHOD_DISABLED,
          rawMessage: message,
        }
      return resolveProviderErrorResult({
        error,
        mutationDispatched: context.mutationLifecycle?.dispatched,
      })
    }
  },
}
