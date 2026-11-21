import { isKnownOrStaleObservation } from "~/services/amounts/balance"
import {
  staleBudgetConstraint,
  type BudgetConstraint,
} from "~/services/amounts/budgets"
import {
  BUDGET_AMOUNT_FIELDS,
  BUDGET_LIMIT_STATES,
  BUDGET_OBSERVATION_FIELDS,
} from "~/services/amounts/financialConstants"

/** Preserve missing budget fields independently, without recomputing mixed-time amounts. */
export const retainUnknownBudgetFields = (
  previous: BudgetConstraint,
  next: BudgetConstraint,
): BudgetConstraint => {
  const stale = staleBudgetConstraint(previous)
  const result = { ...next }
  for (const field of BUDGET_OBSERVATION_FIELDS) {
    if (
      (field === BUDGET_AMOUNT_FIELDS.Limit ||
        field === BUDGET_AMOUNT_FIELDS.Remaining) &&
      (next.limitState === BUDGET_LIMIT_STATES.Unlimited ||
        next.limitState === BUDGET_LIMIT_STATES.Unconfigured)
    )
      continue
    if (!isKnownOrStaleObservation(next[field])) {
      // Observation fields share one discriminant; retain each value's own source and time.
      Object.assign(result, { [field]: stale[field] })
    }
  }
  if (!isKnownOrStaleObservation(next.stateObservation)) {
    result.limitState = stale.limitState
    result.stateObservation = stale.stateObservation
  }
  return result
}
