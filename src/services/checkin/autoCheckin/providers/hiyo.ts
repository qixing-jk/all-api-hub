import {
  CHECK_IN_METHOD_AVAILABILITIES,
  CHECK_IN_METHOD_TODAY_STATUSES,
} from "~/constants/checkIn"
import {
  fetchHiyoDailyCheckInStatus,
  performHiyoDailyCheckIn,
} from "~/services/apiService/sub2api/checkin/hiyoCheckIn"
import { HIYO_CHECK_IN_ENDPOINT } from "~/services/apiService/sub2api/checkin/hiyoCheckInProtocol"
import type { Sub2ApiCheckInStatusAuth } from "~/services/apiService/sub2api/checkin/statusAuthentication"
import { AUTO_CHECKIN_PROVIDER_FALLBACK_MESSAGE_KEYS } from "~/services/checkin/autoCheckin/providers/shared"
import type { SiteAccount } from "~/types"
import {
  AUTO_CHECKIN_SKIP_REASON,
  CHECKIN_RESULT_STATUS,
} from "~/types/autoCheckin"

import type { AutoCheckinProviderReadContext } from "./contracts"
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
) =>
  toSub2ApiCheckInStatus(
    await fetchHiyoDailyCheckInStatus(
      createSub2ApiCheckInReadRequest(context),
      auth,
    ),
    context.observedAt,
  )

export const hiyoProvider = withSub2ApiCheckInExecution({
  requiresAuthoritativeStatusBeforeMutation: true,
  getReadiness: getSub2ApiCheckInReadiness,
  getStatus: readStatus,
  async checkIn(account, context, attempt) {
    if (
      context.statusProof?.availability !==
        CHECK_IN_METHOD_AVAILABILITIES.Enabled ||
      context.statusProof.today !== CHECK_IN_METHOD_TODAY_STATUSES.NotChecked
    ) {
      return failedSub2ApiCheckIn(AUTO_CHECKIN_SKIP_REASON.STATUS_UNAVAILABLE)
    }
    try {
      const data = await performHiyoDailyCheckIn(
        attempt?.request ??
          createSub2ApiCheckInMutationRequest(account as SiteAccount, context),
        {
          ...attempt?.recovery,
          beforeRecoveredMutation: context.beforeRecoveredMutation,
        },
      )
      return {
        status: CHECKIN_RESULT_STATUS.SUCCESS,
        messageKey:
          AUTO_CHECKIN_PROVIDER_FALLBACK_MESSAGE_KEYS.checkinSuccessful,
        awards: readUsdAwards(account as SiteAccount, data.rewardAmount, {
          operation: HIYO_CHECK_IN_ENDPOINT,
          field: "amount",
        }),
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
})
