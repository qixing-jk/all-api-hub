import {
  isCheckInMethodId,
  NON_REPEAT_SAFE_CHECKIN_METHOD_IDS,
} from "~/services/checkin/autoCheckin/providers/registry"
import {
  AUTO_CHECKIN_SKIP_REASON,
  CHECKIN_RESULT_STATUS,
  type AutoCheckinSkipReason,
  type CheckinAccountResult,
  type CheckinResultStatus,
} from "~/types/autoCheckin"

const AUTOMATIC_RETRY_DENIED_REASONS: ReadonlySet<AutoCheckinSkipReason> =
  new Set([
    AUTO_CHECKIN_SKIP_REASON.ACCOUNT_DATA_MISSING,
    AUTO_CHECKIN_SKIP_REASON.ACCOUNT_DISABLED,
    AUTO_CHECKIN_SKIP_REASON.ACCOUNT_UNAVAILABLE,
    AUTO_CHECKIN_SKIP_REASON.AUTHENTICATION_REQUIRED,
    AUTO_CHECKIN_SKIP_REASON.AUTO_CHECKIN_DISABLED,
    AUTO_CHECKIN_SKIP_REASON.CREDENTIALS_MISSING,
    AUTO_CHECKIN_SKIP_REASON.DETECTION_DISABLED,
    AUTO_CHECKIN_SKIP_REASON.EXECUTION_CONTEXT_INVALID,
    AUTO_CHECKIN_SKIP_REASON.LOGIN_PROVIDER_IN_USE,
    AUTO_CHECKIN_SKIP_REASON.METHOD_DISABLED,
    AUTO_CHECKIN_SKIP_REASON.METHOD_NOT_MATCHED,
    AUTO_CHECKIN_SKIP_REASON.METHOD_UNAVAILABLE,
    AUTO_CHECKIN_SKIP_REASON.METHOD_UNSUPPORTED,
    AUTO_CHECKIN_SKIP_REASON.NO_PROVIDER,
    AUTO_CHECKIN_SKIP_REASON.NO_SELECTED_METHOD,
    AUTO_CHECKIN_SKIP_REASON.PERMISSION_DENIED,
  ])

/** Returns whether a reason is already a clear dead end for automatic retry. */
function isAutomaticCheckinRetryDeniedReason(
  reason: AutoCheckinSkipReason | undefined,
): boolean {
  return reason != null && AUTOMATIC_RETRY_DENIED_REASONS.has(reason)
}

/**
 * Decides whether one produced failed or uncertain result may be retried later
 * the same day, and therefore what the persisted `retryable` flag carries.
 *
 * This is the single authority for the decision: providers, the execution path,
 * the crash fallback, the retry queue, and the UI all route through it, so a
 * provider cannot admit a dead end or refuse a retryable outcome by setting its
 * own flag. `isRetryableCheckinResult` later reads the flag this returns.
 */
export function canAutomaticallyRetryCheckinResult(
  result: {
    status: CheckinResultStatus
    reasonCode?: AutoCheckinSkipReason
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
  return !isAutomaticCheckinRetryDeniedReason(result.reasonCode)
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
