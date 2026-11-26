import {
  CHECK_IN_METHOD_AVAILABILITIES,
  CHECK_IN_METHOD_TODAY_STATUSES,
} from "~/constants/checkIn"
import { isForeignCheckInContract } from "~/services/apiService/sub2api/checkin/foreignCheckInContract"
import {
  fetchGeniusProgrammerDailyCheckInStatus,
  GENIUS_PROGRAMMER_DAILY_CHECK_IN_ENDPOINT,
  GENIUS_PROGRAMMER_DAILY_CHECK_IN_RESULT_KINDS,
  performGeniusProgrammerDailyCheckIn,
} from "~/services/apiService/sub2api/checkin/geniusProgrammerCheckIn"
import type { Sub2ApiCheckInStatusAuth } from "~/services/apiService/sub2api/checkin/statusAuthentication"
import { AUTO_CHECKIN_PROVIDER_FALLBACK_MESSAGE_KEYS } from "~/services/checkin/autoCheckin/providers/shared"
import type { SiteAccount } from "~/types"
import {
  AUTO_CHECKIN_SKIP_REASON,
  CHECKIN_RESULT_STATUS,
} from "~/types/autoCheckin"

import type { AutoCheckinProviderReadContext } from "./contracts"
import {
  createSub2ApiStatusDetector,
  withSub2ApiCheckInExecution,
} from "./sub2apiExecution"
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
  const status = await fetchGeniusProgrammerDailyCheckInStatus(
    createSub2ApiCheckInReadRequest(context),
    auth,
  )
  return toSub2ApiCheckInStatus(status, context.observedAt)
}

export const geniusProgrammerProvider = withSub2ApiCheckInExecution({
  requiresAuthoritativeStatusBeforeMutation: true,

  getReadiness: getSub2ApiCheckInReadiness,

  detect: createSub2ApiStatusDetector(readStatus, isForeignCheckInContract),

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
      const result = await performGeniusProgrammerDailyCheckIn(
        attempt?.request ??
          createSub2ApiCheckInMutationRequest(account as SiteAccount, context),
        {
          ...attempt?.recovery,
          beforeRecoveredMutation: context.beforeRecoveredMutation,
        },
      )
      switch (result.kind) {
        case GENIUS_PROGRAMMER_DAILY_CHECK_IN_RESULT_KINDS.Applied:
          return {
            status: CHECKIN_RESULT_STATUS.SUCCESS,
            messageKey:
              AUTO_CHECKIN_PROVIDER_FALLBACK_MESSAGE_KEYS.checkinSuccessful,
            awards: readUsdAwards(
              account as SiteAccount,
              result.data.rewardAmount,
              {
                operation: GENIUS_PROGRAMMER_DAILY_CHECK_IN_ENDPOINT,
                field: "reward_amount",
              },
            ),
            data: result.data,
          }
        case GENIUS_PROGRAMMER_DAILY_CHECK_IN_RESULT_KINDS.AlreadyChecked:
          return {
            status: CHECKIN_RESULT_STATUS.ALREADY_CHECKED,
            messageKey:
              AUTO_CHECKIN_PROVIDER_FALLBACK_MESSAGE_KEYS.alreadyCheckedToday,
          }
      }
    } catch (error) {
      return mapSub2ApiCheckInMutationError(
        error,
        context,
        account as SiteAccount,
      )
    }
  },
})
