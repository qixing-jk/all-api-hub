import {
  isCheckInMethodId,
  NON_REPEAT_SAFE_CHECKIN_METHOD_IDS,
} from "~/services/checkin/autoCheckin/providers/registry"
import {
  CHECKIN_RESULT_STATUS,
  type CheckinAccountResult,
  type CheckinResultStatus,
} from "~/types/autoCheckin"

import {
  AUTO_CHECKIN_SKIP_CATEGORY,
  getCheckinSkipReasonCategory,
} from "./reasonCatalog"

/**
 * Decides whether one produced failed or uncertain result may be retried later
 * the same day, and therefore what the persisted `retryable` flag carries.
 *
 * This is the single authority for the decision: providers, the execution path,
 * the crash fallback, the retry queue, and the UI all route through it, so a
 * provider cannot admit a dead end or refuse a retryable outcome by setting its
 * own flag.
 *
 * The decision is a projection of the reason code's semantic category. That
 * bucket is defined as the outcomes "the retry queue or a later run can
 * resolve", so retrying them is what the product already tells the user, and a
 * second hand-maintained list here only created room for the two to disagree.
 * `isRetryableCheckinResult` later reads the flag this returns.
 */
export function canAutomaticallyRetryCheckinResult(
  result: {
    status: CheckinResultStatus
    reasonCode?: string
    /** Ignored on purpose: a provider's conservative opinion is not a veto. */
    retryable?: boolean
  },
  methodId?: string,
): boolean {
  if (
    result.status !== CHECKIN_RESULT_STATUS.FAILED &&
    result.status !== CHECKIN_RESULT_STATUS.UNCERTAIN
  ) {
    return false
  }
  if (
    methodId != null &&
    isCheckInMethodId(methodId) &&
    NON_REPEAT_SAFE_CHECKIN_METHOD_IDS.has(methodId)
  ) {
    return false
  }
  // A result without a reason code has an unknown cause. The provider contract
  // requires one for every failure, so this only covers results already in
  // storage from before that contract: they keep their historical retry
  // behaviour instead of being silently retired by an upgrade.
  if (result.reasonCode == null) {
    return true
  }
  return (
    getCheckinSkipReasonCategory(result.reasonCode) ===
    AUTO_CHECKIN_SKIP_CATEGORY.WAITING
  )
}

/** Returns whether a persisted result may enter the ordinary retry queue. */
export function isRetryableCheckinResult(
  result: CheckinAccountResult,
): boolean {
  if (result.status === CHECKIN_RESULT_STATUS.UNCERTAIN) {
    // Legacy uncertain rows have no flag and must not start retrying.
    return result.retryable === true
  }
  if (result.status !== CHECKIN_RESULT_STATUS.FAILED) return false
  // Persisted pre-contract failures have no flag; keep their historical retry
  // behavior while all newly produced failures write an explicit decision.
  return result.retryable ?? true
}
