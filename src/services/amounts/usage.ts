import { z } from "zod"

import {
  assetIdentity,
  assetSchema,
  type Asset,
} from "~/services/amounts/assets"
import {
  observationWindowSchema,
  observeAmount,
  observedAmountSchema,
  usageScopeKey,
  usageScopeSchema,
  type EvidenceRef,
  type UsageScope,
} from "~/services/amounts/balance"
import { addDecimal } from "~/services/amounts/decimal"
import {
  EVIDENCE_KINDS,
  FINANCIAL_COVERAGE,
  FINANCIAL_SETTLEMENT_STATUSES,
  OBSERVATION_STATUSES,
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

/**
 * Summarize observed log charges without claiming complete billing coverage.
 * Matching streams retain their enclosing interval and native scope; unknown
 * amounts remain separate observations instead of becoming numeric zero.
 */
export function mergeRecordedConsumption(
  existing: FinancialConsumptionFact[],
  incoming: FinancialConsumptionFact[],
): FinancialConsumptionFact[] {
  const grouped = new Map<string, FinancialConsumptionFact>()
  const unknown: FinancialConsumptionFact[] = []
  for (const fact of [...existing, ...incoming]) {
    if (
      fact.amount.status !== OBSERVATION_STATUSES.Known ||
      fact.amount.source.kind === EVIDENCE_KINDS.Manual ||
      fact.amount.source.kind === EVIDENCE_KINDS.Legacy
    ) {
      unknown.push(fact)
      continue
    }
    const source = fact.amount.source
    const key = JSON.stringify([
      assetIdentity(fact.asset),
      usageScopeKey(fact.scope),
      source.adapter,
      source.operation,
      source.contractVersion,
      fact.settlement,
      fact.window.timeZone,
    ])
    const prior = grouped.get(key)
    let value = fact.amount.value
    if (prior?.amount.status === OBSERVATION_STATUSES.Known) {
      try {
        value = addDecimal(prior.amount.value, value)
      } catch {
        unknown.push({
          ...fact,
          amount: {
            status: OBSERVATION_STATUSES.Unavailable,
            source,
            reason: "amount-out-of-range",
          },
        })
        grouped.delete(key)
        continue
      }
    }
    grouped.set(key, {
      ...fact,
      coverage: FINANCIAL_COVERAGE.Partial,
      window: {
        ...fact.window,
        start: Math.min(
          prior?.window.start ?? fact.window.start,
          fact.window.start,
        ),
        end: Math.max(prior?.window.end ?? fact.window.end, fact.window.end),
      },
      amount: {
        status: OBSERVATION_STATUSES.Known,
        value,
        source: {
          ...source,
          kind: EVIDENCE_KINDS.Derived,
          inputs: [source.operation],
        },
        observedAt: Math.max(
          prior?.amount.status === OBSERVATION_STATUSES.Known
            ? prior.amount.observedAt
            : fact.amount.observedAt,
          fact.amount.observedAt,
        ),
      },
    })
  }
  return [...grouped.values(), ...unknown]
}
