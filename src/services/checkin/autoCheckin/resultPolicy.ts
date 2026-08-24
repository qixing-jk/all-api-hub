import {
  CHECKIN_RESULT_STATUS,
  type CheckinAccountResult,
} from "~/types/autoCheckin"

/** Returns whether a persisted result may enter the ordinary retry queue. */
export function isRetryableCheckinResult(
  result: CheckinAccountResult,
): boolean {
  if (result.status !== CHECKIN_RESULT_STATUS.FAILED) return false
  // Persisted pre-contract failures have no flag; keep their historical retry
  // behavior while all newly produced failures write an explicit decision.
  return result.retryable ?? true
}
