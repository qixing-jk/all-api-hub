import {
  type AutoCheckinSkipReason,
  type CHECKIN_RESULT_STATUS,
  type CheckinReconciliationOutcome,
  type CheckinResultStatus,
} from "~/types/autoCheckin"

/**
 * Normalized provider result consumed by the auto check-in scheduler/UI.
 *
 * `reasonCode` stays optional here because this shape also carries rows stored
 * before the reason code became mandatory. Producers must return
 * {@link AutoCheckinProviderOutcome} instead, which requires one.
 *
 * There is deliberately no `retryable` field: whether an outcome may be retried
 * the same day belongs to the retry policy, which derives it from the reason
 * code, and a provider-side flag was ignored at every call site.
 */
export interface AutoCheckinProviderResult<
  TData = unknown,
  TMessageParams extends Record<string, unknown> = Record<string, unknown>,
> {
  status: CheckinResultStatus
  /** Absent only for a success or for a row stored before the contract. */
  reasonCode?: AutoCheckinSkipReason
  /** An i18n key (e.g. `autoCheckin:providerFallback.*`) shown to the user. */
  messageKey?: string
  messageParams?: TMessageParams
  /** A human-readable backend message when the site provided one. */
  rawMessage?: string
  reconciliation?: CheckinReconciliationOutcome
  data?: TData
}

/**
 * What a provider (or an internal failure factory) has to return.
 *
 * Every outcome that is not a success must name its reason: the retry queue,
 * the result buckets, the readiness table and the overview todo list are all
 * decided from it, so an unclassified failure would fall into the permissive
 * default and spend the day's retries on a dead end.
 */
export type AutoCheckinProviderOutcome<
  TData = unknown,
  TMessageParams extends Record<string, unknown> = Record<string, unknown>,
> =
  | (AutoCheckinProviderResult<TData, TMessageParams> & {
      status:
        | typeof CHECKIN_RESULT_STATUS.SUCCESS
        | typeof CHECKIN_RESULT_STATUS.ALREADY_CHECKED
    })
  | (AutoCheckinProviderResult<TData, TMessageParams> & {
      status:
        | typeof CHECKIN_RESULT_STATUS.FAILED
        | typeof CHECKIN_RESULT_STATUS.UNCERTAIN
        | typeof CHECKIN_RESULT_STATUS.SKIPPED
      reasonCode: AutoCheckinSkipReason
    })
