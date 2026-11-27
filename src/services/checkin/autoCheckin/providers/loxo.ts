import {
  CHECK_IN_METHOD_AVAILABILITIES,
  CHECK_IN_METHOD_TODAY_STATUSES,
} from "~/constants/checkIn"
import {
  fetchLoxoCheckInStatus,
  performLoxoCheckIn,
} from "~/services/apiService/sub2api/checkin/loxoCheckIn"
import type { Sub2ApiCheckInStatusAuth } from "~/services/apiService/sub2api/checkin/statusAuthentication"
import { ApiError } from "~/services/apiTransport/errors"
import type { SiteAccount } from "~/types"
import {
  AUTO_CHECKIN_SKIP_REASON,
  CHECKIN_RESULT_STATUS,
} from "~/types/autoCheckin"

import type {
  AutoCheckinProvider,
  AutoCheckinProviderReadContext,
} from "./contracts"
import { withSub2ApiCheckInExecution } from "./sub2apiExecution"
import { AUTO_CHECKIN_PROVIDER_FALLBACK_MESSAGE_KEYS as messages } from "./shared"
import {
  createSub2ApiCheckInMutationRequest,
  createSub2ApiCheckInReadRequest,
  failedSub2ApiCheckIn,
  getSub2ApiCheckInReadiness,
  mapSub2ApiCheckInMutationError,
  toSub2ApiCheckInStatus,
} from "./sub2apiShared"

const readStatus = async (
  context: AutoCheckinProviderReadContext,
  auth: Sub2ApiCheckInStatusAuth = { allowAuthenticationRecovery: false },
) => {
  const status = await fetchLoxoCheckInStatus(
    createSub2ApiCheckInReadRequest(context),
    auth,
  )
  return {
    ...toSub2ApiCheckInStatus(status, context.observedAt),
    requiresManualVerification: status.requiresManualVerification,
  }
}

const manualVerification = (account: SiteAccount) => ({
  status: CHECKIN_RESULT_STATUS.FAILED,
  reasonCode: AUTO_CHECKIN_SKIP_REASON.MANUAL_VERIFICATION_REQUIRED,
  messageKey: messages.nativePageVerificationRequired,
  messageParams: { checkInUrl: new URL("/check-in", account.site_url).href },
})

export const loxoProvider: AutoCheckinProvider = withSub2ApiCheckInExecution({
  requiresAuthoritativeStatusBeforeMutation: true,
  getReadiness: getSub2ApiCheckInReadiness,
  getStatus: readStatus,
  async checkIn(account, context, attempt) {
    const status = context.statusProof
    if (
      status?.availability !== CHECK_IN_METHOD_AVAILABILITIES.Enabled ||
      status.today !== CHECK_IN_METHOD_TODAY_STATUSES.NotChecked ||
      typeof status.requiresManualVerification !== "boolean"
    )
      return failedSub2ApiCheckIn(AUTO_CHECKIN_SKIP_REASON.STATUS_UNAVAILABLE)
    const site = account as SiteAccount
    if (status.requiresManualVerification) return manualVerification(site)
    try {
      if (
        context.beforeRecoveredMutation &&
        !(await context.beforeRecoveredMutation())
      )
        return failedSub2ApiCheckIn(
          AUTO_CHECKIN_SKIP_REASON.ACCOUNT_UNAVAILABLE,
        )
      const data = await performLoxoCheckIn(
        attempt?.request ?? createSub2ApiCheckInMutationRequest(site, context),
      )
      // The native success response confirms the grant but supplies no claim date.
      // Preserve its amount without inventing an asset or wallet conversion.
      return {
        status: CHECKIN_RESULT_STATUS.SUCCESS,
        messageKey: messages.checkinSuccessful,
        data,
      }
    } catch (error) {
      if (error instanceof ApiError && !error.unattributedMessage) {
        switch (error.upstreamCode) {
          case "CHECK_IN_ALREADY_DONE":
            return {
              status: CHECKIN_RESULT_STATUS.ALREADY_CHECKED,
              messageKey: messages.alreadyCheckedToday,
            }
          case "CHECK_IN_CAPTCHA_REQUIRED":
            return manualVerification(site)
          case "CHECK_IN_DISABLED":
            return failedSub2ApiCheckIn(
              AUTO_CHECKIN_SKIP_REASON.METHOD_DISABLED,
            )
        }
      }
      return mapSub2ApiCheckInMutationError(error, context, site)
    }
  },
})
