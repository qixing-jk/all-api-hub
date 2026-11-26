import {
  CHECK_IN_METHOD_AVAILABILITIES,
  CHECK_IN_METHOD_TODAY_STATUSES,
} from "~/constants/checkIn"
import {
  CLAWHUD_DAILY_CHECK_IN_ENDPOINT,
  CLAWHUD_DAILY_CHECK_IN_ERROR_CODES,
  fetchClawhudDailyCheckInStatus,
  performClawhudDailyCheckIn,
} from "~/services/apiService/sub2api/checkin/clawhudCheckIn"
import { isForeignCheckInContract } from "~/services/apiService/sub2api/checkin/foreignCheckInContract"
import type { Sub2ApiCheckInStatusAuth } from "~/services/apiService/sub2api/checkin/statusAuthentication"
import { getSafeErrorMessage } from "~/services/apiService/sub2api/redaction"
import { ApiError } from "~/services/apiTransport/errors"
import { withCheckInResponseConfirmation } from "~/services/checkin/autoCheckin/confirmation"
import { getCheckInMethodUnknownReason } from "~/services/checkin/autoCheckin/errors"
import { detectWithStatusReadback } from "~/services/checkin/autoCheckin/providers/detection"
import { AUTO_CHECKIN_PROVIDER_FALLBACK_MESSAGE_KEYS } from "~/services/checkin/autoCheckin/providers/shared"
import type { SiteAccount } from "~/types"
import {
  AUTO_CHECKIN_SKIP_REASON,
  CHECKIN_RESULT_STATUS,
} from "~/types/autoCheckin"

import type {
  AutoCheckinProviderContext,
  AutoCheckinProviderReadContext,
} from "./contracts"
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
  auth?: Sub2ApiCheckInStatusAuth,
) => {
  const status = await fetchClawhudDailyCheckInStatus(
    createSub2ApiCheckInReadRequest(context),
    auth,
  )
  return toSub2ApiCheckInStatus(status, context.observedAt)
}

/**
 * This deployment classifies its already-checked duplicate in the error
 * envelope instead of a success response; the shared fallback owns every
 * other outcome.
 */
const mapMutationError = (
  error: unknown,
  context: AutoCheckinProviderContext,
  account: SiteAccount,
) => {
  if (
    error instanceof ApiError &&
    error.upstreamCode === CLAWHUD_DAILY_CHECK_IN_ERROR_CODES.AlreadyChecked
  ) {
    return {
      status: CHECKIN_RESULT_STATUS.ALREADY_CHECKED,
      rawMessage: getSafeErrorMessage(error),
    }
  }
  return mapSub2ApiCheckInMutationError(error, context, account)
}

export const clawhudProvider = withSub2ApiCheckInExecution({
  requiresAuthoritativeStatusBeforeMutation: true,

  getReadiness: getSub2ApiCheckInReadiness,

  detect(context) {
    return detectWithStatusReadback(
      context,
      readStatus,
      getCheckInMethodUnknownReason,
      isForeignCheckInContract,
    )
  },

  getStatus: readStatus,

  async checkIn(account, context, attempt) {
    const status = context.statusProof
    if (
      status?.availability !== CHECK_IN_METHOD_AVAILABILITIES.Enabled ||
      status.today !== CHECK_IN_METHOD_TODAY_STATUSES.NotChecked
    ) {
      return failedSub2ApiCheckIn(AUTO_CHECKIN_SKIP_REASON.STATUS_UNAVAILABLE)
    }

    try {
      const result = await performClawhudDailyCheckIn(
        attempt?.request ??
          createSub2ApiCheckInMutationRequest(account as SiteAccount, context),
        {
          ...attempt?.recovery,
          beforeRecoveredMutation: context.beforeRecoveredMutation,
        },
      )
      return withCheckInResponseConfirmation(
        account as SiteAccount,
        {
          status: CHECKIN_RESULT_STATUS.SUCCESS,
          messageKey:
            AUTO_CHECKIN_PROVIDER_FALLBACK_MESSAGE_KEYS.checkinSuccessful,
          awards: readUsdAwards(
            account as SiteAccount,
            result.data.rewardAmount,
            {
              operation: CLAWHUD_DAILY_CHECK_IN_ENDPOINT,
              field: "today_amount",
            },
          ),
          data: { rewardAmount: result.data.rewardAmount },
        },
        { day: result.data.checkinDate, timestamp: result.data.checkedInAt },
      )
    } catch (error) {
      return mapMutationError(error, context, account as SiteAccount)
    }
  },
})
