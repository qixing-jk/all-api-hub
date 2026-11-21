import {
  ASSET_KINDS,
  EVIDENCE_KINDS,
  FINANCIAL_SETTLEMENT_STATUSES,
  FINANCIAL_SUBJECT_KINDS,
  INCOME_CLASSIFICATIONS,
  OBSERVATION_STATUSES,
  SCOPE_SELECTION_KINDS,
  type FINANCIAL_COVERAGE,
} from "~/services/amounts/financialConstants"
import type { FinancialIncomeFact } from "~/services/amounts/income"
import type { FinancialConsumptionFact } from "~/services/amounts/usage"

/** Explicit test observations use a full local day and a proven distinct wallet. */
export function buildPeriodConsumption(
  accountId: string,
  value: string,
  code: "USD" | "CNY" = "USD",
  coverage: (typeof FINANCIAL_COVERAGE)["Complete" | "Partial"] = "complete",
): FinancialConsumptionFact {
  const start = new Date()
  start.setHours(0, 0, 0, 0)
  const end = new Date(start)
  end.setDate(end.getDate() + 1)
  return {
    asset: { kind: ASSET_KINDS.Currency, code },
    amount: {
      status: OBSERVATION_STATUSES.Known,
      value,
      observedAt: Date.now(),
      source: {
        kind: EVIDENCE_KINDS.Reported,
        adapter: "fixture",
        operation: code,
        contractVersion: "1",
      },
    },
    scope: {
      subject: { kind: FINANCIAL_SUBJECT_KINDS.Account, accountId },
      authority: "https://period.example",
      walletId: accountId,
      projects: { kind: SCOPE_SELECTION_KINDS.All },
      keys: { kind: SCOPE_SELECTION_KINDS.All },
      models: { kind: SCOPE_SELECTION_KINDS.All },
      groups: { kind: SCOPE_SELECTION_KINDS.All },
    },
    window: {
      start: start.getTime(),
      end: end.getTime(),
      timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    },
    coverage,
    settlement: FINANCIAL_SETTLEMENT_STATUSES.Settled,
  }
}

/** Income is a distinct fact domain; no settlement field or consumption inference. */
export function buildPeriodIncome(
  ...args: Parameters<typeof buildPeriodConsumption>
): FinancialIncomeFact {
  const { settlement: _settlement, ...fact } = buildPeriodConsumption(...args)
  return { ...fact, classification: INCOME_CLASSIFICATIONS.Unclassified }
}
