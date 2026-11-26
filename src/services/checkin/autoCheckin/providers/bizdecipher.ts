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
  BIZDECIPHER_FREE_CHECK_IN_ENDPOINT,
  BizDecipherCheckInUnconfirmedError,
  fetchBizDecipherDailyCheckInStatus,
  performBizDecipherDailyCheckIn,
} from "~/services/apiService/sub2api/checkin/bizdecipherCheckIn"
import { isForeignCheckInContract } from "~/services/apiService/sub2api/checkin/foreignCheckInContract"
import type { Sub2ApiCheckInStatusAuth } from "~/services/apiService/sub2api/checkin/statusAuthentication"
import { accountAward } from "~/services/checkin/autoCheckin/awards"
import {
  createUnconfirmedCheckInResult,
  withCheckInResponseConfirmation,
} from "~/services/checkin/autoCheckin/confirmation"
import type { SiteAccount } from "~/types"
import {
  AUTO_CHECKIN_SKIP_REASON,
  CHECKIN_RESULT_STATUS,
} from "~/types/autoCheckin"

import type { AutoCheckinProviderReadContext } from "./contracts"
import { AUTO_CHECKIN_PROVIDER_FALLBACK_MESSAGE_KEYS as messages } from "./shared"
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
  toSub2ApiCheckInStatus,
} from "./sub2apiShared"

const readStatus = async (
  context: AutoCheckinProviderReadContext,
  auth?: Sub2ApiCheckInStatusAuth,
) =>
  toSub2ApiCheckInStatus(
    await fetchBizDecipherDailyCheckInStatus(
      createSub2ApiCheckInReadRequest(context),
      auth,
    ),
    context.observedAt,
  )

export const bizDecipherProvider = withSub2ApiCheckInExecution(
  {
    requiresAuthoritativeStatusBeforeMutation: true,
    getReadiness: getSub2ApiCheckInReadiness,
    detect: createSub2ApiStatusDetector(readStatus, isForeignCheckInContract),
    getStatus: readStatus,
    async checkIn(account, context, attempt) {
      if (
        context.statusProof?.availability !==
          CHECK_IN_METHOD_AVAILABILITIES.Enabled ||
        context.statusProof.today !==
          CHECK_IN_METHOD_TODAY_STATUSES.NotChecked ||
        !("observedAt" in context.statusProof.evidence)
      )
        return failedSub2ApiCheckIn(AUTO_CHECKIN_SKIP_REASON.STATUS_UNAVAILABLE)
      const site = account as SiteAccount
      try {
        if (
          context.beforeRecoveredMutation &&
          !(await context.beforeRecoveredMutation())
        )
          return failedSub2ApiCheckIn(
            AUTO_CHECKIN_SKIP_REASON.ACCOUNT_UNAVAILABLE,
          )
        const receipt = await performBizDecipherDailyCheckIn(
          attempt?.request ??
            createSub2ApiCheckInMutationRequest(site, context),
          context.statusProof.evidence.observedAt,
        )
        return withCheckInResponseConfirmation(
          site,
          {
            status: receipt.alreadyClaimed
              ? CHECKIN_RESULT_STATUS.ALREADY_CHECKED
              : CHECKIN_RESULT_STATUS.SUCCESS,
            messageKey: receipt.alreadyClaimed
              ? messages.alreadyCheckedToday
              : messages.checkinSuccessful,
            // The native wallet separates credit and balance. Neither has a verified
            // USD conversion here; preserve the reported asset without money income.
            awards: receipt.alreadyClaimed
              ? undefined
              : [
                  accountAward(site, {
                    id: "reward",
                    operation: BIZDECIPHER_FREE_CHECK_IN_ENDPOINT,
                    field: "reward",
                    value: receipt.reward,
                    asset: {
                      kind: ASSET_KINDS.Quota,
                      id: `bizdecipher:${receipt.rewardAsset}`,
                      label: receipt.rewardAsset,
                      displayScale: 1,
                      displayLabel: receipt.rewardAsset,
                    },
                    target: AWARD_TARGETS.Wallet,
                    fulfillment: AWARD_FULFILLMENT.Credited,
                    event: {
                      namespace: "bizdecipher-free-checkin",
                      id: receipt.operationId,
                    },
                  }),
                ],
          },
          { day: receipt.day },
        )
      } catch (error) {
        if (error instanceof BizDecipherCheckInUnconfirmedError)
          return createUnconfirmedCheckInResult(site, {
            data: { operationId: error.operationId },
          })
        return mapSub2ApiCheckInMutationError(error, context, site)
      }
    },
  },
  { bindInitialRead: true },
)
