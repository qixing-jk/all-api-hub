/** A dispatched claim may have succeeded; require native verification before retry. */
export class RedemptionOutcomeUncertainError extends Error {
  readonly retryable = false
}
