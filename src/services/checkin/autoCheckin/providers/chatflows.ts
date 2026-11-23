import {
  CHECK_IN_METHOD_AVAILABILITIES,
  CHECK_IN_METHOD_STATUS_OUTCOMES,
  CHECK_IN_METHOD_TODAY_STATUSES,
} from "~/constants/checkIn"
import {
  ASSET_KINDS,
  AWARD_FULFILLMENT,
  AWARD_TARGETS,
} from "~/services/amounts/financialConstants"
import {
  fetchChatflowsCheckInStatus,
  performChatflowsCheckIn,
} from "~/services/apiService/sub2api/checkin/chatflowsCheckIn"
import {
  CHATFLOWS_CHECK_IN_ENDPOINT,
  getChatflowsCheckInPeriod,
} from "~/services/apiService/sub2api/checkin/chatflowsCheckInProtocol"
import { accountAward } from "~/services/checkin/autoCheckin/awards"
import {
  CHECK_IN_CONFIRMATION_KINDS,
  createUnconfirmedCheckInResult,
  withCheckInConfirmation,
  withCheckInResponseConfirmation,
} from "~/services/checkin/autoCheckin/confirmation"
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

const fetchStatus = async (context: AutoCheckinProviderReadContext) =>
  toSub2ApiCheckInStatus(
    await fetchChatflowsCheckInStatus(createSub2ApiCheckInReadRequest(context)),
    context.observedAt,
  )

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

export const chatflowsProvider: AutoCheckinProvider = {
  requiresAuthoritativeStatusBeforeMutation: true,
  getReadiness: getSub2ApiCheckInReadiness,
  detect: (context) => detectWithStatusReadback(context, fetchStatus),
  getStatus: readStatus,

  async checkIn(account, context) {
    const siteAccount = account as SiteAccount
    const proof = context.statusProof
    if (
      proof?.availability !== CHECK_IN_METHOD_AVAILABILITIES.Enabled ||
      proof.today !== CHECK_IN_METHOD_TODAY_STATUSES.NotChecked ||
      !("observedAt" in proof.evidence) ||
      getChatflowsCheckInPeriod(proof.evidence.observedAt) !==
        getChatflowsCheckInPeriod(Date.now())
    ) {
      return failedSub2ApiCheckIn(AUTO_CHECKIN_SKIP_REASON.STATUS_UNAVAILABLE)
    }

    try {
      const result = await performChatflowsCheckIn(
        createSub2ApiCheckInMutationRequest(siteAccount, context),
        { beforeRecoveredMutation: context.beforeRecoveredMutation },
      )
      if (result.kind === "already_checked") {
        // The native page re-reads after 409. Never assume a conflict proves
        // the currently active period when it may have crossed noon in flight.
        const status = await readStatus({
          account: siteAccount,
          observedAt: Date.now(),
        })
        if (
          status?.outcome !== CHECK_IN_METHOD_STATUS_OUTCOMES.Known ||
          status.today !== CHECK_IN_METHOD_TODAY_STATUSES.Checked
        ) {
          return createUnconfirmedCheckInResult(siteAccount)
        }
        return withCheckInConfirmation(
          siteAccount,
          {
            status: CHECKIN_RESULT_STATUS.ALREADY_CHECKED,
            messageKey:
              AUTO_CHECKIN_PROVIDER_FALLBACK_MESSAGE_KEYS.alreadyCheckedToday,
          },
          { kind: CHECK_IN_CONFIRMATION_KINDS.Observed, status },
        )
      }

      return withCheckInResponseConfirmation(siteAccount, {
        status: CHECKIN_RESULT_STATUS.SUCCESS,
        messageKey:
          AUTO_CHECKIN_PROVIDER_FALLBACK_MESSAGE_KEYS.checkinSuccessful,
        data: result,
        awards: [
          accountAward(siteAccount, {
            id: "amount",
            operation: CHATFLOWS_CHECK_IN_ENDPOINT,
            field: "amount",
            value: result.amount,
            asset: {
              kind: ASSET_KINDS.Quota,
              id: `chatflows:${new URL(siteAccount.site_url).origin}:credits`,
              label: "credits",
              displayScale: 1,
              displayLabel: "credits",
            },
            target: AWARD_TARGETS.Wallet,
            fulfillment: AWARD_FULFILLMENT.Credited,
          }),
        ],
      })
    } catch (error) {
      return mapSub2ApiCheckInMutationError(error, context, siteAccount)
    }
  },
}
