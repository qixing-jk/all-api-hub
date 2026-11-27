import {
  CHECK_IN_METHOD_STATUS_EVIDENCE_SOURCES,
  CHECK_IN_METHOD_STATUS_OUTCOMES,
  CHECK_IN_METHOD_TODAY_STATUSES,
} from "~/constants/checkIn"
import { CHECKIN_PAGE_ACTION_TARGET_MAX_WAIT_MS } from "~/constants/turnstile"
import { normalizeAccountIdentity } from "~/services/accounts/identity/accountIdentity"
import { createAccountApiRequestFromStoredAccount } from "~/services/accounts/utils/apiServiceRequest"
import {
  resolveAccountSiteRouteUrl,
  SITE_ROUTE_KINDS,
} from "~/services/accounts/utils/siteRouteResolver"
import {
  fetchPmApiIdentity,
  type PmApiIdentity,
} from "~/services/apiService/pmapi/identity"
import { bindApiTransportRequest } from "~/services/apiTransport/recovery"
import { API_DIRECT_REQUEST_REASONS } from "~/services/apiTransport/type"
import { normalizeCheckInPagePath } from "~/services/checkin/autoCheckin/configuration/nativePagePath"
import {
  CHECK_IN_CONFIRMATION_KINDS,
  withCheckInConfirmation,
} from "~/services/checkin/autoCheckin/confirmation"
import {
  readDayStableCheckInObservation,
  type CheckInStatusObservation,
} from "~/services/checkin/statusObservation"
import type { SiteAccount } from "~/types"
import {
  AUTO_CHECKIN_SKIP_REASON,
  CHECKIN_RESULT_STATUS,
} from "~/types/autoCheckin"
import { TEMP_WINDOW_CHECKIN_PAGE_ACTION_REASONS } from "~/types/tempWindowFetch"
import { TURNSTILE_PRE_TRIGGER_KINDS } from "~/types/turnstile"
import { tempWindowTriggerCheckinPageAction } from "~/utils/browser/tempWindowFetch"
import { safeRandomUUID } from "~/utils/core/identifier"

import type { AutoCheckinProviderContext } from "./contracts"
import {
  AUTO_CHECKIN_PROVIDER_FALLBACK_MESSAGE_KEYS as messages,
  resolveNativePageFailureResult,
} from "./shared"
import type { AutoCheckinProviderOutcome } from "./types"

const STATUS_READBACK_TIMEOUT_MS = 8_000
const STATUS_READBACK_POLL_MS = 1_000

