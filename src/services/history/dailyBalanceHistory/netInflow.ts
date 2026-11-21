import { LEGACY_BALANCE_SUPERSEDED_REASON } from "~/services/accounts/refresh/balanceAcceptance"
import { assetIdentity } from "~/services/amounts/assets"
import {
  balancePositionKey,
  balancePositionSchema,
  usageScopeKey,
  type Amount,
  type BalancePosition,
  type EvidenceRef,
  type UsageScope,
} from "~/services/amounts/balance"
import { sumDecimals } from "~/services/amounts/decimal"
import {
  ASSET_KINDS,
  BALANCE_ROLES,
  BALANCE_VALIDITY_KINDS,
  EVIDENCE_KINDS,
  FINANCIAL_COVERAGE,
  FINANCIAL_SETTLEMENT_STATUSES,
  OBSERVATION_STATUSES,
  SCOPE_SELECTION_KINDS,
} from "~/services/amounts/financialConstants"
import {
  financialConsumptionFactSchema,
  isCumulativeConsumption,
  type FinancialConsumptionFact,
} from "~/services/amounts/usage"

export const NET_INFLOW_REASONS = {
  Observation: "observation-unavailable",
  Identity: "incomparable-balance-observations",
  Consumption: "consumption-unavailable",
  Interval: "consumption-interval-mismatch",
  Precision: "amount-out-of-range",
} as const

export const NET_INFLOW_STATUSES = {
  Available: "available",
  Unavailable: "unavailable",
} as const

const NET_INFLOW_CLASSIFICATION = "unclassified-net-change"

export type NetInflowResult =
  | {
      status: typeof NET_INFLOW_STATUSES.Available
      amount: Amount
      scope: UsageScope
      source: EvidenceRef
      window: FinancialConsumptionFact["window"]
      partial?: true
      classification: typeof NET_INFLOW_CLASSIFICATION
    }
  | {
      status: typeof NET_INFLOW_STATUSES.Unavailable
      reason: (typeof NET_INFLOW_REASONS)[keyof typeof NET_INFLOW_REASONS]
    }

export const NET_INFLOW_MAX_CLOCK_SKEW_MS = 10 * 60_000

/** Retired legacy detail trees do not compete with wallets; failed real wallets still do. */
export function getSoleAccountBalance(
  positions: BalancePosition[],
): BalancePosition | undefined {
  const byKey = new Map(
    positions.map((position) => [balancePositionKey(position), position]),
  )
  const candidates = positions.filter((position) => {
    const visited = new Set<string>()
    let ancestor: BalancePosition | undefined = position
    while (ancestor?.amount.source.kind === EVIDENCE_KINDS.Legacy) {
      if (
        !ancestor.parentId &&
        ancestor.amount.status === OBSERVATION_STATUSES.Stale &&
        ancestor.amount.reason === LEGACY_BALANCE_SUPERSEDED_REASON
      )
        return false
      if (!ancestor.parentId) break
      // The key binds ancestry to its original collection, source and wallet.
      const parentKey = balancePositionKey(ancestor, ancestor.parentId)
      if (visited.has(parentKey)) break
      visited.add(parentKey)
      ancestor = byKey.get(parentKey)
    }
    return true
  })
  return candidates.length === 1 ? candidates[0] : undefined
}

/** A sole account balance may omit restrictions or a wallet ID that its usage endpoint supplies. */
function matchesConsumptionScope(
  balance: UsageScope,
  consumption: UsageScope,
  allowAccountBalance: boolean,
): boolean {
  if (!allowAccountBalance)
    return usageScopeKey(balance) === usageScopeKey(consumption)
  const match = {
    ...balance,
    walletId: balance.walletId ?? consumption.walletId,
  }
  for (const key of ["projects", "keys", "models", "groups"] as const) {
    if (
      match[key].kind === SCOPE_SELECTION_KINDS.Unknown &&
      consumption[key].kind === SCOPE_SELECTION_KINDS.All
    )
      match[key] = consumption[key]
  }
  return usageScopeKey(match) === usageScopeKey(consumption)
}

/** Independent wallet, asset and adapter contracts never supply each other's billing interval. */
export function isConsumptionApplicableToBalance(
  balance: BalancePosition,
  consumption: FinancialConsumptionFact,
  allowAccountBalance = false,
): boolean {
  return (
    assetIdentity(consumption.asset) === assetIdentity(balance.asset) &&
    matchesConsumptionScope(
      balance.scope,
      consumption.scope,
      allowAccountBalance &&
        balance.role === BALANCE_ROLES.Available &&
        !balance.parentId,
    ) &&
    consumption.amount.source.adapter === balance.amount.source.adapter &&
    consumption.amount.source.contractVersion ===
      balance.amount.source.contractVersion
  )
}

/** Manual and legacy amounts have no independent billing evidence. */
function hasBillingEvidence(source: EvidenceRef): boolean {
  return (
    source.kind === EVIDENCE_KINDS.Reported ||
    source.kind === EVIDENCE_KINDS.Derived
  )
}

