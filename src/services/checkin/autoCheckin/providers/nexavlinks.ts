import {
  CHECK_IN_METHOD_AVAILABILITIES,
  CHECK_IN_METHOD_TODAY_STATUSES,
} from "~/constants/checkIn"
import { normalizeAccountIdentity } from "~/services/accounts/identity/accountIdentity"
import { fetchNexaVlinksDailyCheckInStatus } from "~/services/apiService/sub2api/checkin/nexavlinksCheckIn"
import {
  CHECK_IN_CONFIRMATION_KINDS,
  withCheckInConfirmation,
} from "~/services/checkin/autoCheckin/confirmation"
import { detectWithStatusReadback } from "~/services/checkin/autoCheckin/providers/detection"
import {
  AUTO_CHECKIN_PROVIDER_FALLBACK_MESSAGE_KEYS,
  getEffectiveAuthType,
  resolveNativePageFailureResult,
} from "~/services/checkin/autoCheckin/providers/shared"
import { readDayStableCheckInObservation } from "~/services/checkin/statusObservation"
import type { SiteAccount } from "~/types"
import {
  AUTO_CHECKIN_SKIP_REASON,
  CHECKIN_RESULT_STATUS,
} from "~/types/autoCheckin"
import type { TurnstilePreTrigger } from "~/types/turnstile"
import { tempWindowTriggerCheckinPageAction } from "~/utils/browser/tempWindowFetch"
import { getErrorMessage } from "~/utils/core/error"
import { safeRandomUUID } from "~/utils/core/identifier"

import type {
  AutoCheckinProvider,
  AutoCheckinProviderReadContext,
} from "./contracts"
import {
  createSub2ApiCheckInReadRequest,
  failedSub2ApiCheckIn,
  getSub2ApiCheckInReadiness,
  toSub2ApiCheckInStatus,
} from "./sub2apiShared"

/** Path of the deployment's own claim page, where the challenge is answered. */
const NEXAVLINKS_CHECK_IN_PATH = "/check-in"
const NATIVE_PAGE_STATUS_POLL_TIMEOUT_MS = 8_000
const NATIVE_PAGE_STATUS_POLL_INTERVAL_MS = 1_000

/**
 * Scoped text trigger for the page's own claim button.
 *
 * The sidebar also links "Check In" to this same route, so the unscoped
 * button-text default would click the navigation link and reload the page
 * instead of opening the challenge dialog. Verified at
 * https://asia.nexavlinks.com/check-in, 2026-10-17.
 */
const NEXAVLINKS_CHECK_IN_TRIGGER: TurnstilePreTrigger = {
  kind: "clickText",
  candidateSelector: "main button",
  positivePattern: "check\\s*in|签到",
}

const resolveCheckInUrl = (account: SiteAccount): string | null => {
  try {
    return new URL(NEXAVLINKS_CHECK_IN_PATH, account.site_url).href
  } catch {
    return null
  }
}

/** Honors the account's own trigger override like the New API path does. */
const resolveTrigger = (account: SiteAccount): TurnstilePreTrigger =>
  account.checkIn?.customCheckIn?.turnstilePreTrigger ??
  NEXAVLINKS_CHECK_IN_TRIGGER

const readStatus = async (context: AutoCheckinProviderReadContext) =>
  toSub2ApiCheckInStatus(
    await fetchNexaVlinksDailyCheckInStatus(
      createSub2ApiCheckInReadRequest(context),
    ),
    context.observedAt,
  )

/**
 * Polls the read-only status until the page's own claim lands or the budget
 * ends. A read that throws leaves the outcome to the caller's catch.
 */
