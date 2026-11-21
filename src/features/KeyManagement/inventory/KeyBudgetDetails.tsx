import { useTranslation } from "react-i18next"

import type { BudgetConstraint } from "~/services/amounts/budgets"
import {
  BUDGET_AMOUNT_FIELDS,
  OBSERVATION_STATUSES,
} from "~/services/amounts/financialConstants"
import {
  formatBudgetAmount,
  formatBudgetRules,
  getBudgetMetricLabel,
} from "~/utils/core/budgetPresentation"

/** Compact known metrics in the list; exact observations in the existing key details. */
export function KeyBudgetDetails({
  budget,
  compact,
}: {
  budget: BudgetConstraint
  compact: boolean
}) {
  const { t } = useTranslation(["keyManagement", "common"])
  const metrics = [
    BUDGET_AMOUNT_FIELDS.Remaining,
    BUDGET_AMOUNT_FIELDS.Used,
    BUDGET_AMOUNT_FIELDS.Limit,
    BUDGET_AMOUNT_FIELDS.Reserved,
  ] as const
  const visible = metrics.filter(
    (metric) =>
      !compact ||
      metric === BUDGET_AMOUNT_FIELDS.Remaining ||
      budget[metric].status === OBSERVATION_STATUSES.Known ||
      budget[metric].status === OBSERVATION_STATUSES.Stale,
  )
  return (
    <div className="min-w-0 space-y-1.5">
      <dl className="grid grid-cols-2 gap-x-3 gap-y-2">
        {visible.map((metric) => (
          <div key={metric} className="min-w-0">
            <dt className="text-xs text-muted-foreground">
              {getBudgetMetricLabel(metric, t)}
            </dt>
            <dd className="mt-0.5 text-sm font-semibold break-words text-foreground tabular-nums">
              {formatBudgetAmount(budget, metric, t, compact)}
            </dd>
          </div>
        ))}
      </dl>
      {formatBudgetRules(budget, t, !compact).map((rule) => (
        <p key={rule} className="text-xs break-words text-muted-foreground">
          {rule}
        </p>
      ))}
    </div>
  )
}
