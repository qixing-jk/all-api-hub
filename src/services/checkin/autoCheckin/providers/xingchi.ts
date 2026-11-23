import {
  CHECK_IN_METHOD_AVAILABILITIES,
  CHECK_IN_METHOD_TODAY_STATUSES,
} from "~/constants/checkIn"
import { isForeignCheckInContract } from "~/services/apiService/sub2api/checkin/foreignCheckInContract"
import {
  fetchXingchiDailyCheckInStatus,
  performXingchiDailyCheckIn,
} from "~/services/apiService/sub2api/checkin/xingchiCheckIn"
import { getCheckInMethodUnknownReason } from "~/services/checkin/autoCheckin/errors"
import { detectWithStatusReadback } from "~/services/checkin/autoCheckin/providers/detection"
import { AUTO_CHECKIN_PROVIDER_FALLBACK_MESSAGE_KEYS } from "~/services/checkin/autoCheckin/providers/shared"
import type { SiteAccount } from "~/types"
import {
  AUTO_CHECKIN_SKIP_REASON,
  CHECKIN_RESULT_STATUS,
} from "~/types/autoCheckin"

import type {
  AutoCheckinProvider,
  AutoCheckinProviderReadContext,
} from "./contracts"
import {
  createSub2ApiCheckInMutationRequest,
  createSub2ApiCheckInReadRequest,
  failedSub2ApiCheckIn,
  getSub2ApiCheckInReadiness,
  mapSub2ApiCheckInMutationError,
  toSub2ApiCheckInStatus,
} from "./sub2apiShared"

const readStatus = async (context: AutoCheckinProviderReadContext) =>
  toSub2ApiCheckInStatus(
    await fetchXingchiDailyCheckInStatus(
      createSub2ApiCheckInReadRequest(context),
    ),
    context.observedAt,
  )

export const xingchiProvider: AutoCheckinProvider = {
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

  async checkIn(account, context) {
    if (
      context.statusProof?.availability !==
        CHECK_IN_METHOD_AVAILABILITIES.Enabled ||
      context.statusProof.today !== CHECK_IN_METHOD_TODAY_STATUSES.NotChecked
    ) {
      return failedSub2ApiCheckIn(AUTO_CHECKIN_SKIP_REASON.STATUS_UNAVAILABLE)
    }
    try {
      const data = await performXingchiDailyCheckIn(
        createSub2ApiCheckInMutationRequest(account as SiteAccount, context),
        { beforeRecoveredMutation: context.beforeRecoveredMutation },
      )
      return {
        status: CHECKIN_RESULT_STATUS.SUCCESS,
        messageKey:
          AUTO_CHECKIN_PROVIDER_FALLBACK_MESSAGE_KEYS.checkinSuccessful,
        data,
      }
    } catch (error) {
      return mapSub2ApiCheckInMutationError(
        error,
        context,
        account as SiteAccount,
      )
    }
  },
}
