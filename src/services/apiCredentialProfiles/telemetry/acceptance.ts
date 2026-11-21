import { CURRENCIES } from "~/constants/money"
import { retainUnknownBudgetFields } from "~/services/accounts/refresh/allowanceAcceptance"
import { acceptBalanceRefresh } from "~/services/accounts/refresh/balanceAcceptance"
import { assetIdentity } from "~/services/amounts/assets"
import {
  balanceSnapshotParts,
  usageScopeKey,
  type BalanceRefreshPart,
} from "~/services/amounts/balance"
import {
  staleBudgetConstraint,
  type BudgetConstraint,
} from "~/services/amounts/budgets"
import {
  ASSET_KINDS,
  EVIDENCE_KINDS,
  FINANCIAL_ENUMERATION,
  OBSERVATION_STATUSES,
} from "~/services/amounts/financialConstants"
import { NEW_API_FINANCIAL_CONTRACT_VERSIONS } from "~/services/apiService/newApiFamily/financialContractVersions"
import type {
  ApiCredentialTelemetryQuotaWindowFact,
  ApiCredentialTelemetrySnapshot,
} from "~/types/apiCredentialProfiles"
import {
  API_CREDENTIAL_TELEMETRY_FACT_UNITS,
  API_CREDENTIAL_TELEMETRY_SOURCES,
} from "~/types/apiCredentialProfiles"

const budgetKey = (budget: BudgetConstraint) =>
  JSON.stringify([
    assetIdentity(budget.asset),
    usageScopeKey(budget.scope),
    budget.limit.source.adapter,
    budget.limit.source.operation,
    budget.limit.source.contractVersion,
    budget.window.kind,
    "period" in budget.window ? budget.window.period : undefined,
  ])
/** Financial merge runs only after the profile store admits this response under its lock. */
export function acceptTelemetrySnapshot(
  previous: ApiCredentialTelemetrySnapshot | undefined,
  next: ApiCredentialTelemetrySnapshot,
  balanceEnumeration: BalanceRefreshPart["enumeration"] = FINANCIAL_ENUMERATION.Partial,
): ApiCredentialTelemetrySnapshot {
  const oldBalance = previous?.facts?.balanceSnapshot
  const newBalance = next.facts?.balanceSnapshot
  const facts = { ...next.facts }
  if (previous?.facts?.balances && !facts.balances) {
    facts.balances = previous.facts.balances.map((balance) => ({
      ...balance,
      semantics: API_CREDENTIAL_TELEMETRY_FACT_UNITS.semantics.Legacy,
      status: OBSERVATION_STATUSES.Stale,
    }))
  }
  if (previous?.facts?.usage) {
    const currentUsage = facts.usage
    facts.usage = { ...currentUsage }
    for (const field of [
      "todayCost",
      "todayRequests",
      "totalUsed",
      "totalGranted",
      "totalAvailable",
    ] as const) {
      const old = previous.facts.usage[field]
      if (!currentUsage?.[field] && old)
        facts.usage[field] = { ...old, status: OBSERVATION_STATUSES.Stale }
    }
  }
  if (previous?.facts?.quota) {
    const key = (window: ApiCredentialTelemetryQuotaWindowFact) =>
      JSON.stringify([
        window.type,
        window.unit,
        window.source?.adapter,
        window.source?.operation,
        window.source?.contractVersion,
        window.scope && usageScopeKey(window.scope),
      ])
    const fresh = facts.quota?.windows ?? []
    const known = new Set(fresh.map(key))
    const stale = previous.facts.quota.windows
      .filter((window) => !known.has(key(window)))
      .map((window) => ({ ...window, status: OBSERVATION_STATUSES.Stale }))
    facts.quota = {
      ...(facts.quota ?? previous.facts.quota),
      windows: [...fresh, ...stale],
    }
  }
  if (previous?.facts?.budgets) {
    const fresh = facts.budgets ?? []
    const priorBudgets = new Map(
      previous.facts.budgets.map((budget) => [budgetKey(budget), budget]),
    )
    const known = new Set(fresh.map(budgetKey))
    facts.budgets = [
      ...fresh.map((budget) => {
        const prior = priorBudgets.get(budgetKey(budget))
        return prior &&
          JSON.stringify(prior.window) === JSON.stringify(budget.window)
          ? retainUnknownBudgetFields(prior, budget)
          : budget
      }),
      // Only the preceding default New API representation is superseded by this same key observation.
      ...previous.facts.budgets
        .filter(
          (budget) =>
            !known.has(budgetKey(budget)) &&
            !fresh.some(
              (current) =>
                budget.asset.kind === ASSET_KINDS.Quota &&
                budget.asset.id === `${budget.scope.authority}:new-api-quota` &&
                budget.limit.source.adapter ===
                  API_CREDENTIAL_TELEMETRY_SOURCES.NewApiTokenUsage &&
                budget.limit.source.contractVersion === "2" &&
                current.asset.kind === ASSET_KINDS.Currency &&
                current.asset.code === CURRENCIES.USD &&
                current.limit.source.adapter === budget.limit.source.adapter &&
                current.limit.source.operation ===
                  budget.limit.source.operation &&
                current.limit.source.contractVersion ===
                  NEW_API_FINANCIAL_CONTRACT_VERSIONS.StandardUsd &&
                usageScopeKey(current.scope) === usageScopeKey(budget.scope) &&
                JSON.stringify(current.window) ===
                  JSON.stringify(budget.window) &&
                (current.stateObservation.status ===
                  OBSERVATION_STATUSES.Known ||
                  current.used.status === OBSERVATION_STATUSES.Known),
            ),
        )
        .map((budget) => staleBudgetConstraint(budget)),
    ]
  }
  if (oldBalance || newBalance) {
    const parts = newBalance
      ? balanceSnapshotParts(newBalance, balanceEnumeration)
      : []
    if (newBalance && parts.length === 0 && next.source)
      parts.push({
        collectionKey: next.source,
        source: {
          adapter: next.source,
          operation: next.source,
          contractVersion: "2",
          kind: EVIDENCE_KINDS.Reported,
        },
        enumeration: balanceEnumeration,
        positions: [],
      })
    facts.balanceSnapshot = acceptBalanceRefresh(
      oldBalance,
      parts,
      (newBalance ?? oldBalance)!.subject,
      next.lastSyncTime,
    )
  }
  return {
    ...next,
    facts,
    ...(next.lastSuccessTime === undefined &&
    previous?.lastSuccessTime !== undefined
      ? { lastSuccessTime: previous.lastSuccessTime }
      : {}),
  }
}