/** Reuses identity checking, one-click dispatch and the existing verification reminder. */
export async function clickNativeCheckInPage(
  account: SiteAccount,
  context: AutoCheckinProviderContext,
): Promise<AutoCheckinProviderOutcome> {
  let checkInUrl = await resolveAccountSiteRouteUrl(
    {
      baseUrl: account.site_url,
      siteType: account.site_type,
      checkIn: account.checkIn,
    },
    SITE_ROUTE_KINDS.CheckIn,
  )
  if (!checkInUrl)
    return {
      status: CHECKIN_RESULT_STATUS.FAILED,
      reasonCode: AUTO_CHECKIN_SKIP_REASON.CHECKIN_PAGE_UNAVAILABLE,
      messageKey: messages.checkinFailed,
    }
  const expectedUserId = normalizeAccountIdentity(account.account_info.id)
  if (!expectedUserId)
    return resolveNativePageFailureResult({
      action: { success: false, reason: "identity_missing" },
      checkInUrl,
    })
  if (
    context.beforeRecoveredMutation &&
    !(await context.beforeRecoveredMutation())
  )
    return {
      status: CHECKIN_RESULT_STATUS.SKIPPED,
      reasonCode: AUTO_CHECKIN_SKIP_REASON.STATUS_UNAVAILABLE,
    }
  let action
  try {
    action = await tempWindowTriggerCheckinPageAction({
      originUrl: account.site_url,
      pageUrl: checkInUrl,
      discoverCheckInPage: !normalizeCheckInPagePath(
        account.checkIn.nativePagePath,
      ),
      requestId: safeRandomUUID(`pmapi-checkin-${account.id}`),
      accountId: account.id,
      authType: account.authType,
      cookieAuthSessionCookie: account.cookieAuth?.sessionCookie,
      siteType: account.site_type,
      expectedUserId,
      trigger: {
        kind: TURNSTILE_PRE_TRIGGER_KINDS.ClickSelector,
        selector: "#ckBtn:not(:disabled)",
        targetWaitMs: CHECKIN_PAGE_ACTION_TARGET_MAX_WAIT_MS,
        throttle: { maxAttempts: 1 },
      },
      tempWindowRequestSource: context.tempWindowRequestSource,
      protectionBypassExecution: context.protectionBypassExecution,
    })
  } catch {
    // A lost action response is not permission to click again.
    return {
      status: CHECKIN_RESULT_STATUS.FAILED,
      reasonCode: AUTO_CHECKIN_SKIP_REASON.MANUAL_VERIFICATION_REQUIRED,
      messageKey: messages.nativePageStatusUnconfirmed,
      messageParams: { checkInUrl },
    }
  }
  if (action.pageUrl) checkInUrl = action.pageUrl
  if (
    !action.success ||
    action.reason !== TEMP_WINDOW_CHECKIN_PAGE_ACTION_REASONS.Clicked
  )
    return resolveNativePageFailureResult({ action, checkInUrl })
  const request = bindApiTransportRequest(
    {
      ...createAccountApiRequestFromStoredAccount(account).request,
      tempWindowRequestSource: context.tempWindowRequestSource,
      protectionBypassExecution: context.protectionBypassExecution,
    },
    API_DIRECT_REQUEST_REASONS.CallerManaged,
  )
  const deadline = Date.now() + STATUS_READBACK_TIMEOUT_MS
  let observation: CheckInStatusObservation<PmApiIdentity> | undefined
  do {
    try {
      observation = await readDayStableCheckInObservation(() =>
        fetchPmApiIdentity(request),
      )
      if (observation?.observation.checkedInToday)
        return withCheckInConfirmation(
          account,
          {
            status: CHECKIN_RESULT_STATUS.SUCCESS,
            messageKey: messages.checkinSuccessful,
            data: action,
          },
          {
            kind: CHECK_IN_CONFIRMATION_KINDS.Observed,
            status: {
              outcome: CHECK_IN_METHOD_STATUS_OUTCOMES.Known,
              today: CHECK_IN_METHOD_TODAY_STATUSES.Checked,
              evidence: {
                source: CHECK_IN_METHOD_STATUS_EVIDENCE_SOURCES.Probe,
                observedAt: observation.observedAt,
              },
            },
          },
        )
    } catch {
      // A failed read does not establish whether the page completed its claim.
      observation = undefined
    }
    if (Date.now() >= deadline) break
    await new Promise((resolve) => setTimeout(resolve, STATUS_READBACK_POLL_MS))
  } while (Date.now() <= deadline)
  return withCheckInConfirmation(
    account,
    {
      status: CHECKIN_RESULT_STATUS.FAILED,
      reasonCode: AUTO_CHECKIN_SKIP_REASON.MANUAL_VERIFICATION_REQUIRED,
      messageKey: messages.nativePageVerificationRequired,
      messageParams: { checkInUrl },
      data: action,
    },
    observation
      ? {
          kind: CHECK_IN_CONFIRMATION_KINDS.Observed,
          status: {
            outcome: CHECK_IN_METHOD_STATUS_OUTCOMES.Known,
            today: CHECK_IN_METHOD_TODAY_STATUSES.NotChecked,
            evidence: {
              source: CHECK_IN_METHOD_STATUS_EVIDENCE_SOURCES.Probe,
              observedAt: observation.observedAt,
            },
          },
        }
      : { kind: CHECK_IN_CONFIRMATION_KINDS.Unavailable },
  )
}
