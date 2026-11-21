import { normalizeRecordedDailyReportScope } from "~/services/accounts/migrations/financialObservationCompatibility"
import { assetIdentity } from "~/services/amounts/assets"
import {
  isKnownOrStaleObservation,
  staleObservation,
  usageScopeKey,
} from "~/services/amounts/balance"
import { FINANCIAL_COVERAGE } from "~/services/amounts/financialConstants"
import type { FinancialIncomeFact } from "~/services/amounts/income"
import type { FinancialConsumptionFact } from "~/services/amounts/usage"

type PeriodAmountFact = FinancialConsumptionFact | FinancialIncomeFact

const collectionPeriodKey = (fact: PeriodAmountFact) => {
  const { source } = fact.amount
  return JSON.stringify([
    usageScopeKey(
      normalizeRecordedDailyReportScope(fact.scope, fact.asset, source),
    ),
    fact.window.start,
    fact.cumulative === true ? undefined : fact.window.end,
    fact.window.timeZone,
    source.adapter,
    source.operation,
    source.contractVersion,
    source.kind,
    "settlement" in fact ? fact.settlement : fact.classification,
    fact.cumulative,
  ])
}

const observationKey = (fact: PeriodAmountFact) =>
  JSON.stringify([assetIdentity(fact.asset), collectionPeriodKey(fact)])

/** A failed amount does not erase the last reading for the same source and period. */
export function acceptPeriodAmounts<T extends PeriodAmountFact>(
  previous: T[] | undefined,
  incoming: T[] | undefined,
): T[] | undefined {
  if (incoming === undefined)
    return previous?.map((fact) => ({
      ...fact,
      amount: staleObservation(fact.amount),
    }))
  const previousByKey = new Map(
    (previous ?? []).map((fact) => [observationKey(fact), fact]),
  )
  const partialPeriods = new Map<string, number>()
  for (const fact of incoming)
    if (fact.coverage === FINANCIAL_COVERAGE.Partial) {
      const key = collectionPeriodKey(fact)
      partialPeriods.set(
        key,
        Math.max(partialPeriods.get(key) ?? -Infinity, fact.window.end),
      )
    }
  const accepted = incoming.map((input) => {
    const fact = {
      ...input,
      scope: normalizeRecordedDailyReportScope(
        input.scope,
        input.asset,
        input.amount.source,
      ),
    }
    const key = observationKey(fact)
    const old = previousByKey.get(key)
    previousByKey.delete(key)
    if (
      !isKnownOrStaleObservation(fact.amount) &&
      old &&
      old.window.end <= fact.window.end &&
      isKnownOrStaleObservation(old.amount)
    )
      return {
        ...old,
        scope: normalizeRecordedDailyReportScope(
          old.scope,
          old.asset,
          old.amount.source,
        ),
        amount: staleObservation(old.amount),
      }
    return fact
  })
  for (const old of previousByKey.values()) {
    const partialEnd = partialPeriods.get(collectionPeriodKey(old))
    if (
      partialEnd !== undefined &&
      old.window.end <= partialEnd &&
      isKnownOrStaleObservation(old.amount)
    )
      accepted.push({ ...old, amount: staleObservation(old.amount) })
  }
  return accepted
}
