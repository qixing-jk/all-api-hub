import { z } from "zod"

import { assetSchema, type Asset } from "~/services/amounts/assets"
import {
  observationWindowSchema,
  observeAmount,
  observedAmountSchema,
  usageScopeSchema,
  type EvidenceRef,
  type UsageScope,
} from "~/services/amounts/balance"
import {
  FINANCIAL_COVERAGE,
  FINANCIAL_SETTLEMENT_STATUSES,
} from "~/services/amounts/financialConstants"
import { NEW_API_FINANCIAL_CONTRACT_VERSIONS } from "~/services/apiService/newApiFamily/financialContractVersions"

/** Provider usage totals retain their unit and optional coverage without asserting settlement. */
export const reportedUsageCostSchema = z.object({
  asset: assetSchema,
  amount: observedAmountSchema,
  scope: usageScopeSchema.optional(),
  window: observationWindowSchema.optional(),
  coverage: z.enum(FINANCIAL_COVERAGE).optional(),
})
export type ReportedUsageCost = z.infer<typeof reportedUsageCostSchema>

/** An amount's coverage and settlement are independent of request/token counters. */
export const financialConsumptionFactSchema = z.strictObject({
  asset: assetSchema,
  amount: observedAmountSchema,
  scope: usageScopeSchema,
  window: z
    .strictObject({
      start: z.number().finite(),
      end: z.number().finite(),
      timeZone: z
        .string()
        .min(1)
        .refine((value) => {
          try {
            new Intl.DateTimeFormat("en", { timeZone: value })
            return true
          } catch {
            return false
          }
        }, "Invalid consumption timezone"),
    })
    .refine(
      (window) => window.start < window.end,
      "Invalid consumption window",
    ),
  settlement: z.enum(FINANCIAL_SETTLEMENT_STATUSES),
  coverage: z.enum(FINANCIAL_COVERAGE),
  cumulative: z.literal(true).optional(),
})

export type FinancialConsumptionFact = z.infer<
  typeof financialConsumptionFactSchema
>

/** A log charge describes one request rather than complete window coverage. */
export function recordedLogCharge(
  asset: Asset,
  value: unknown,
  scope: UsageScope,
  source: EvidenceRef,
  at: number,
): FinancialConsumptionFact {
  return {
    asset,
    amount: observeAmount(value, source, at),
    scope,
    window: { start: at, end: at + 1, timeZone: "UTC" },
    settlement: FINANCIAL_SETTLEMENT_STATUSES.Settled,
    coverage: FINANCIAL_COVERAGE.Partial,
  }
}

/** Earlier New API observations used the requested day without a cumulative marker. */
export function isCumulativeConsumption(
  fact: FinancialConsumptionFact,
): boolean {
  const { contractVersion, operation } = fact.amount.source
  return (
    fact.cumulative === true ||
    ((contractVersion === NEW_API_FINANCIAL_CONTRACT_VERSIONS.StandardUsd ||
      contractVersion === NEW_API_FINANCIAL_CONTRACT_VERSIONS.NativeQuota) &&
      (operation === "/api/log/self/stat:quota" ||
        operation.endsWith(":consumption")))
  )
}
