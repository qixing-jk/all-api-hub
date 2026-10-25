import { CHECKIN_PAGE_ACTION_TARGET_MAX_WAIT_MS } from "~/constants/turnstile"
import { normalizeAccountIdentity } from "~/services/accounts/identity/accountIdentity"
import { createAccountApiRequestFromStoredAccount } from "~/services/accounts/utils/apiServiceRequest"
import {
  resolveAccountSiteRouteUrl,
  SITE_ROUTE_KINDS,
} from "~/services/accounts/utils/siteRouteResolver"
import { fetchPmApiIdentity } from "~/services/apiService/pmapi/identity"
import type { SiteAccount } from "~/types"
import {
  AUTO_CHECKIN_SKIP_REASON,
  CHECKIN_RESULT_STATUS,
} from "~/types/autoCheckin"
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
  const checkInUrl = await resolveAccountSiteRouteUrl(
    { baseUrl: account.site_url, siteType: account.site_type },
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
  if (!action.success || action.reason !== "clicked")
    return resolveNativePageFailureResult({ action, checkInUrl })
  const request = {
    ...createAccountApiRequestFromStoredAccount(account).request,
    tempWindowRequestSource: context.tempWindowRequestSource,
    protectionBypassExecution: context.protectionBypassExecution,
  }
  const deadline = Date.now() + STATUS_READBACK_TIMEOUT_MS
  do {
    try {
      if ((await fetchPmApiIdentity(request)).checkedInToday)
        return {
          status: CHECKIN_RESULT_STATUS.SUCCESS,
          messageKey: messages.checkinSuccessful,
          data: action,
        }
    } catch {
      // A failed read does not establish whether the page completed its claim.
    }
    if (Date.now() >= deadline) break
    await new Promise((resolve) => setTimeout(resolve, STATUS_READBACK_POLL_MS))
  } while (Date.now() <= deadline)
  return {
    status: CHECKIN_RESULT_STATUS.FAILED,
    reasonCode: AUTO_CHECKIN_SKIP_REASON.MANUAL_VERIFICATION_REQUIRED,
    messageKey: messages.nativePageVerificationRequired,
    messageParams: { checkInUrl },
    data: action,
  }
}
