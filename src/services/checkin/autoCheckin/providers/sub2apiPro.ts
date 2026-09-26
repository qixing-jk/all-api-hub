import {
  CHECK_IN_METHOD_AVAILABILITIES,
  CHECK_IN_METHOD_TODAY_STATUSES,
} from "~/constants/checkIn"
import {
  fetchSub2ApiProDailyCheckInStatus,
  performSub2ApiProDailyCheckIn,
} from "~/services/apiService/sub2api"
import { SUB2API_PRO_DAILY_CHECK_IN_RESULT_KINDS } from "~/services/apiService/sub2api/checkIn"
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

const readStatus = async (context: AutoCheckinProviderReadContext) => {
  const status = await fetchSub2ApiProDailyCheckInStatus(
    createSub2ApiCheckInReadRequest(context),
  )
  return toSub2ApiCheckInStatus(status, context.observedAt)
}

export const sub2apiProProvider: AutoCheckinProvider = {
  requiresAuthoritativeStatusBeforeMutation: true,

  getReadiness: getSub2ApiCheckInReadiness,

  detect(context) {
    return detectWithStatusReadback(context, readStatus)
  },

  getStatus: readStatus,

  async checkIn(account, context) {
    const status = context.statusProof
    if (
      status?.availability !== CHECK_IN_METHOD_AVAILABILITIES.Enabled ||
      status.today !== CHECK_IN_METHOD_TODAY_STATUSES.NotChecked
    ) {
      return failedSub2ApiCheckIn(AUTO_CHECKIN_SKIP_REASON.STATUS_UNAVAILABLE)
    }

    try {
      const result = await performSub2ApiProDailyCheckIn(
        createSub2ApiCheckInMutationRequest(account as SiteAccount, context),
        { beforeRecoveredMutation: context.beforeRecoveredMutation },
      )
      switch (result.kind) {
        case SUB2API_PRO_DAILY_CHECK_IN_RESULT_KINDS.Applied:
          return {
            status: CHECKIN_RESULT_STATUS.SUCCESS,
            messageKey:
              AUTO_CHECKIN_PROVIDER_FALLBACK_MESSAGE_KEYS.checkinSuccessful,
            data: result.data,
          }
        case SUB2API_PRO_DAILY_CHECK_IN_RESULT_KINDS.AlreadyChecked:
          return {
            status: CHECKIN_RESULT_STATUS.ALREADY_CHECKED,
            messageKey:
              AUTO_CHECKIN_PROVIDER_FALLBACK_MESSAGE_KEYS.alreadyCheckedToday,
          }
        case SUB2API_PRO_DAILY_CHECK_IN_RESULT_KINDS.Disabled:
          return failedSub2ApiCheckIn(AUTO_CHECKIN_SKIP_REASON.METHOD_DISABLED)
        case SUB2API_PRO_DAILY_CHECK_IN_RESULT_KINDS.RoleForbidden:
          return failedSub2ApiCheckIn(
            AUTO_CHECKIN_SKIP_REASON.PERMISSION_DENIED,
          )
        case SUB2API_PRO_DAILY_CHECK_IN_RESULT_KINDS.RecoveryStatusUnavailable:
          return failedSub2ApiCheckIn(
            AUTO_CHECKIN_SKIP_REASON.STATUS_UNAVAILABLE,
          )
        case SUB2API_PRO_DAILY_CHECK_IN_RESULT_KINDS.RecoveryPreconditionFailed:
          return failedSub2ApiCheckIn(
            AUTO_CHECKIN_SKIP_REASON.ACCOUNT_UNAVAILABLE,
          )
      }
    } catch (error) {
      return mapSub2ApiCheckInMutationError(error, context)
    }
  },
}
