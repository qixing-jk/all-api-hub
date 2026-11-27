import {
  CHECK_IN_METHOD_AVAILABILITIES,
  CHECK_IN_METHOD_TODAY_STATUSES,
} from "~/constants/checkIn"
import {
  fetchLinxiStatus,
  performLinxiClaim,
} from "~/services/apiService/sub2api/checkin/linxiCheckIn"
import { LINXI_CHECK_IN_ENDPOINT } from "~/services/apiService/sub2api/checkin/linxiCheckInProtocol"
import type { Sub2ApiCheckInStatusAuth } from "~/services/apiService/sub2api/checkin/statusAuthentication"
import { ApiError } from "~/services/apiTransport/errors"
import { withCheckInResponseConfirmation } from "~/services/checkin/autoCheckin/confirmation"
import type { SiteAccount } from "~/types"
import {
  AUTO_CHECKIN_SKIP_REASON,
  CHECKIN_RESULT_STATUS,
} from "~/types/autoCheckin"

import type {
  AutoCheckinProvider,
  AutoCheckinProviderReadContext,
} from "./contracts"
import { detectWithStatusReadback } from "./detection"
import { AUTO_CHECKIN_PROVIDER_FALLBACK_MESSAGE_KEYS as messages } from "./shared"
import { withSub2ApiCheckInExecution } from "./sub2apiExecution"
import {
  createSub2ApiCheckInMutationRequest,
  createSub2ApiCheckInReadRequest,
  failedSub2ApiCheckIn,
  getSub2ApiCheckInReadiness,
  mapSub2ApiCheckInMutationError,
  readUsdAwards,
  toSub2ApiCheckInStatus,
} from "./sub2apiShared"

const readStatus = async (
  context: AutoCheckinProviderReadContext,
  auth: Sub2ApiCheckInStatusAuth = {},
) => {
  const status = await fetchLinxiStatus(
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

export const linxiProvider: AutoCheckinProvider = withSub2ApiCheckInExecution({
  requiresAuthoritativeStatusBeforeMutation: true,
  getReadiness: getSub2ApiCheckInReadiness,
  detect: (context, auth) =>
    detectWithStatusReadback(context, (input) => readStatus(input, auth)),
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
    try {
      if (status.requiresManualVerification) return manualVerification(site)
      if (
        context.beforeRecoveredMutation &&
        !(await context.beforeRecoveredMutation())
      )
        return failedSub2ApiCheckIn(
          AUTO_CHECKIN_SKIP_REASON.ACCOUNT_UNAVAILABLE,
        )
      const result = await performLinxiClaim(
        attempt?.request ?? createSub2ApiCheckInMutationRequest(site, context),
        attempt?.recovery,
      )
      if (result.kind === "already")
        return withCheckInResponseConfirmation(
          site,
          {
            status: CHECKIN_RESULT_STATUS.ALREADY_CHECKED,
            messageKey: messages.alreadyCheckedToday,
          },
          { day: result.day },
        )
      return withCheckInResponseConfirmation(
        site,
        {
          status: CHECKIN_RESULT_STATUS.SUCCESS,
          messageKey: messages.checkinSuccessful,
          data: result,
          // The dashboard distinguishes promotional and paid pools. Only the latter is wallet USD.
          awards:
            result.pool === "paid"
              ? readUsdAwards(site, result.amount, {
                  operation: LINXI_CHECK_IN_ENDPOINT,
                  field: "reward_amount",
                })
              : undefined,
        },
        { day: result.day },
      )
    } catch (error) {
      if (
        error instanceof ApiError &&
        (error.statusCode === 400 || error.statusCode === 403) &&
        !error.unattributedMessage &&
        /turnstile/i.test(`${error.upstreamCode ?? ""} ${error.message}`)
      )
        return manualVerification(site)
      return mapSub2ApiCheckInMutationError(error, context, site)
    }
  },
})
