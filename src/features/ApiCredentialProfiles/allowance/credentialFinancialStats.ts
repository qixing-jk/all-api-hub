import { CURRENCIES } from "~/constants/money"
import {
  aggregateBalances,
  BALANCE_PURPOSES,
} from "~/services/accounts/metrics/balanceProjection"
import type { Amount } from "~/services/amounts/balance"
import { parseDecimal, sumDecimals } from "~/services/amounts/decimal"
import {
  ASSET_KINDS,
  EVIDENCE_KINDS,
  FINANCIAL_COVERAGE,
  MEASUREMENT_UNIT_KINDS,
  OBSERVATION_STATUSES,
  SCOPE_SELECTION_KINDS,
} from "~/services/amounts/financialConstants"
import { SiteHealthStatus } from "~/types"
import {
  API_CREDENTIAL_TELEMETRY_SOURCES,
  type ApiCredentialProfile,
} from "~/types/apiCredentialProfiles"
import { getDayKeyFromUnixSeconds } from "~/utils/core/dayKey"

/** Public credential summary projection; scope, observation and interval gates live together. */
export function projectCredentialFinancialStats(
  profiles: ApiCredentialProfile[],
  now: number,
) {
  const stats = profiles.reduce(
    (acc, profile) => {
      const snapshot = profile.telemetrySnapshot
      if (!snapshot) return acc
      if (snapshot.health.status === SiteHealthStatus.Healthy) {
        acc.healthyCount += 1
      } else {
        acc.unhealthyTelemetryCount += 1
      }
      const todayCost = snapshot.facts?.usage?.todayCost
      const storedUsd =
        todayCost?.unit.kind === MEASUREMENT_UNIT_KINDS.Unknown &&
        todayCost.source?.kind === EVIDENCE_KINDS.Legacy &&
        (todayCost.source.adapter ===
          API_CREDENTIAL_TELEMETRY_SOURCES.Sub2ApiUsage ||
          todayCost.source.adapter ===
            API_CREDENTIAL_TELEMETRY_SOURCES.CustomReadOnlyEndpoint)
      if (
        !todayCost ||
        (todayCost.status !== undefined &&
          todayCost.status !== OBSERVATION_STATUSES.Known)
      )
        return acc
      const value = parseDecimal(todayCost.value)
      if (value === undefined) return acc
      const unit = todayCost.unit
      const mapping =
        profile.telemetryConfig?.customEndpoint?.financialMapping?.asset
      let asset: Amount["asset"]
      if (unit.kind === MEASUREMENT_UNIT_KINDS.Money) {
        asset = { kind: ASSET_KINDS.Currency, code: unit.currency }
      } else if (storedUsd) {
        asset = { kind: ASSET_KINDS.Currency, code: CURRENCIES.USD }
      } else if (unit.kind === MEASUREMENT_UNIT_KINDS.Quota) {
        asset =
          mapping?.kind === ASSET_KINDS.Quota && mapping.id === unit.code
            ? mapping
            : {
                kind: ASSET_KINDS.Quota,
                id: unit.code,
                label: unit.label,
                displayLabel: unit.displayLabel ?? unit.label,
                displayScale: unit.displayScale ?? 1,
              }
      } else if (unit.kind === MEASUREMENT_UNIT_KINDS.Crypto) {
        asset = unit
      } else {
        return acc
      }
      const window = todayCost.window
      if (window) {
        try {
          const day = getDayKeyFromUnixSeconds(now / 1000, window.timeZone)
          if (
            window.start >= window.end ||
            window.end > now ||
            getDayKeyFromUnixSeconds(window.start / 1000, window.timeZone) !==
              day ||
            getDayKeyFromUnixSeconds(
              (window.end - 1) / 1000,
              window.timeZone,
            ) !== day
          )
            return acc
        } catch {
          return acc
        }
      } else {
        const observedAt = todayCost.observedAt ?? snapshot.lastSyncTime
        if (
          !Number.isFinite(observedAt) ||
          observedAt > now ||
          getDayKeyFromUnixSeconds(observedAt / 1000) !==
            getDayKeyFromUnixSeconds(now / 1000)
        )
          return acc
      }
      acc.reportedTodayCosts.push({
        id: profile.id,
        name: profile.name,
        amount: { asset, value },
      })
      if (
        asset.kind === ASSET_KINDS.Currency &&
        asset.code === CURRENCIES.USD &&
        todayCost.coverage === FINANCIAL_COVERAGE.Complete &&
        window &&
        todayCost.source?.kind === EVIDENCE_KINDS.Reported &&
        todayCost.scope &&
        [
          todayCost.scope.projects,
          todayCost.scope.keys,
          todayCost.scope.models,
          todayCost.scope.groups,
          ...(todayCost.scope.routes ? [todayCost.scope.routes] : []),
        ].every((selection) => selection.kind === SCOPE_SELECTION_KINDS.All)
      ) {
        acc.todayUsageWindows.add(
          JSON.stringify([window.start, window.end, window.timeZone]),
        )
        acc.todayUsagePools.add(
          JSON.stringify([
            todayCost.scope.authority,
            todayCost.scope.organizationId,
            todayCost.scope.workspaceId,
            todayCost.scope.walletId,
          ]),
        )
        acc.todayUsageValues.push(value)
        acc.todayUsageSources += 1
      }
      return acc
    },
    {
      healthyCount: 0,
      unhealthyTelemetryCount: 0,
      todayUsageSources: 0,
      reportedTodayCosts: [] as { id: string; name: string; amount: Amount }[],
      todayUsageValues: [] as string[],
      todayUsageWindows: new Set<string>(),
      todayUsagePools: new Set<string>(),
    },
  )

  let todayUsageUsd: string | undefined
  if (
    stats.todayUsageSources > 0 &&
    stats.todayUsageSources === stats.reportedTodayCosts.length &&
    stats.todayUsageWindows.size === 1 &&
    stats.todayUsagePools.size === stats.todayUsageSources
  ) {
    try {
      todayUsageUsd = sumDecimals(stats.todayUsageValues)
    } catch {
      /* Out-of-range totals remain unavailable. */
    }
  }
  const snapshots = profiles.flatMap(
    (profile) => profile.telemetrySnapshot?.facts?.balanceSnapshot ?? [],
  )
  const result = aggregateBalances(snapshots, BALANCE_PURPOSES.Available, now)
  const portfolio = {
    ...result,
    eligibleCount: profiles.length,
    coverage:
      snapshots.length === profiles.length
        ? result.coverage
        : FINANCIAL_COVERAGE.Partial,
  }
  return { telemetryStats: { ...stats, todayUsageUsd }, portfolio }
}
