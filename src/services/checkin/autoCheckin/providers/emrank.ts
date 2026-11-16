import {
  CHECK_IN_METHOD_AVAILABILITIES,
  CHECK_IN_METHOD_STATUS_EVIDENCE_SOURCES,
  CHECK_IN_METHOD_STATUS_OUTCOMES,
  CHECK_IN_METHOD_TODAY_STATUSES,
  CHECK_IN_PROVIDER_READINESS_REASONS,
} from "~/constants/checkIn"
import { createAccountApiRequestFromStoredAccount } from "~/services/accounts/utils/apiServiceRequest"
import {
  fetchCheckInState,
  performCheckIn,
  type EmRankCheckInState,
} from "~/services/apiService/emrank/checkIn"
import {
  EMRANK_CHECK_IN_STATUSES,
  EMRANK_TOKEN_ASSET,
} from "~/services/apiService/emrank/constants"
import { composeAbortSignals } from "~/services/apiTransport/abortableTask"
import {
  CHECK_IN_CONFIRMATION_KINDS,
  createUnconfirmedCheckInResult,
  withCheckInConfirmation,
  withCheckInResponseConfirmation,
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

/** Only the explicit claim state confirms today's completion. */
function normalizeStatus(
  state: EmRankCheckInState,
  observedAt: number,
): CheckInMethodStatus {
  return {
    outcome: CHECK_IN_METHOD_STATUS_OUTCOMES.Known,
    availability: state.available
      ? CHECK_IN_METHOD_AVAILABILITIES.Enabled
      : CHECK_IN_METHOD_AVAILABILITIES.Disabled,
    // The site also reports can_claim=false before its 08:00 window.
    today:
      state.status === EMRANK_CHECK_IN_STATUSES.AlreadyClaimed
        ? CHECK_IN_METHOD_TODAY_STATUSES.Checked
        : CHECK_IN_METHOD_TODAY_STATUSES.NotChecked,
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
    const state = await fetchCheckInState({
      ...request,
      ...(composed.signal ? { abortSignal: composed.signal } : {}),
    })
    return normalizeStatus(state, context.observedAt)
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

export const emRankProvider: AutoCheckinProvider = {
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
      const result = await performCheckIn(
        createAccountCheckInRequest(account as SiteAccount, context),
      )
      if ("statusObservation" in result && !result.statusObservation)
        return createUnconfirmedCheckInResult(account as SiteAccount)
      const reward = result.record
        ? { amount: result.record.reward, asset: EMRANK_TOKEN_ASSET }
        : undefined
      const outcome = {
        status: result.alreadyChecked
          ? CHECKIN_RESULT_STATUS.ALREADY_CHECKED
          : CHECKIN_RESULT_STATUS.SUCCESS,
        messageKey: result.alreadyChecked
          ? AUTO_CHECKIN_PROVIDER_FALLBACK_MESSAGE_KEYS.alreadyCheckedToday
          : AUTO_CHECKIN_PROVIDER_FALLBACK_MESSAGE_KEYS.checkinSuccessful,
        reward,
        rawMessage: result.message || undefined,
        data: result.record ? { ...result.record, unit: "token" } : undefined,
      }
      if ("statusObservation" in result && result.statusObservation)
        return withCheckInConfirmation(account as SiteAccount, outcome, {
          kind: CHECK_IN_CONFIRMATION_KINDS.Observed,
          status: normalizeStatus(
            result.statusObservation.observation,
            result.statusObservation.observedAt,
          ),
          reward,
        })
      return withCheckInResponseConfirmation(account as SiteAccount, outcome, {
        day: result.record?.day,
      })
    } catch (error) {
      return resolveProviderErrorResult({
        error,
        mutationDispatched: context.mutationLifecycle?.dispatched,
      })
    }
  },
}
