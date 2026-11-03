import {
  CHECK_IN_METHOD_AVAILABILITIES,
  CHECK_IN_METHOD_STATUS_OUTCOMES,
  CHECK_IN_METHOD_TODAY_STATUSES,
} from "~/constants/checkIn"
import {
  fetchBaiApiCheckInStatus,
  performBaiApiCheckIn,
} from "~/services/apiService/sub2api/checkin/baiApiCheckIn"
import { ApiError } from "~/services/apiTransport/errors"
import { getCheckInMethodUnknownReason } from "~/services/checkin/autoCheckin/errors"
import { detectWithStatusReadback } from "~/services/checkin/autoCheckin/providers/detection"
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
  AutoCheckinProvider,
  AutoCheckinProviderContext,
  AutoCheckinProviderReadContext,
} from "./contracts"
import {
  createSub2ApiCheckInMutationRequest,
  createSub2ApiCheckInReadRequest,
  getSub2ApiCheckInReadiness,
  mapSub2ApiCheckInMutationError,
  readUsdReward,
  toSub2ApiCheckInStatus,
} from "./sub2apiShared"

/** Throws for unreadable status so discovery can classify the route's absence. */
const fetchStatus = async (context: AutoCheckinProviderReadContext) => {
  const status = await fetchBaiApiCheckInStatus(
    createSub2ApiCheckInReadRequest(context),
  )
  return toSub2ApiCheckInStatus(status, context.observedAt)
}

/** Selected status refresh reports failures as unknown, keeping the selection. */
const readStatus: NonNullable<AutoCheckinProvider["getStatus"]> = async (
  context,
) => {
  try {
    return await fetchStatus(context)
  } catch (error) {
    return {
      outcome: CHECK_IN_METHOD_STATUS_OUTCOMES.Unknown,
      reason: getCheckInMethodUnknownReason(error),
      attemptedAt: context.observedAt,
    }
  }
}

export const baiApiProvider: AutoCheckinProvider = {
  requiresAuthoritativeStatusBeforeMutation: true,

  getReadiness: getSub2ApiCheckInReadiness,

  // A deployment without the daily rewards module answers the host's Go
  // default 404 instead of a status DTO; the shared detector maps that to
  // unsupported so one site's method cannot block another's discovery.
  detect: (context) => detectWithStatusReadback(context, fetchStatus),

  getStatus: readStatus,

  async checkIn(account, context) {
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
        createSub2ApiCheckInMutationRequest(account as SiteAccount, context),
      )
      const reward = readUsdReward(result.rewardAmount)
      return {
        status: CHECKIN_RESULT_STATUS.SUCCESS,
        messageKey:
          AUTO_CHECKIN_PROVIDER_FALLBACK_MESSAGE_KEYS.checkinSuccessful,
        ...(reward ? { reward } : {}),
        data: result,
      }
    } catch (error) {
      return mapBaiApiMutationError(error, context)
    }
  },
}

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
  return mapSub2ApiCheckInMutationError(error, context)
}