async function pollCheckedInToday(account: SiteAccount) {
  const deadline = Date.now() + NATIVE_PAGE_STATUS_POLL_TIMEOUT_MS
  let lastStatus:
    | {
        observation: Awaited<
          ReturnType<typeof fetchNexaVlinksDailyCheckInStatus>
        >
        observedAt: number
      }
    | undefined
  while (Date.now() <= deadline) {
    const status = await readDayStableCheckInObservation(() =>
      fetchNexaVlinksDailyCheckInStatus(
        createSub2ApiCheckInReadRequest({ account, observedAt: Date.now() }),
      ),
    )
    lastStatus = status
    if (status?.observation.checkedInToday) return status
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

export const nexavlinksProvider: AutoCheckinProvider = {
  requiresAuthoritativeStatusBeforeMutation: true,

  getReadiness: getSub2ApiCheckInReadiness,

  detect: (context) => detectWithStatusReadback(context, readStatus),

  getStatus: readStatus,

  /**
   * Drives the deployment's own check-in page: the claim needs a puzzle answer
   * only a person can give, so the extension clicks the page's button, lets the
   * person finish the challenge in the opened window, and confirms the result
   * through the read-only status.
   */
  async checkIn(account, context) {
    const siteAccount = account as SiteAccount
    if (
      context.statusProof?.availability !==
        CHECK_IN_METHOD_AVAILABILITIES.Enabled ||
      context.statusProof.today !== CHECK_IN_METHOD_TODAY_STATUSES.NotChecked
    ) {
      return failedSub2ApiCheckIn(AUTO_CHECKIN_SKIP_REASON.STATUS_UNAVAILABLE)
    }

    const checkInUrl = resolveCheckInUrl(siteAccount)
    if (!checkInUrl) {
      return failedSub2ApiCheckIn(
        AUTO_CHECKIN_SKIP_REASON.CHECKIN_PAGE_UNAVAILABLE,
      )
    }
    const expectedUserId = normalizeAccountIdentity(
      siteAccount.account_info?.id,
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

    let action: Awaited<ReturnType<typeof tempWindowTriggerCheckinPageAction>>
    try {
      action = await tempWindowTriggerCheckinPageAction({
        originUrl: siteAccount.site_url,
        pageUrl: checkInUrl,
        requestId: safeRandomUUID(`nexavlinks-checkin-${siteAccount.id}`),
        accountId: siteAccount.id,
        authType: getEffectiveAuthType(siteAccount),
        cookieAuthSessionCookie: siteAccount.cookieAuth?.sessionCookie,
        siteType: siteAccount.site_type,
        expectedUserId,
        trigger: resolveTrigger(siteAccount),
        tempWindowRequestSource: context.tempWindowRequestSource,
        protectionBypassExecution: context.protectionBypassExecution,
      })
    } catch (error: unknown) {
      return {
        status: CHECKIN_RESULT_STATUS.FAILED,
        reasonCode: AUTO_CHECKIN_SKIP_REASON.CHECKIN_PAGE_UNAVAILABLE,
        messageKey:
          AUTO_CHECKIN_PROVIDER_FALLBACK_MESSAGE_KEYS.nativePageTriggerFailed,
        messageParams: { checkInUrl },
        rawMessage: getErrorMessage(error),
      }
    }

    if (!action.success || action.reason !== "clicked") {
      return resolveNativePageFailureResult({ action, checkInUrl })
    }

    let observation: Awaited<ReturnType<typeof pollCheckedInToday>>
    try {
      observation = await pollCheckedInToday(siteAccount)
      if (observation?.observation.checkedInToday) {
        // The page completed the claim inside this run and the read-only status
        // confirms it. The award is credit-denominated on this deployment, so
        // no quota reward is claimed from it.
        return withCheckInConfirmation(
          siteAccount,
          {
            status: CHECKIN_RESULT_STATUS.SUCCESS,
            messageKey:
              AUTO_CHECKIN_PROVIDER_FALLBACK_MESSAGE_KEYS.checkinSuccessful,
            data: action,
          },
          {
            kind: CHECK_IN_CONFIRMATION_KINDS.Observed,
            status: toSub2ApiCheckInStatus(
              observation.observation,
              observation.observedAt,
            ),
          },
        )
      }
    } catch {
      // The action was dispatched; an unreadable confirmation is not a failure
      // to apply, and the page may still have claimed.
      return {
        status: CHECKIN_RESULT_STATUS.FAILED,
        reasonCode: AUTO_CHECKIN_SKIP_REASON.CHECKIN_UNCONFIRMED,
        messageKey:
          AUTO_CHECKIN_PROVIDER_FALLBACK_MESSAGE_KEYS.nativePageStatusUnconfirmed,
        messageParams: { checkInUrl },
        data: action,
      }
    }

    const verificationRequired =
      action.trigger?.verification?.status === "required"
    const result = {
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
    } as const
    return observation
      ? withCheckInConfirmation(siteAccount, result, {
          kind: CHECK_IN_CONFIRMATION_KINDS.Observed,
          status: toSub2ApiCheckInStatus(
            observation.observation,
            observation.observedAt,
          ),
        })
      : result
  },
}