/** Balance differences plus settled use are unclassified net changes, never confirmed income. */
export function estimateNetInflow({
  start,
  end,
  consumption,
  allowAccountBalance = false,
}: {
  start: BalancePosition
  end: BalancePosition
  consumption: FinancialConsumptionFact[]
  allowAccountBalance?: boolean
}): NetInflowResult {
  const singleBalance =
    allowAccountBalance &&
    end.role === BALANCE_ROLES.Available &&
    !start.parentId &&
    !end.parentId
  if (
    !balancePositionSchema.safeParse(start).success ||
    !balancePositionSchema.safeParse(end).success ||
    start.amount.status !== OBSERVATION_STATUSES.Known ||
    end.amount.status !== OBSERVATION_STATUSES.Known ||
    start.role !== end.role ||
    (end.role !== BALANCE_ROLES.Ledger && !singleBalance) ||
    end.asset.kind === ASSET_KINDS.Unknown ||
    !hasBillingEvidence(start.amount.source) ||
    !hasBillingEvidence(end.amount.source) ||
    start.amount.observedAt >= end.amount.observedAt
  )
    return {
      status: NET_INFLOW_STATUSES.Unavailable,
      reason: NET_INFLOW_REASONS.Observation,
    }

  const endObservedAt = end.amount.observedAt
  if (
    balancePositionKey(start) !== balancePositionKey(end) ||
    assetIdentity(start.asset) !== assetIdentity(end.asset) ||
    usageScopeKey(start.scope) !== usageScopeKey(end.scope) ||
    start.nature !== end.nature ||
    start.funding !== end.funding ||
    start.cashClassification !== end.cashClassification ||
    start.amount.source.kind !== end.amount.source.kind ||
    JSON.stringify(start.window) !== JSON.stringify(end.window) ||
    [start, end].some(
      (position) =>
        (position.validity.kind === BALANCE_VALIDITY_KINDS.Expires &&
          position.validity.at <= endObservedAt) ||
        (position.window &&
          (position.window.end <= endObservedAt ||
            (position.window.resetsAt !== undefined &&
              position.window.resetsAt <= endObservedAt))),
    )
  )
    return {
      status: NET_INFLOW_STATUSES.Unavailable,
      reason: NET_INFLOW_REASONS.Identity,
    }

  if (
    consumption.some(
      (fact) => !financialConsumptionFactSchema.safeParse(fact).success,
    )
  )
    return {
      status: NET_INFLOW_STATUSES.Unavailable,
      reason: NET_INFLOW_REASONS.Consumption,
    }
  const facts = consumption
    .filter((fact) =>
      isConsumptionApplicableToBalance(end, fact, singleBalance),
    )
    .sort((a, b) => a.window.start - b.window.start)
  const first = facts[0]
  if (
    !first ||
    facts.some(
      (fact) =>
        !financialConsumptionFactSchema.safeParse(fact).success ||
        fact.amount.status !== OBSERVATION_STATUSES.Known ||
        (fact.amount.observedAt < fact.window.end &&
          (!isCumulativeConsumption(fact) ||
            fact.amount.observedAt <= fact.window.start)) ||
        !hasBillingEvidence(fact.amount.source) ||
        fact.settlement !== FINANCIAL_SETTLEMENT_STATUSES.Settled ||
        fact.coverage === FINANCIAL_COVERAGE.Unknown ||
        assetIdentity(fact.asset) !== assetIdentity(end.asset) ||
        fact.amount.source.adapter !== end.amount.source.adapter ||
        fact.amount.source.contractVersion !==
          end.amount.source.contractVersion ||
        fact.amount.source.operation !== first.amount.source.operation ||
        fact.amount.source.kind !== first.amount.source.kind,
    )
  )
    return {
      status: NET_INFLOW_STATUSES.Unavailable,
      reason: NET_INFLOW_REASONS.Consumption,
    }

  // Account balances and usage come from separate requests. Permit small edge
  // differences without extrapolating through a material gap or an overlap.
  const span = endObservedAt - start.amount.observedAt
  const tolerance = Math.min(NET_INFLOW_MAX_CLOCK_SKEW_MS, span / 6)
  let gap = Math.abs(first.window.start - start.amount.observedAt)
  let coveredUntil = first.window.start
  for (const fact of facts) {
    if (
      fact.window.start < coveredUntil ||
      fact.window.timeZone !== first.window.timeZone
    )
      return {
        status: NET_INFLOW_STATUSES.Unavailable,
        reason: NET_INFLOW_REASONS.Interval,
      }
    gap += fact.window.start - coveredUntil
    coveredUntil =
      fact.amount.status === OBSERVATION_STATUSES.Known
        ? Math.min(fact.window.end, fact.amount.observedAt)
        : fact.window.end
  }
  gap += Math.abs(coveredUntil - endObservedAt)
  if (gap > tolerance)
    return {
      status: NET_INFLOW_STATUSES.Unavailable,
      reason: NET_INFLOW_REASONS.Interval,
    }

  try {
    const value = sumDecimals(
      [
        end.amount.value,
        ...facts.flatMap((fact) =>
          fact.amount.status === OBSERVATION_STATUSES.Known
            ? [fact.amount.value]
            : [],
        ),
      ],
      [start.amount.value],
    )
    return {
      status: NET_INFLOW_STATUSES.Available,
      amount: { asset: end.asset, value },
      scope: end.scope,
      source: {
        ...end.amount.source,
        kind: EVIDENCE_KINDS.Derived,
        inputs: [
          `${start.id}@${start.amount.observedAt}`,
          `${end.id}@${end.amount.observedAt}`,
          first.amount.source.operation,
        ],
      },
      window: {
        start: start.amount.observedAt,
        end: end.amount.observedAt,
        timeZone: first.window.timeZone,
      },
      classification: NET_INFLOW_CLASSIFICATION,
      ...(gap > 0 ||
      facts.some(({ coverage }) => coverage === FINANCIAL_COVERAGE.Partial)
        ? { partial: true as const }
        : {}),
    }
  } catch {
    return {
      status: NET_INFLOW_STATUSES.Unavailable,
      reason: NET_INFLOW_REASONS.Precision,
    }
  }
}
