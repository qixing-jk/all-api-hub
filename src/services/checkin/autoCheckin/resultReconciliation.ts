import {
  CHECK_IN_METHOD_AVAILABILITIES,
  CHECK_IN_METHOD_STATUS_OUTCOMES,
  CHECK_IN_METHOD_TODAY_STATUSES,
} from "~/constants/checkIn"
import { AUTO_CHECKIN_PROVIDER_FALLBACK_MESSAGE_KEYS } from "~/services/checkin/autoCheckin/providers/shared"
import type {
  AutoCheckinProviderOutcome,
  AutoCheckinProviderResult,
} from "~/services/checkin/autoCheckin/providers/types"
import {
  AUTO_CHECKIN_SKIP_CATEGORY,
  getCheckinSkipReasonCategory,
} from "~/services/checkin/autoCheckin/reasonCatalog"
import {
  AUTO_CHECKIN_SKIP_REASON,
  CHECKIN_RECONCILIATION_OUTCOME,
  CHECKIN_RESULT_STATUS,
  getAutoCheckinSkipReasonTranslationKey,
  type CheckInReward,
} from "~/types/autoCheckin"
import type { CheckInMethodStatus } from "~/types/checkIn"

type ConfirmedCheckInResult = Extract<
  AutoCheckinProviderOutcome,
  {
    status:
      | typeof CHECKIN_RESULT_STATUS.SUCCESS
      | typeof CHECKIN_RESULT_STATUS.ALREADY_CHECKED
  }
>

/** Build a confirmed result without inheriting obsolete failure copy or reasons. */
export function createConfirmedCheckInResult(input: {
  status: ConfirmedCheckInResult["status"]
  reward?: CheckInReward
  data?: unknown
}): ConfirmedCheckInResult {
  return {
    status: input.status,
    messageKey:
      input.status === CHECKIN_RESULT_STATUS.SUCCESS
        ? AUTO_CHECKIN_PROVIDER_FALLBACK_MESSAGE_KEYS.checkinSuccessful
        : AUTO_CHECKIN_PROVIDER_FALLBACK_MESSAGE_KEYS.alreadyCheckedToday,
    ...(input.reward ? { reward: input.reward } : {}),
    data: input.data,
  }
}

/**
 * Reconcile an attempt with its final authenticated observation. Querying the
 * provider, retaining its session and deciding retry eligibility belong to the
 * caller; this policy only interprets evidence and never performs I/O.
 */
export function reconcileCheckInResult<
  T extends AutoCheckinProviderResult,
>(input: {
  result: T
  status: CheckInMethodStatus | undefined
  reward?: CheckInReward
}): T | AutoCheckinProviderOutcome {
  const { result, status } = input
  const uncertain = result.status === CHECKIN_RESULT_STATUS.UNCERTAIN
  const unresolved = (
    reconciliation: AutoCheckinProviderResult["reconciliation"],
  ) => (uncertain ? { ...result, reconciliation } : result)
  if (status?.outcome !== CHECK_IN_METHOD_STATUS_OUTCOMES.Known) {
    return unresolved(
      status
        ? CHECKIN_RECONCILIATION_OUTCOME.UNKNOWN
        : CHECKIN_RECONCILIATION_OUTCOME.UNAVAILABLE,
    )
  }
  if (status.today === CHECK_IN_METHOD_TODAY_STATUSES.Checked) {
    const observedCompletionOnly =
      result.status === CHECKIN_RESULT_STATUS.FAILED &&
      getCheckinSkipReasonCategory(result.reasonCode) ===
        AUTO_CHECKIN_SKIP_CATEGORY.WAITING
    // Preserve grants and definitive authentication/account/persistence failures.
    if (
      !observedCompletionOnly &&
      !uncertain &&
      result.reasonCode !==
        AUTO_CHECKIN_SKIP_REASON.MANUAL_VERIFICATION_REQUIRED
    )
      return result
    return {
      ...createConfirmedCheckInResult({
        status: observedCompletionOnly
          ? CHECKIN_RESULT_STATUS.ALREADY_CHECKED
          : CHECKIN_RESULT_STATUS.SUCCESS,
        data: result.data,
        reward: input.reward,
      }),
      reconciliation: CHECKIN_RECONCILIATION_OUTCOME.CHECKED,
    }
  }
  // An inconclusive or lagging read must not erase a confirmed provider grant.
  if (!uncertain) return result
  if (status.availability === CHECK_IN_METHOD_AVAILABILITIES.Disabled) {
    return {
      ...result,
      status: CHECKIN_RESULT_STATUS.FAILED,
      reasonCode: AUTO_CHECKIN_SKIP_REASON.METHOD_DISABLED,
      messageKey: getAutoCheckinSkipReasonTranslationKey(
        AUTO_CHECKIN_SKIP_REASON.METHOD_DISABLED,
      ),
      reconciliation: CHECKIN_RECONCILIATION_OUTCOME.NOT_CHECKED,
    }
  }
  if (status.today === CHECK_IN_METHOD_TODAY_STATUSES.NotChecked) {
    const reasonCode =
      result.reasonCode ?? AUTO_CHECKIN_SKIP_REASON.CHECKIN_UNCONFIRMED
    return {
      ...result,
      status: CHECKIN_RESULT_STATUS.FAILED,
      reasonCode,
      messageKey: result.reasonCode
        ? result.messageKey
        : getAutoCheckinSkipReasonTranslationKey(reasonCode),
      reconciliation: CHECKIN_RECONCILIATION_OUTCOME.NOT_CHECKED,
    }
  }
  return unresolved(CHECKIN_RECONCILIATION_OUTCOME.UNKNOWN)
}
