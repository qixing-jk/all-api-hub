/**
 * Sub2API auto check-in provider.
 *
 * Source: https://github.com/Wei-Shaw/sub2api
 * Check-in is not part of upstream mainline, so the flow is gated behind the
 * global Sub2API opt-in and probes both known route pairs before giving up.
 * Endpoint selection, response heuristics, and JWT refresh live in
 * `~/services/apiService/sub2api`; this provider only maps the outcome onto the
 * scheduler's normalized result shape.
 */

import { accountSub2ApiAuthSession } from "~/services/accounts/sub2apiAuthSession"
import { performSub2ApiCheckin } from "~/services/apiService/sub2api"
import type { Sub2ApiAuthSessionRequest } from "~/services/apiService/sub2api/authSession"
import {
  AUTO_CHECKIN_PROVIDER_FALLBACK_MESSAGE_KEYS,
  resolveProviderErrorResult,
} from "~/services/checkin/autoCheckin/providers/shared"
import type { AutoCheckinProviderResult } from "~/services/checkin/autoCheckin/providers/types"
import { isSub2ApiCheckinEnabled } from "~/services/checkin/sub2apiCheckinPreference"
import type { SiteAccount } from "~/types"
import { CHECKIN_RESULT_STATUS } from "~/types/autoCheckin"
import { normalizeTempWindowRequestSource } from "~/utils/browser/tempWindowRequestSource"

import type { AutoCheckinProvider, AutoCheckinProviderContext } from "./index"

/**
 * Perform check-in for a Sub2API account.
 */
async function checkinSub2Api(
  account: SiteAccount,
  context: AutoCheckinProviderContext,
): Promise<AutoCheckinProviderResult> {
  // Re-check the opt-in here: a stored `enableDetection` can outlive the switch
  // being turned off, and the scheduler resolves providers synchronously.
  if (!(await isSub2ApiCheckinEnabled())) {
    return {
      status: CHECKIN_RESULT_STATUS.SKIPPED,
      messageKey: AUTO_CHECKIN_PROVIDER_FALLBACK_MESSAGE_KEYS.sub2apiDisabled,
    }
  }

  const tempWindowRequestSource = normalizeTempWindowRequestSource(
    context.tempWindowRequestSource,
  )

  try {
    // Sub2API rotates the refresh token on every renewal and invalidates the
    // previous one immediately, so a renewal triggered by this run must be
    // written back. Without the auth-session port the rotated pair stays in
    // memory and the stored refresh token is left permanently dead.
    // Upstream contract: https://github.com/Wei-Shaw/sub2api
    const request: Sub2ApiAuthSessionRequest = {
      baseUrl: account.site_url,
      accountId: account.id,
      auth: {
        authType: account.authType,
        userId: account.account_info.id,
        accessToken: account.account_info.access_token,
        refreshToken: account.sub2apiAuth?.refreshToken,
        tokenExpiresAt: account.sub2apiAuth?.tokenExpiresAt,
      },
      tempWindowRequestSource,
      protectionBypassExecution: context.protectionBypassExecution,
      sub2apiAuthSession: accountSub2ApiAuthSession,
    }

    const outcome = await performSub2ApiCheckin(request)

    const rawMessage = outcome.message || undefined

    if (outcome.alreadyChecked) {
      return {
        status: CHECKIN_RESULT_STATUS.ALREADY_CHECKED,
        rawMessage,
        ...(rawMessage
          ? {}
          : {
              messageKey:
                AUTO_CHECKIN_PROVIDER_FALLBACK_MESSAGE_KEYS.alreadyCheckedToday,
            }),
      }
    }

    return {
      status: CHECKIN_RESULT_STATUS.SUCCESS,
      rawMessage,
      ...(rawMessage
        ? {}
        : {
            messageKey:
              AUTO_CHECKIN_PROVIDER_FALLBACK_MESSAGE_KEYS.checkinSuccessful,
          }),
      ...(outcome.reward ? { data: { reward: outcome.reward } } : {}),
    }
  } catch (error: unknown) {
    // Pass the raw error so the shared resolver can read `statusCode` and map an
    // unsupported deployment (404) to the "endpoint not supported" copy.
    return resolveProviderErrorResult({ error })
  }
}

/**
 * Check whether an account is configured well enough to attempt check-in.
 *
 * Sub2API only authenticates with a dashboard JWT, so an access token is the
 * single hard requirement; the global opt-in is enforced in `checkIn` because
 * this predicate is synchronous.
 */
function canCheckIn(account: SiteAccount): boolean {
  if (!account.checkIn?.enableDetection) {
    return false
  }

  return Boolean(account.account_info?.access_token)
}

export const sub2ApiProvider: AutoCheckinProvider = {
  canCheckIn,
  checkIn: checkinSub2Api,
}
