import {
  CHECK_IN_METHOD_AVAILABILITIES,
  CHECK_IN_METHOD_TODAY_STATUSES,
} from "~/constants/checkIn"
import {
  ASSET_KINDS,
  AWARD_FULFILLMENT,
  AWARD_TARGETS,
} from "~/services/amounts/financialConstants"
import {
  fetchSidruneDailyCheckInStatus,
  performSidruneDailyCheckIn,
  SIDRUNE_CHECK_IN_ENDPOINT,
} from "~/services/apiService/sub2api/checkin/sidruneCheckIn"
import { accountAward } from "~/services/checkin/autoCheckin/awards"
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
import { AUTO_CHECKIN_PROVIDER_FALLBACK_MESSAGE_KEYS } from "./shared"
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
    await fetchSidruneDailyCheckInStatus(
      createSub2ApiCheckInReadRequest(context),
    ),
    context.observedAt,
  )

export const sidruneProvider: AutoCheckinProvider = {
  requiresAuthoritativeStatusBeforeMutation: true,
  getReadiness: getSub2ApiCheckInReadiness,
  detect: (context) => detectWithStatusReadback(context, readStatus),
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
      const data = await performSidruneDailyCheckIn(
        createSub2ApiCheckInMutationRequest(account as SiteAccount, context),
        { beforeRecoveredMutation: context.beforeRecoveredMutation },
      )
      return {
        status: CHECKIN_RESULT_STATUS.SUCCESS,
        messageKey:
          AUTO_CHECKIN_PROVIDER_FALLBACK_MESSAGE_KEYS.checkinSuccessful,
        // Native rules credit a separate welfare wallet; conversion to account
        // balance requires another user action. Do not report quota income.
        data,
        // The welfare response supplies no currency or redemption rate. Preserve its
        // quantities without relabeling this separate wallet as main-account USD.
        awards: (
          [
            ["reward_amount", data.rewardAmount],
            ["milestone_bonus", data.milestoneBonus],
          ] as const
        ).map(([field, value]) =>
          accountAward(account as SiteAccount, {
            id: field,
            operation: SIDRUNE_CHECK_IN_ENDPOINT,
            field,
            adapter: "sidrune-welfare",
            asset: { kind: ASSET_KINDS.Unknown },
            value,
            target: AWARD_TARGETS.Wallet,
            fulfillment: AWARD_FULFILLMENT.PendingRedemption,
          }),
        ),
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
