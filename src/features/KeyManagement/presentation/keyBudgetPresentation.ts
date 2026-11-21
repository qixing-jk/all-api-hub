import type { TFunction } from "i18next"

import type { AccountKeyDisplayFact } from "~/services/apiAdapters/contracts/accountKeyResource"
import { ACCOUNT_KEY_FINANCIAL_FACT_KINDS } from "~/services/apiAdapters/contracts/accountKeyResource"
import {
  formatBudgetAmount,
  formatBudgetConstraint,
  formatBudgetObservedAmount,
} from "~/utils/core/budgetPresentation"

/** Native and OpenRouter cards consume the shared finance presentation boundary. */
export function formatKeyFinancialFact(
  fact: Extract<
    AccountKeyDisplayFact,
    {
      kind: (typeof ACCOUNT_KEY_FINANCIAL_FACT_KINDS)[keyof typeof ACCOUNT_KEY_FINANCIAL_FACT_KINDS]
    }
  >,
  t: TFunction,
): string {
  if (fact.kind === ACCOUNT_KEY_FINANCIAL_FACT_KINDS.Allocation)
    return formatBudgetObservedAmount(
      fact.position.amount,
      fact.position.asset,
      t,
    )
  return fact.metric
    ? formatBudgetAmount(fact.budget, fact.metric, t)
    : formatBudgetConstraint(fact.budget, t)
}
