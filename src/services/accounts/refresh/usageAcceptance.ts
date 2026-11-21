import { ACCOUNT_USAGE_SCOPES } from "~/constants/accountUsage"
import { normalizeRecordedDailyReportScope } from "~/services/accounts/migrations/financialObservationCompatibility"
import { assetIdentity } from "~/services/amounts/assets"
import {
  isKnownOrStaleObservation,
  staleObservation,
  usageScopeKey,
} from "~/services/amounts/balance"
import { OBSERVATION_STATUSES } from "~/services/amounts/financialConstants"
import type { AccountUsageSummary } from "~/types"

/** Failure changes freshness, never the original measurement or its clock. */
export function staleUsageSummary(
  usage: AccountUsageSummary,
): AccountUsageSummary {
  return {
    ...usage,
    lastKnown: true,
    ...(usage.cost
      ? { cost: { ...usage.cost, amount: staleObservation(usage.cost.amount) } }
      : {}),
  }
}

const usageKey = (usage: AccountUsageSummary) => {
  const cost = usage.cost
  // A daily report grows from one fixed period start; arbitrary intervals stay separate.
  const window = cost?.window
  const period =
    window &&
    (usage.scope === ACCOUNT_USAGE_SCOPES.Today ||
      usage.scope === ACCOUNT_USAGE_SCOPES.SiteToday)
      ? { ...window, end: undefined }
      : window
  return JSON.stringify([
    usage.scope,
    usage.reportedDay,
    cost && assetIdentity(cost.asset),
    cost?.scope &&
      usageScopeKey(
        normalizeRecordedDailyReportScope(
          cost.scope,
          cost.asset,
          cost.amount.source,
        ),
      ),
    period,
    cost?.amount.source.adapter,
    cost?.amount.source.operation,
    cost?.amount.source.contractVersion,
    cost?.amount.source.kind,
  ])
}

/** Snapshot-only usage endpoints do not prove that omitted sources disappeared. */
export function acceptUsageObservations(
  previous: AccountUsageSummary[] | undefined,
  incoming: AccountUsageSummary[] | undefined,
): AccountUsageSummary[] | undefined {
  if (!previous && !incoming) return undefined
  const pending = new Map(
    (previous ?? []).map((usage) => [usageKey(usage), usage]),
  )
  const accepted = (incoming ?? []).map((incomingUsage) => {
    const usage = {
      ...incomingUsage,
      ...(incomingUsage.cost?.scope
        ? {
            cost: {
              ...incomingUsage.cost,
              scope: normalizeRecordedDailyReportScope(
                incomingUsage.cost.scope,
                incomingUsage.cost.asset,
                incomingUsage.cost.amount.source,
              ),
            },
          }
        : {}),
      observedAt: incomingUsage.observedAt ?? Date.now(),
      lastKnown: incomingUsage.lastKnown ?? false,
    }
    const key = usageKey(usage)
    const old = pending.get(key)
    if (
      old?.cost &&
      usage.cost &&
      usage.cost.amount.status !== OBSERVATION_STATUSES.Known &&
      isKnownOrStaleObservation(old.cost.amount)
    ) {
      if (
        old.cost.window &&
        usage.cost.window &&
        old.cost.window.end > usage.cost.window.end
      )
        return usage
      pending.delete(key)
      return {
        ...usage,
        cost: {
          ...old.cost,
          ...(old.cost.scope
            ? {
                scope: normalizeRecordedDailyReportScope(
                  old.cost.scope,
                  old.cost.asset,
                  old.cost.amount.source,
                ),
              }
            : {}),
          amount: staleObservation(old.cost.amount),
        },
      }
    }
    pending.delete(key)
    return usage
  })
  return [...accepted, ...Array.from(pending.values(), staleUsageSummary)]
}
