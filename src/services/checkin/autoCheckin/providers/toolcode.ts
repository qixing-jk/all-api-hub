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
  fetchToolcodeDailyCheckInStatus,
  performToolcodeDailyCheckIn,
  TOOLCODE_DAILY_CHECK_IN_RESULT_KINDS,
} from "~/services/apiService/sub2api/checkin/toolcodeCheckIn"
import { TOOLCODE_DAILY_CHECK_IN_ENDPOINT } from "~/services/apiService/sub2api/checkin/toolcodeCheckInProtocol"
import { accountAward } from "~/services/checkin/autoCheckin/awards"
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
  const status = await fetchToolcodeDailyCheckInStatus(
    createSub2ApiCheckInReadRequest(context),
  )
  return toSub2ApiCheckInStatus(status, context.observedAt)
}

export const toolcodeProvider: AutoCheckinProvider = {
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
      const result = await performToolcodeDailyCheckIn(
        createSub2ApiCheckInMutationRequest(account as SiteAccount, context),
        { beforeRecoveredMutation: context.beforeRecoveredMutation },
      )
      switch (result.kind) {
        case TOOLCODE_DAILY_CHECK_IN_RESULT_KINDS.Applied:
          return {
            status: CHECKIN_RESULT_STATUS.SUCCESS,
            messageKey:
              AUTO_CHECKIN_PROVIDER_FALLBACK_MESSAGE_KEYS.checkinSuccessful,
            // Points and expiring bonus grants are separate from account balance quota.
            data: result.data,
            awards: [
              accountAward(account as SiteAccount, {
                id: "points_reward",
                operation: TOOLCODE_DAILY_CHECK_IN_ENDPOINT,
                field: "points_reward",
                adapter: "toolcode-engagement",
                asset: {
                  kind: ASSET_KINDS.Quota,
                  id: `toolcode:${new URL((account as SiteAccount).site_url).origin}:points`,
                  label: "points",
                  displayScale: 1,
                  displayLabel: "points",
                },
                value: result.data.pointsReward,
                target: AWARD_TARGETS.Wallet,
                fulfillment: AWARD_FULFILLMENT.Credited,
              }),
              accountAward(account as SiteAccount, {
                id: "reward_amount",
                operation: TOOLCODE_DAILY_CHECK_IN_ENDPOINT,
                field: "reward_amount",
                adapter: "toolcode-engagement",
                // The response does not supply the bonus currency or expiry timestamp.
                asset: { kind: ASSET_KINDS.Unknown },
                value: result.data.bonusAmount,
                target: AWARD_TARGETS.Entitlement,
                fulfillment: AWARD_FULFILLMENT.Credited,
              }),
            ],
          }
        case TOOLCODE_DAILY_CHECK_IN_RESULT_KINDS.AlreadyChecked:
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
}
