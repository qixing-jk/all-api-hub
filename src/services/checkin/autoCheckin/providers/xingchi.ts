import {
  CHECK_IN_METHOD_AVAILABILITIES,
  CHECK_IN_METHOD_TODAY_STATUSES,
} from "~/constants/checkIn"
import {
  ASSET_KINDS,
  AWARD_FULFILLMENT,
  AWARD_TARGETS,
} from "~/services/amounts/financialConstants"
import { isForeignCheckInContract } from "~/services/apiService/sub2api/checkin/foreignCheckInContract"
import type { Sub2ApiCheckInStatusAuth } from "~/services/apiService/sub2api/checkin/statusAuthentication"
import {
  fetchXingchiDailyCheckInStatus,
  performXingchiDailyCheckIn,
} from "~/services/apiService/sub2api/checkin/xingchiCheckIn"
import { XINGCHI_CHECK_IN_ENDPOINT } from "~/services/apiService/sub2api/checkin/xingchiCheckInProtocol"
import { ApiError } from "~/services/apiTransport/errors"
import type { ApiServiceRequest } from "~/services/apiTransport/type"
import { accountAward } from "~/services/checkin/autoCheckin/awards"
import {
  CHECK_IN_CONFIRMATION_KINDS,
  withCheckInConfirmation,
} from "~/services/checkin/autoCheckin/confirmation"
import { AUTO_CHECKIN_PROVIDER_FALLBACK_MESSAGE_KEYS } from "~/services/checkin/autoCheckin/providers/shared"
import type { AutoCheckinProviderOutcome } from "~/services/checkin/autoCheckin/providers/types"
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
  toSub2ApiCheckInStatus,
} from "./sub2apiShared"

/** Keep native calendar evidence local to one execution, independent of browser timezone. */
function createXingchiProvider(trackAdmission = false) {
  let latestDay: string | undefined
  const readStatus = async (
    context: AutoCheckinProviderReadContext,
    auth: Sub2ApiCheckInStatusAuth = { allowAuthenticationRecovery: false },
  ) => {
    const status = await fetchXingchiDailyCheckInStatus(
      createSub2ApiCheckInReadRequest(context),
      auth,
    )
    if (trackAdmission) latestDay = status.day
    return toSub2ApiCheckInStatus(status, context.observedAt)
  }
  const confirm = async (
    account: SiteAccount,
    request: ApiServiceRequest,
    admittedDay: string | undefined,
    outcome: AutoCheckinProviderOutcome,
  ) => {
    try {
      const status = await fetchXingchiDailyCheckInStatus(
        { ...request, observer: undefined },
        { allowAuthenticationRecovery: false },
      )
      // The deployment ignores the GET timezone parameter. A later server day
      // cannot resolve an earlier lost claim, and a missing day is inconclusive.
      if (
        outcome.status !== CHECKIN_RESULT_STATUS.UNCERTAIN ||
        (admittedDay && status.day === admittedDay)
      ) {
        return withCheckInConfirmation(account, outcome, {
          kind: CHECK_IN_CONFIRMATION_KINDS.Observed,
          status: toSub2ApiCheckInStatus(status, Date.now()),
        })
      }
    } catch {
      // Retain a confirmed grant even when its current-day readback is unavailable.
    }
    return withCheckInConfirmation(account, outcome, {
      kind: CHECK_IN_CONFIRMATION_KINDS.Unavailable,
    })
  }
  return withSub2ApiCheckInExecution(
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
            CHECK_IN_METHOD_TODAY_STATUSES.NotChecked
        ) {
          return failedSub2ApiCheckIn(
            AUTO_CHECKIN_SKIP_REASON.STATUS_UNAVAILABLE,
          )
        }
        const request =
          attempt?.request ??
          createSub2ApiCheckInMutationRequest(account as SiteAccount, context)
        const admittedDay = latestDay
        let outcome: AutoCheckinProviderOutcome
        try {
          const data = await performXingchiDailyCheckIn(request, {
            beforeRecoveredMutation: context.beforeRecoveredMutation,
          })
          outcome = {
            status: CHECKIN_RESULT_STATUS.SUCCESS,
            messageKey:
              AUTO_CHECKIN_PROVIDER_FALLBACK_MESSAGE_KEYS.checkinSuccessful,
            data,
            // The dashboard exposes the amount, but its asset is not established.
            awards: [
              accountAward(account as SiteAccount, {
                id: "check-in-amount",
                operation: XINGCHI_CHECK_IN_ENDPOINT,
                field: "amount",
                adapter: "xingchi-check-in",
                asset: { kind: ASSET_KINDS.Unknown },
                value: data.rewardAmount,
                target: AWARD_TARGETS.Unknown,
                fulfillment: AWARD_FULFILLMENT.Unknown,
              }),
            ],
          }
        } catch (error) {
          // The native endpoint reports a duplicate as a business conflict. Keep
          // the explicit "already claimed" meaning instead of reducing it to an
          // uncertain transport result and later relabeling it as success.
          if (
            error instanceof ApiError &&
            error.upstreamCode === "CHECKIN_ALREADY_CLAIMED"
          ) {
            outcome = {
              status: CHECKIN_RESULT_STATUS.ALREADY_CHECKED,
              messageKey:
                AUTO_CHECKIN_PROVIDER_FALLBACK_MESSAGE_KEYS.alreadyCheckedToday,
            }
          } else {
            outcome = mapSub2ApiCheckInMutationError(
              error,
              context,
              account as SiteAccount,
            )
          }
        }
        return confirm(account as SiteAccount, request, admittedDay, outcome)
      },
    },
    { bindInitialRead: true },
  )
}

const passiveProvider = createXingchiProvider()
export const xingchiProvider = {
  ...passiveProvider,
  forExecution: (
    context: Parameters<NonNullable<typeof passiveProvider.forExecution>>[0],
  ) => createXingchiProvider(true).forExecution!(context),
}
