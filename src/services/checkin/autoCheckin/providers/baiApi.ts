import {
  CHECK_IN_METHOD_AVAILABILITIES,
  CHECK_IN_METHOD_STATUS_OUTCOMES,
  CHECK_IN_METHOD_TODAY_STATUSES,
} from "~/constants/checkIn"
import {
  fetchBaiApiCheckInStatus,
  performBaiApiCheckIn,
} from "~/services/apiService/sub2api/checkin/baiApiCheckIn"
import { BAI_API_CHECK_IN_ENDPOINT } from "~/services/apiService/sub2api/checkin/baiApiCheckInProtocol"
import type { Sub2ApiCheckInStatusAuth } from "~/services/apiService/sub2api/checkin/statusAuthentication"
import { ApiError } from "~/services/apiTransport/errors"
import { withCheckInResponseConfirmation } from "~/services/checkin/autoCheckin/confirmation"
import { getCheckInMethodUnknownReason } from "~/services/checkin/autoCheckin/errors"
import {
  AUTO_CHECKIN_PROVIDER_FALLBACK_MESSAGE_KEYS,
  isAlreadyCheckedMessage,
} from "~/services/checkin/autoCheckin/providers/shared"
import type { SiteAccount } from "~/types"
import {
  AUTO_CHECKIN_SKIP_REASON,
  CHECKIN_RESULT_STATUS,
} from "~/types/autoCheckin"

import type {
  AutoCheckinProviderContext,
  AutoCheckinProviderReadContext,
} from "./contracts"
import {
  createSub2ApiStatusDetector,
  withSub2ApiCheckInExecution,
} from "./sub2apiExecution"
import {
  createSub2ApiCheckInMutationRequest,
  createSub2ApiCheckInReadRequest,
  getSub2ApiCheckInReadiness,
  mapSub2ApiCheckInMutationError,
  readUsdAwards,
  toSub2ApiCheckInStatus,
} from "./sub2apiShared"

/** Throws for unreadable status so discovery can classify the route's absence. */
const fetchStatus = async (
  context: AutoCheckinProviderReadContext,
  auth?: Sub2ApiCheckInStatusAuth,
) => {
  const status = await fetchBaiApiCheckInStatus(
    createSub2ApiCheckInReadRequest(context),
    undefined,
    auth,
  )
  return toSub2ApiCheckInStatus(status, context.observedAt)
}

/** Selected status refresh reports failures as unknown, keeping the selection. */
const readStatus = async (
  context: AutoCheckinProviderReadContext,
  auth?: Sub2ApiCheckInStatusAuth,
) => {
  try {
    return await fetchStatus(context, auth)
  } catch (error) {
    return {
      outcome: CHECK_IN_METHOD_STATUS_OUTCOMES.Unknown,
      reason: getCheckInMethodUnknownReason(error),
      attemptedAt: context.observedAt,
    }
  }
}

export const baiApiProvider = withSub2ApiCheckInExecution({
  requiresAuthoritativeStatusBeforeMutation: true,

  getReadiness: getSub2ApiCheckInReadiness,

  // A deployment without the daily rewards module answers the host's Go
  // default 404 instead of a status DTO; the shared detector maps that to
  // unsupported so one site's method cannot block another's discovery.
  detect: createSub2ApiStatusDetector(fetchStatus),

  getStatus: readStatus,

  async checkIn(account, context, attempt) {
    const status = context.statusProof
    if (
      status?.availability !== CHECK_IN_METHOD_AVAILABILITIES.Enabled ||
      status.today !== CHECK_IN_METHOD_TODAY_STATUSES.NotChecked
    ) {
      return {
        status: CHECKIN_RESULT_STATUS.FAILED,
        reasonCode: AUTO_CHECKIN_SKIP_REASON.STATUS_UNAVAILABLE,
        messageKey: AUTO_CHECKIN_PROVIDER_FALLBACK_MESSAGE_KEYS.checkinFailed,
      }
    }

    try {
      const result = await performBaiApiCheckIn(
        attempt?.request ??
          createSub2ApiCheckInMutationRequest(account as SiteAccount, context),
        {
          ...attempt?.recovery,
          beforeRecoveredMutation: context.beforeRecoveredMutation,
        },
      )
      const awards = readUsdAwards(
        account as SiteAccount,
        result.rewardAmount,
        {
          operation: BAI_API_CHECK_IN_ENDPOINT,
          field: result.rewardField ?? "cash_amount_usd",
        },
      )
      return withCheckInResponseConfirmation(
        account as SiteAccount,
        {
          status: CHECKIN_RESULT_STATUS.SUCCESS,
          messageKey:
            AUTO_CHECKIN_PROVIDER_FALLBACK_MESSAGE_KEYS.checkinSuccessful,
          awards,
          data: result,
        },
        { day: result.checkinDate },
      )
    } catch (error) {
      return mapBaiApiMutationError(error, context, account as SiteAccount)
    }
  },
})

/**
 * The deployment's duplicate answer is unverified: its dashboard assumes a
 * success envelope and only re-reads status after an error. A duplicate the
 * site itself reports in a business message is therefore recognized as such,
 * while every other failure keeps the shared family mapping (which leaves a
 * dispatched-but-lost response uncertain for outer status reconciliation).
 */
function mapBaiApiMutationError(
  error: unknown,
  context: AutoCheckinProviderContext,
  account: SiteAccount,
) {
  if (
    error instanceof ApiError &&
    error.statusCode === undefined &&
    isAlreadyCheckedMessage(error.message)
  ) {
    return {
      status: CHECKIN_RESULT_STATUS.ALREADY_CHECKED,
      messageKey:
        AUTO_CHECKIN_PROVIDER_FALLBACK_MESSAGE_KEYS.alreadyCheckedToday,
    }
  }
  return mapSub2ApiCheckInMutationError(error, context, account)
}
