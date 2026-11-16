import {
  CHECK_IN_METHOD_AVAILABILITIES,
  CHECK_IN_METHOD_STATUS_EVIDENCE_SOURCES,
  CHECK_IN_METHOD_STATUS_OUTCOMES,
  CHECK_IN_METHOD_TODAY_STATUSES,
  CHECK_IN_PROVIDER_READINESS_REASONS,
} from "~/constants/checkIn"
import { createAccountApiRequestFromStoredAccount } from "~/services/accounts/utils/apiServiceRequest"
import {
  fetchDayaCheckInOverview,
  performDayaCheckIn,
  type DayaCheckInOverview,
} from "~/services/apiService/daya/rewards"
import { composeAbortSignals } from "~/services/apiTransport/abortableTask"
import {
  CHECK_IN_CONFIRMATION_KINDS,
  createUnconfirmedCheckInResult,
  withCheckInConfirmation,
} from "~/services/checkin/autoCheckin/confirmation"
import { getCheckInMethodUnknownReason } from "~/services/checkin/autoCheckin/errors"
import { AuthTypeEnum } from "~/types"
import type { SiteAccount } from "~/types"
import { CHECKIN_RESULT_STATUS } from "~/types/autoCheckin"
import type { CheckInMethodStatus } from "~/types/checkIn"

import { createAccountCheckInRequest } from "./accountRequest"
import type { AutoCheckinProvider } from "./contracts"
import { detectWithStatusReadback } from "./detection"
import {
  AUTO_CHECKIN_PROVIDER_FALLBACK_MESSAGE_KEYS,
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
  getReadiness(account) {
    return account.authType === AuthTypeEnum.Cookie && !!account.account_info.id
      ? { ready: true }
      : {
          ready: false,
          reason: CHECK_IN_PROVIDER_READINESS_REASONS.CredentialsMissing,
        }
  },
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
