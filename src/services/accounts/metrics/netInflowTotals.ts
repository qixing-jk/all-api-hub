import { assetIdentity } from "~/services/amounts/assets"
import {
  balanceMetricKey,
  usageScopeKey,
  type Amount,
  type BalancePosition,
} from "~/services/amounts/balance"
import { sumDecimals } from "~/services/amounts/decimal"
import {
  ASSET_KINDS,
  FINANCIAL_COVERAGE,
} from "~/services/amounts/financialConstants"
import {
  NET_INFLOW_MAX_CLOCK_SKEW_MS,
  NET_INFLOW_REASONS,
  NET_INFLOW_STATUSES,
  type NetInflowResult,
} from "~/services/history/dailyBalanceHistory/netInflow"
import type { DisplaySiteData } from "~/types"
import { TODAY_INCOME_ESTIMATE_STATUS } from "~/types/dailyBalanceHistory"

export const NET_INFLOW_EXCLUSION_REASONS = {
  DuplicateWallet: "duplicate-wallet",
  WalletConflict: "wallet-conflict",
} as const

type AvailableNetInflow = Extract<
  NetInflowResult,
  { status: typeof NET_INFLOW_STATUSES.Available }
>
export type NetInflowContribution = {
  accountId: string
  seriesKey: string
  position: BalancePosition
  estimate: AvailableNetInflow
}
export type NetInflowGroup = {
  key: string
  amount: Amount
  window: AvailableNetInflow["window"]
  contributions: NetInflowContribution[]
}
export type NetInflowTotals = {
  groups: NetInflowGroup[]
  availableAccounts: number
  totalAccounts: number
  excluded: {
    accountId: string
    seriesKey?: string
    position?: BalancePosition
    reason: string
  }[]
  duplicateCount: number
  potentialDuplicateCount: number
  coverage: (typeof FINANCIAL_COVERAGE)["Complete" | "Partial"]
}

/** Apply the same bounded tolerance used for an individual estimate. */
function nearbyWindows(
  a: AvailableNetInflow["window"],
  b: AvailableNetInflow["window"],
): boolean {
  const tolerance = Math.min(
    NET_INFLOW_MAX_CLOCK_SKEW_MS,
    (a.end - a.start) / 6,
    (b.end - b.start) / 6,
  )
  return (
    a.timeZone === b.timeZone &&
    Math.abs(a.start - b.start) <= tolerance &&
    Math.abs(a.end - b.end) <= tolerance
  )
}

