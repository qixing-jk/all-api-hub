import { z } from "zod"

import { INCOME_CLASSIFICATIONS } from "~/services/amounts/financialConstants"
import { financialConsumptionFactSchema } from "~/services/amounts/usage"
import { NEW_API_FINANCIAL_CONTRACT_VERSIONS } from "~/services/apiService/newApiFamily/financialContractVersions"

/** Reported credits share amount/scope/period primitives, not consumption or net-inflow rules. */
export const financialIncomeFactSchema = financialConsumptionFactSchema
  .omit({ settlement: true })
  .extend({
    classification: z.enum(INCOME_CLASSIFICATIONS),
  })

export type FinancialIncomeFact = z.infer<typeof financialIncomeFactSchema>

/** Account income queries repeat a daily cumulative reading, including earlier saved observations. */
export function isCumulativeIncome(fact: FinancialIncomeFact): boolean {
  const { contractVersion, operation } = fact.amount.source
  return (
    fact.cumulative === true ||
    ((contractVersion === NEW_API_FINANCIAL_CONTRACT_VERSIONS.StandardUsd ||
      contractVersion === NEW_API_FINANCIAL_CONTRACT_VERSIONS.NativeQuota) &&
      operation.endsWith(":credited-quota"))
  )
}
