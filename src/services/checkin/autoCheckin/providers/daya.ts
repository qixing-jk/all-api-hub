import {
  CHECK_IN_METHOD_AVAILABILITIES,
  CHECK_IN_METHOD_STATUS_EVIDENCE_SOURCES,
  CHECK_IN_METHOD_STATUS_OUTCOMES,
  CHECK_IN_METHOD_TODAY_STATUSES,
} from "~/constants/checkIn"
import { CURRENCIES } from "~/constants/money"
import { createAccountApiRequestFromStoredAccount } from "~/services/accounts/utils/apiServiceRequest"
import {
  ASSET_KINDS,
  AWARD_FULFILLMENT,
  AWARD_TARGETS,
} from "~/services/amounts/financialConstants"
import { DAYA_ENDPOINTS } from "~/services/apiService/daya/constants"
import {
  fetchDayaCheckInOverview,
  performDayaCheckIn,
  type DayaCheckInOverview,
} from "~/services/apiService/daya/rewards"
import { composeAbortSignals } from "~/services/apiTransport/abortableTask"
import { accountAward } from "~/services/checkin/autoCheckin/awards"
import {
  CHECK_IN_CONFIRMATION_KINDS,
  createUnconfirmedCheckInResult,
  withCheckInConfirmation,
} from "~/services/checkin/autoCheckin/confirmation"
import { getCheckInMethodUnknownReason } from "~/services/checkin/autoCheckin/errors"
import type { SiteAccount } from "~/types"
import { CHECKIN_RESULT_STATUS } from "~/types/autoCheckin"
import type { CheckInMethodStatus } from "~/types/checkIn"
import { isRecord } from "~/utils/core/object"

import { createAccountCheckInRequest } from "./accountRequest"
import type { AutoCheckinProvider } from "./contracts"
import { detectWithStatusReadback } from "./detection"
import {
  AUTO_CHECKIN_PROVIDER_FALLBACK_MESSAGE_KEYS,
  getCookieAccountCheckinReadiness,
  resolveProviderErrorResult,
} from "./shared"

/** Normalize the overview using the timestamp of the actual status read. */
function normalizeStatus(
  overview: DayaCheckInOverview,
  observedAt: number,
): CheckInMethodStatus {
  return {
    outcome: CHECK_IN_METHOD_STATUS_OUTCOMES.Known,
    availability: CHECK_IN_METHOD_AVAILABILITIES.Enabled,
    today: overview.checkInClaimable
      ? CHECK_IN_METHOD_TODAY_STATUSES.NotChecked
      : CHECK_IN_METHOD_TODAY_STATUSES.Checked,
    evidence: {
      source: CHECK_IN_METHOD_STATUS_EVIDENCE_SOURCES.Probe,
      observedAt,
    },
  }
}

const getStatus: NonNullable<AutoCheckinProvider["getStatus"]> = async (
  context,
) => {
  const request =
    context.request ??
    (context.account
      ? createAccountApiRequestFromStoredAccount(context.account).request
      : undefined)
  if (!request) return undefined
  const composed = composeAbortSignals([request.abortSignal, context.signal])
  try {
    const overview = await fetchDayaCheckInOverview({
      ...request,
      ...(composed.signal ? { abortSignal: composed.signal } : {}),
    })
    return normalizeStatus(overview, context.observedAt)
  } catch (error) {
    return {
      outcome: CHECK_IN_METHOD_STATUS_OUTCOMES.Unknown,
      reason: getCheckInMethodUnknownReason(error),
      attemptedAt: context.observedAt,
    }
  } finally {
    composed.dispose()
  }
}

export const dayaProvider: AutoCheckinProvider = {
  requiresAuthoritativeStatusBeforeMutation: true,
  getReadiness: getCookieAccountCheckinReadiness,
  detect: (context) => detectWithStatusReadback(context, getStatus),
  getStatus,
  async checkIn(account, context) {
    try {
      const result = await performDayaCheckIn(
        createAccountCheckInRequest(account as SiteAccount, context),
      )
      if ("statusObservation" in result) {
        const observation = result.statusObservation
        if (!observation)
          return createUnconfirmedCheckInResult(account as SiteAccount)
        return withCheckInConfirmation(
          account as SiteAccount,
          {
            status: CHECKIN_RESULT_STATUS.ALREADY_CHECKED,
            messageKey:
              AUTO_CHECKIN_PROVIDER_FALLBACK_MESSAGE_KEYS.alreadyCheckedToday,
          },
          {
            kind: CHECK_IN_CONFIRMATION_KINDS.Observed,
            status: normalizeStatus(
              observation.observation,
              observation.observedAt,
            ),
          },
        )
      }
      return withCheckInConfirmation(
        account as SiteAccount,
        {
          status: CHECKIN_RESULT_STATUS.SUCCESS,
          messageKey:
            AUTO_CHECKIN_PROVIDER_FALLBACK_MESSAGE_KEYS.checkinSuccessful,
          rawMessage: result.message,
          data: result.data,
          ...(isRecord(result.data) &&
          result.data.currency === CURRENCIES.USD &&
          Object.hasOwn(result.data, "amount")
            ? {
                awards: [
                  accountAward(account as SiteAccount, {
                    id: "daily-checkin",
                    operation: DAYA_ENDPOINTS.CheckIn,
                    field: "amount",
                    asset: { kind: ASSET_KINDS.Currency, code: CURRENCIES.USD },
                    value: result.data.amount,
                    target: AWARD_TARGETS.Wallet,
                    fulfillment: AWARD_FULFILLMENT.Credited,
                  }),
                ],
              }
            : {}),
        },
        { kind: CHECK_IN_CONFIRMATION_KINDS.Response },
      )
    } catch (error) {
      return resolveProviderErrorResult({
        error,
        mutationDispatched: context.mutationLifecycle?.dispatched,
      })
    }
  },
}