/** Sum comparable observations for independent wallets and retain their coverage. */
export function buildNetInflowTotals(
  sites: DisplaySiteData[],
): NetInflowTotals {
  const eligible = sites.filter(
    (site) => !site.disabled && !site.excludeFromTodayIncome,
  )
  const groups = new Map<string, NetInflowGroup>()
  const excluded: NetInflowTotals["excluded"] = []
  const wallets = new Map<string, NetInflowContribution[]>()
  let duplicateCount = 0
  let variedWindows = false
  const groupKey = (result: AvailableNetInflow) =>
    JSON.stringify([
      assetIdentity(result.amount.asset),
      result.window.start,
      result.window.end,
      result.window.timeZone,
    ])
  for (const site of eligible) {
    const estimates = site.netInflowEstimate?.estimates ?? []
    if (!estimates.length) {
      excluded.push({
        accountId: site.id,
        reason:
          site.netInflowEstimate?.status ??
          TODAY_INCOME_ESTIMATE_STATUS.missingCurrentSnapshot,
      })
      continue
    }
    for (const item of estimates) {
      const result = item.netInflow
      if (result?.status !== NET_INFLOW_STATUSES.Available) {
        excluded.push({
          accountId: site.id,
          seriesKey: item.seriesKey,
          position: item.position,
          reason: result?.reason ?? item.status,
        })
        continue
      }
      const walletKey = JSON.stringify([
        assetIdentity(result.amount.asset),
        result.scope.authority,
        result.scope.organizationId,
        result.scope.walletId,
        result.scope.workspaceId,
        result.scope.walletId ||
        result.scope.organizationId ||
        result.scope.workspaceId
          ? undefined
          : result.scope.subject,
      ])
      const entries = wallets.get(walletKey) ?? []
      entries.push({
        accountId: site.id,
        seriesKey: item.seriesKey,
        position: item.position,
        estimate: result,
      })
      wallets.set(walletKey, entries)
    }
  }
  const accepted: NetInflowContribution[] = []
  for (const entries of wallets.values()) {
    entries.sort(
      (a, b) =>
        b.estimate.window.end - a.estimate.window.end ||
        a.accountId.localeCompare(b.accountId) ||
        a.seriesKey.localeCompare(b.seriesKey),
    )
    const first = entries[0]!
    const signature = (entry: NetInflowContribution) =>
      JSON.stringify([
        // Restricted views of one wallet do not prove independently additive funds.
        usageScopeKey(entry.estimate.scope, false),
        balanceMetricKey(entry.position),
        entry.estimate.source.adapter,
        entry.estimate.source.operation,
        entry.estimate.source.contractVersion,
        entry.estimate.source.kind,
      ])
    if (
      entries.some(
        (entry) =>
          signature(entry) !== signature(first) ||
          !nearbyWindows(entry.estimate.window, first.estimate.window) ||
          (entry.estimate.window.end === first.estimate.window.end &&
            entry.estimate.amount.value !== first.estimate.amount.value),
      )
    ) {
      excluded.push(
        ...entries.map((entry) => ({
          accountId: entry.accountId,
          seriesKey: entry.seriesKey,
          reason: NET_INFLOW_EXCLUSION_REASONS.WalletConflict,
        })),
      )
      continue
    }
    duplicateCount += entries.length - 1
    excluded.push(
      ...entries
        .filter((entry) => entry !== first)
        .map((entry) => ({
          accountId: entry.accountId,
          seriesKey: entry.seriesKey,
          reason: NET_INFLOW_EXCLUSION_REASONS.DuplicateWallet,
        })),
    )
    accepted.push(first)
  }
  // The tolerance can overlap without being transitive. Give first-fit a stable order.
  accepted.sort(
    ({ estimate: a }, { estimate: b }) =>
      Number(b.amount.asset.kind === ASSET_KINDS.Currency) -
        Number(a.amount.asset.kind === ASSET_KINDS.Currency) ||
      assetIdentity(a.amount.asset).localeCompare(
        assetIdentity(b.amount.asset),
      ) ||
      a.window.timeZone.localeCompare(b.window.timeZone) ||
      a.window.start - b.window.start ||
      a.window.end - b.window.end,
  )
  for (const contribution of accepted) {
    const result = contribution.estimate
    const asset = assetIdentity(result.amount.asset)
    const group = [...groups.values()].find(
      (group) =>
        assetIdentity(group.amount.asset) === asset &&
        group.contributions.every(({ estimate }) =>
          nearbyWindows(estimate.window, result.window),
        ),
    )
    if (group) {
      variedWindows ||= groupKey(result) !== group.key
      group.contributions.push(contribution)
      group.window = {
        ...group.window,
        start: Math.min(group.window.start, result.window.start),
        end: Math.max(group.window.end, result.window.end),
      }
    } else {
      const key = groupKey(result)
      groups.set(key, {
        key,
        amount: result.amount,
        window: result.window,
        contributions: [contribution],
      })
    }
  }
  for (const [key, group] of groups) {
    try {
      group.amount = {
        ...group.amount,
        value: sumDecimals(
          group.contributions.map((item) => item.estimate.amount.value),
        ),
      }
    } catch {
      groups.delete(key)
      excluded.push(
        ...group.contributions.map((item) => ({
          accountId: item.accountId,
          seriesKey: item.seriesKey,
          position: item.position,
          reason: NET_INFLOW_REASONS.Precision,
        })),
      )
    }
  }
  const availableAccountIds = new Set(
    [...groups.values()].flatMap((group) =>
      group.contributions.map((item) => item.accountId),
    ),
  )
  let potentialDuplicateCount = 0
  for (const group of groups.values()) {
    const authorities = new Map<string, NetInflowContribution[]>()
    for (const contribution of group.contributions) {
      const authority = contribution.estimate.scope.authority
      authorities.set(authority, [
        ...(authorities.get(authority) ?? []),
        contribution,
      ])
    }
    for (const contributions of authorities.values()) {
      const unknown = contributions.filter(
        ({ estimate }) =>
          !estimate.scope.walletId &&
          !estimate.scope.organizationId &&
          !estimate.scope.workspaceId,
      ).length
      if (contributions.length > 1 && unknown > 0)
        potentialDuplicateCount +=
          unknown === contributions.length ? unknown - 1 : unknown
    }
  }
  return {
    groups: [...groups.values()],
    availableAccounts: availableAccountIds.size,
    totalAccounts: eligible.length,
    excluded,
    duplicateCount,
    potentialDuplicateCount,
    coverage:
      variedWindows ||
      potentialDuplicateCount > 0 ||
      [...groups.values()].some(({ contributions }) =>
        contributions.some(({ estimate }) => estimate.partial),
      ) ||
      excluded.some(
        (item) => item.reason !== NET_INFLOW_EXCLUSION_REASONS.DuplicateWallet,
      )
        ? FINANCIAL_COVERAGE.Partial
        : FINANCIAL_COVERAGE.Complete,
  }
}
