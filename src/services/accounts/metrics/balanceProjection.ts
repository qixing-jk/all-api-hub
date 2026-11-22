import { CURRENCIES } from "~/constants/money"
import {
  BALANCE_IDENTITY_CHANGED_REASON,
  LEGACY_BALANCE_SUPERSEDED_REASON,
} from "~/services/accounts/refresh/balanceAcceptance"
import { assetIdentity, type Asset } from "~/services/amounts/assets"
import {
  balanceMetricKey,
  balancePositionKey,
  financialCollectionKey,
  isKnownOrStaleObservation,
  usageScopeKey,
  type Amount,
  type BalancePosition,
  type BalanceSnapshot,
  type UsageScope,
} from "~/services/amounts/balance"
import { sumDecimals } from "~/services/amounts/decimal"
import {
  ASSET_KINDS,
  BALANCE_NATURES,
  BALANCE_RELATIONS,
  BALANCE_ROLES,
  BALANCE_VALIDITY_KINDS,
  EVIDENCE_KINDS,
  FINANCIAL_ACCOUNT_EXCLUSION_REASONS,
  FINANCIAL_COVERAGE,
  OBSERVATION_STATUSES,
  SCOPE_SELECTION_KINDS,
} from "~/services/amounts/financialConstants"
import type { CurrencyType, DisplaySiteData } from "~/types"
import { convertCnyToUsd, convertUsdToCny } from "~/utils/core/money"

export const BALANCE_PURPOSES = {
  Card: "card",
  History: "history",
  Prepaid: "prepaid",
  Available: "available",
  Sort: "sort",
} as const

export const BALANCE_EXCLUSION_REASONS = {
  Observation: "observation",
  Asset: "asset",
  Role: "role",
  Nature: "nature",
  ScopeUnknown: "scope-unknown",
  Restricted: "restricted",
  Validity: "validity",
  Overlap: "overlap",
  Legacy: "legacy",
  Conflict: "conflict",
} as const

const BALANCE_CONFLICT_REASONS = {
  IncomparableObservations: "incomparable-observations",
  ConflictingObservations: "conflicting-observations",
  AmountOutOfRange: "amount-out-of-range",
} as const

export type BalanceExclusion = {
  position: BalancePosition
  reason: (typeof BALANCE_EXCLUSION_REASONS)[keyof typeof BALANCE_EXCLUSION_REASONS]
}
type BalanceConflict = {
  positions: BalancePosition[]
  reason: (typeof BALANCE_CONFLICT_REASONS)[keyof typeof BALANCE_CONFLICT_REASONS]
}

/** Selects the account row's primary amounts without adding independent balances together. */
export function getDisplayBalancePositions(
  snapshot?: BalanceSnapshot,
): BalancePosition[] {
  const positions = snapshot?.positions ?? []
  const primaryPositions = positions.filter(
    (position) =>
      !(
        position.amount.status === OBSERVATION_STATUSES.Stale &&
        position.amount.reason === LEGACY_BALANCE_SUPERSEDED_REASON
      ),
  )
  const roots = primaryPositions.filter(
    (position) =>
      (!position.parentId ||
        (position.relation === BALANCE_RELATIONS.Summary &&
          positions.some(
            (parent) =>
              parent.role === BALANCE_ROLES.Ledger &&
              balancePositionKey(parent) ===
                balancePositionKey(position, position.parentId),
          ))) &&
      (position.role === BALANCE_ROLES.Available ||
        position.role === BALANCE_ROLES.Allowance),
  )
  const priority = (position: BalancePosition) =>
    position.asset.kind === ASSET_KINDS.Unknown
      ? 3
      : position.amount.status === OBSERVATION_STATUSES.Known
        ? 0
        : position.amount.status === OBSERVATION_STATUSES.Stale
          ? position.amount.source.kind === EVIDENCE_KINDS.Legacy
            ? 2
            : 1
          : 3
  const readable = (position: BalancePosition) =>
    position.asset.kind !== ASSET_KINDS.Unknown &&
    isKnownOrStaleObservation(position.amount)
  return (
    roots.length
      ? roots
      : primaryPositions.filter((position) => !position.parentId)
  )
    .flatMap((root) => {
      if (readable(root) && root.amount.status === OBSERVATION_STATUSES.Known)
        return [root]
      const components = primaryPositions.filter(
        (position) =>
          position.relation === BALANCE_RELATIONS.Component &&
          position.parentId !== undefined &&
          balancePositionKey(root) ===
            balancePositionKey(position, position.parentId) &&
          readable(position),
      )
      if (readable(root)) {
        const current = components.filter(
          ({ amount }) => amount.status === OBSERVATION_STATUSES.Known,
        )
        return current.length ? current : [root]
      }
      return components.length ? components : [root]
    })
    .sort((left, right) => priority(left) - priority(right))
}

/** Recorded legacy USD totals remain references independently of their details. */
function getReferenceUsdBalance(snapshot: BalanceSnapshot): string | undefined {
  const positions = snapshot.positions.filter(
    ({ id, parentId, asset }) =>
      id === "legacy" &&
      parentId === undefined &&
      asset.kind === ASSET_KINDS.Currency &&
      asset.code === CURRENCIES.USD,
  )
  if (positions.length !== 1) return undefined
  const { amount } = positions[0]!
  return amount.status === OBSERVATION_STATUSES.Stale &&
    amount.reason !== BALANCE_IDENTITY_CHANGED_REASON &&
    amount.reason !== LEGACY_BALANCE_SUPERSEDED_REASON &&
    amount.source.kind === EVIDENCE_KINDS.Legacy
    ? amount.value
    : undefined
}

/** Scope selections are sets, while unknown and explicitly empty stay distinct. */
function balanceScopeKey(scope: UsageScope): string {
  return usageScopeKey(scope, false)
}

/** Source-local fields are comparable only inside the same collection contract. */
function positionCollectionKey(position: BalancePosition): string {
  const source = position.amount.source
  return financialCollectionKey(position.collectionKey, source)
}

/** Portfolio quota identities include their authority without changing stored assets. */
export function getPortfolioAsset(asset: Asset, authority: string): Asset {
  return asset.kind === ASSET_KINDS.Quota
    ? {
        ...asset,
        id: JSON.stringify([authority, asset.id]),
      }
    : asset
}

/** Native assets group only by identity; this projection never invents exchange rates. */
function sumPositions(positions: BalancePosition[]) {
  const scopedAsset = (p: BalancePosition) =>
    getPortfolioAsset(p.asset, p.scope.authority)
  const groups = new Map<string, BalancePosition[]>()
  for (const p of positions) {
    if (
      !isKnownOrStaleObservation(p.amount) ||
      p.asset.kind === ASSET_KINDS.Unknown
    )
      continue
    const key = assetIdentity(scopedAsset(p))
    const group = groups.get(key)
    if (group) group.push(p)
    else groups.set(key, [p])
  }
  const amounts: Amount[] = [],
    overflows: BalanceConflict[] = []
  for (const positions of groups.values()) {
    try {
      const first = positions[0]!
      const asset = scopedAsset(first)
      if (asset.kind !== ASSET_KINDS.Unknown)
        amounts.push({
          asset,
          value: sumDecimals(
            positions.flatMap((position) =>
              isKnownOrStaleObservation(position.amount)
                ? [position.amount.value]
                : [],
            ),
          ),
        })
    } catch {
      overflows.push({
        positions,
        reason: BALANCE_CONFLICT_REASONS.AmountOutOfRange,
      })
    }
  }
  return { amounts, overflows }
}

/** A projection chooses one product purpose without erasing upstream facts. */
export function projectBalance(
  snapshot: BalanceSnapshot,
  purpose: (typeof BALANCE_PURPOSES)["Prepaid" | "Available"],
  asOf = Date.now(),
  includeLastKnown = false,
) {
  return projectBalanceCandidates(snapshot, purpose, asOf, includeLastKnown)
}

/** Shared-wallet selection must see expired observations before qualifying the winner. */
function projectBalanceCandidates(
  snapshot: BalanceSnapshot,
  purpose: (typeof BALANCE_PURPOSES)["Prepaid" | "Available"],
  asOf: number,
  includeLastKnown: boolean,
  deferValidity = false,
) {
  const excluded: BalanceExclusion[] = []
  const conflicts: BalanceConflict[] = []
  const candidates = snapshot.positions.filter((position) => {
    let reason: BalanceExclusion["reason"] | undefined
    const scopes = [
      position.scope.projects,
      position.scope.keys,
      position.scope.models,
      position.scope.groups,
      ...(position.scope.routes ? [position.scope.routes] : []),
    ]
    if (position.amount.source.kind === EVIDENCE_KINDS.Legacy)
      reason = BALANCE_EXCLUSION_REASONS.Legacy
    else if (
      position.amount.status !== OBSERVATION_STATUSES.Known &&
      !(
        includeLastKnown &&
        position.amount.status === OBSERVATION_STATUSES.Stale &&
        position.amount.reason !== BALANCE_IDENTITY_CHANGED_REASON
      )
    )
      reason = BALANCE_EXCLUSION_REASONS.Observation
    else if (position.asset.kind === ASSET_KINDS.Unknown)
      reason = BALANCE_EXCLUSION_REASONS.Asset
    else if (
      purpose === BALANCE_PURPOSES.Available &&
      position.relation === BALANCE_RELATIONS.Component
    )
      reason = BALANCE_EXCLUSION_REASONS.Overlap
    else if (
      purpose === BALANCE_PURPOSES.Prepaid
        ? position.role !== BALANCE_ROLES.Ledger &&
          position.role !== BALANCE_ROLES.Available
        : position.role !== BALANCE_ROLES.Available
    )
      reason = BALANCE_EXCLUSION_REASONS.Role
    else if (
      purpose === BALANCE_PURPOSES.Prepaid &&
      position.nature !== BALANCE_NATURES.Prepaid
    )
      reason = BALANCE_EXCLUSION_REASONS.Nature
    else if (
      purpose === BALANCE_PURPOSES.Prepaid &&
      scopes.some((s) => s.kind === SCOPE_SELECTION_KINDS.Unknown)
    )
      reason = BALANCE_EXCLUSION_REASONS.ScopeUnknown
    else if (scopes.some((s) => s.kind === SCOPE_SELECTION_KINDS.Restricted))
      reason = BALANCE_EXCLUSION_REASONS.Restricted
    else if (
      !deferValidity &&
      position.validity.kind === BALANCE_VALIDITY_KINDS.Expires &&
      position.validity.at <= asOf
    )
      reason = BALANCE_EXCLUSION_REASONS.Validity
    else if (
      !deferValidity &&
      position.window &&
      ((position.window.resetsAt !== undefined &&
        position.window.resetsAt <= asOf) ||
        (position.amount.status === OBSERVATION_STATUSES.Stale &&
          position.window.end <= asOf))
    )
      reason = BALANCE_EXCLUSION_REASONS.Validity
    else if (
      !deferValidity &&
      purpose === BALANCE_PURPOSES.Prepaid &&
      position.validity.kind !== BALANCE_VALIDITY_KINDS.NoExpiry
    )
      reason = BALANCE_EXCLUSION_REASONS.Validity
    if (reason) {
      excluded.push({ position, reason })
      return false
    }
    return true
  })
  const selected = new Set(candidates.map((p) => balancePositionKey(p)))
  const nonOverlapping = candidates.filter((position) => {
    const hasParent =
      position.parentId &&
      selected.has(balancePositionKey(position, position.parentId))
    const hasLedger =
      purpose === BALANCE_PURPOSES.Prepaid &&
      position.role === BALANCE_ROLES.Available &&
      candidates.some(
        (other) =>
          other.role === BALANCE_ROLES.Ledger &&
          !(
            other.parentId &&
            selected.has(balancePositionKey(other, other.parentId))
          ) &&
          assetIdentity(other.asset) === assetIdentity(position.asset) &&
          balanceScopeKey(other.scope) === balanceScopeKey(position.scope) &&
          positionCollectionKey(other) === positionCollectionKey(position),
      )
    if (hasParent || hasLedger) {
      excluded.push({ position, reason: BALANCE_EXCLUSION_REASONS.Overlap })
      return false
    }
    return true
  })
  const byWallet = new Map<string, BalancePosition[]>()
  for (const position of nonOverlapping) {
    const key = JSON.stringify([
      balanceScopeKey(position.scope),
      assetIdentity(position.asset),
    ])
    const group = byWallet.get(key) ?? []
    group.push(position)
    byWallet.set(key, group)
  }
  const positions: BalancePosition[] = []
  for (const group of byWallet.values()) {
    if (new Set(group.map(positionCollectionKey)).size > 1) {
      conflicts.push({
        positions: group,
        reason: BALANCE_CONFLICT_REASONS.IncomparableObservations,
      })
      group.forEach((position) =>
        excluded.push({ position, reason: BALANCE_EXCLUSION_REASONS.Conflict }),
      )
    } else positions.push(...group)
  }
  const summed = sumPositions(positions)
  conflicts.push(...summed.overflows)
  const overflowed = new Set(
    summed.overflows.flatMap((group) => group.positions),
  )
  overflowed.forEach((position) =>
    excluded.push({ position, reason: BALANCE_EXCLUSION_REASONS.Conflict }),
  )
  return {
    positions: positions.filter((position) => !overflowed.has(position)),
    amounts: summed.amounts,
    excluded,
    conflicts,
    coverage:
      positions.some(
        ({ amount }) => amount.status === OBSERVATION_STATUSES.Stale,
      ) ||
      (purpose !== BALANCE_PURPOSES.Prepaid &&
        positions.some((position) =>
          [
            position.scope.projects,
            position.scope.keys,
            position.scope.models,
            position.scope.groups,
            ...(position.scope.routes ? [position.scope.routes] : []),
          ].some(
            (selection) => selection.kind === SCOPE_SELECTION_KINDS.Unknown,
          ),
        )) ||
      excluded.some(
        (e) =>
          [
            BALANCE_EXCLUSION_REASONS.Observation,
            BALANCE_EXCLUSION_REASONS.ScopeUnknown,
            BALANCE_EXCLUSION_REASONS.Validity,
            BALANCE_EXCLUSION_REASONS.Legacy,
            BALANCE_EXCLUSION_REASONS.Asset,
            BALANCE_EXCLUSION_REASONS.Conflict,
          ].some((reason) => reason === e.reason) ||
          (e.reason === BALANCE_EXCLUSION_REASONS.Nature &&
            (e.position.nature === BALANCE_NATURES.Unknown ||
              e.position.nature === BALANCE_NATURES.Mixed)),
      )
        ? FINANCIAL_COVERAGE.Partial
        : snapshot.coverage,
  }
}

/** Deduplicate only proven wallet/organization identities within their authority. */
export function aggregateBalances(
  snapshots: BalanceSnapshot[],
  purpose: (typeof BALANCE_PURPOSES)["Prepaid" | "Available"],
  asOf = Date.now(),
  includeLastKnown = false,
) {
  type WalletObservation = { index: number; positions: BalancePosition[] }
  const wallets = new Map<string, Map<string, WalletObservation>>()
  const positions: BalancePosition[] = []
  const included = new Set<number>(),
    duplicates = new Set<number>()
  const includedPositions = new Map<number, BalancePosition[]>()
  const conflicts: BalanceConflict[] = []
  let partial = false
  const authorities = new Map<
    string,
    { accounts: Set<number>; unidentified: Set<number> }
  >()
  snapshots.forEach((snapshot, index) => {
    const projection = projectBalanceCandidates(
      snapshot,
      purpose,
      asOf,
      includeLastKnown,
      true,
    )
    conflicts.push(...projection.conflicts)
    partial ||= projection.coverage !== FINANCIAL_COVERAGE.Complete
    for (const p of projection.positions) {
      const authorityKey = JSON.stringify([
        p.scope.authority,
        assetIdentity(p.asset),
      ])
      const authority = authorities.get(authorityKey) ?? {
        accounts: new Set<number>(),
        unidentified: new Set<number>(),
      }
      authority.accounts.add(index)
      if (!p.scope.walletId && !p.scope.organizationId && !p.scope.workspaceId)
        authority.unidentified.add(index)
      authorities.set(authorityKey, authority)
      // Unknown remote identity still identifies this local account, but never another account.
      const localOwner =
        p.scope.walletId || p.scope.organizationId || p.scope.workspaceId
          ? undefined
          : index
      const key = JSON.stringify([
        localOwner,
        ...(localOwner === undefined
          ? [
              p.scope.authority,
              p.scope.walletId,
              p.scope.organizationId,
              p.scope.workspaceId,
            ]
          : [balanceScopeKey(p.scope)]),
        assetIdentity(p.asset),
      ])
      const observations =
        wallets.get(key) ?? new Map<string, WalletObservation>()
      const observationKey = JSON.stringify([index, positionCollectionKey(p)])
      const observation = observations.get(observationKey) ?? {
        index,
        positions: [],
      }
      observation.positions.push(p)
      observations.set(observationKey, observation)
      wallets.set(key, observations)
    }
  })
  const possibleDuplicates = new Set<number>()
  for (const authority of authorities.values()) {
    if (authority.accounts.size < 2) continue
    const unidentified = [...authority.unidentified].sort((a, b) =>
      JSON.stringify(snapshots[a]!.subject).localeCompare(
        JSON.stringify(snapshots[b]!.subject),
      ),
    )
    if (authority.accounts.size === authority.unidentified.size)
      unidentified.shift()
    unidentified.forEach((index) => possibleDuplicates.add(index))
  }
  const potentialDuplicateCount = possibleDuplicates.size
  const signature = (observation: WalletObservation) =>
    JSON.stringify(
      observation.positions
        .map((position) => [
          balanceMetricKey(position),
          balanceScopeKey({
            ...position.scope,
            routes: position.scope.routes ?? {
              kind: SCOPE_SELECTION_KINDS.All,
            },
          }),
        ])
        .sort(),
    )
  const observedAt = (observation: WalletObservation) =>
    Math.min(
      ...observation.positions.map((p) =>
        "observedAt" in p.amount ? p.amount.observedAt : -Infinity,
      ),
    )
  const values = (observation: WalletObservation) =>
    JSON.stringify(
      observation.positions
        .map((p) => [
          balanceMetricKey(p),
          "value" in p.amount ? p.amount.value : null,
        ])
        .sort((a, b) => String(a[0]).localeCompare(String(b[0]))),
    )
  for (const observationsByAccount of wallets.values()) {
    const observations = [...observationsByAccount.values()]
    const signatures = new Set(observations.map(signature))
    if (signatures.size > 1) {
      conflicts.push({
        positions: observations.flatMap((o) => o.positions),
        reason: BALANCE_CONFLICT_REASONS.IncomparableObservations,
      })
      continue
    }
    const newestTime = Math.max(...observations.map(observedAt))
    const newest = observations.filter((o) => observedAt(o) === newestTime)
    if (new Set(newest.map(values)).size > 1) {
      conflicts.push({
        positions: newest.flatMap((o) => o.positions),
        reason: BALANCE_CONFLICT_REASONS.ConflictingObservations,
      })
      continue
    }
    const selected = newest.sort((a, b) =>
      JSON.stringify(snapshots[a.index]!.subject).localeCompare(
        JSON.stringify(snapshots[b.index]!.subject),
      ),
    )[0]!
    const qualified = projectBalance(
      { ...snapshots[selected.index]!, positions: selected.positions },
      purpose,
      asOf,
      includeLastKnown,
    )
    partial ||= qualified.coverage !== FINANCIAL_COVERAGE.Complete
    conflicts.push(...qualified.conflicts)
    positions.push(...qualified.positions)
    if (qualified.positions.length) {
      included.add(selected.index)
      includedPositions.set(selected.index, [
        ...(includedPositions.get(selected.index) ?? []),
        ...qualified.positions,
      ])
    }
    observations.forEach((o) => {
      if (o.index !== selected.index) duplicates.add(o.index)
    })
  }
  const summed = sumPositions(positions)
  conflicts.push(...summed.overflows)
  const overflowed = new Set(
    summed.overflows.flatMap((group) => group.positions),
  )
  for (const [index, positions] of includedPositions) {
    if (positions.every((position) => overflowed.has(position)))
      included.delete(index)
  }
  return {
    amounts: summed.amounts,
    contributions: [...includedPositions].map(([snapshotIndex, selected]) => ({
      snapshotIndex,
      positions: selected.filter((position) => !overflowed.has(position)),
    })),
    includedCount: included.size,
    eligibleCount: snapshots.length,
    duplicateCount: duplicates.size,
    duplicateSnapshotIndices: duplicates,
    potentialDuplicateCount,
    conflicts,
    conflictCount: conflicts.length,
    coverage:
      partial || potentialDuplicateCount > 0 || conflicts.length > 0
        ? FINANCIAL_COVERAGE.Partial
        : FINANCIAL_COVERAGE.Complete,
  }
}

/** All account entry points share selection, exclusion and coverage policy. */
export function getDisplayBalancePortfolio(
  sites: DisplaySiteData[],
  purpose: (typeof BALANCE_PURPOSES)[
    "Prepaid" | "Available"] = BALANCE_PURPOSES.Available,
  asOf = Date.now(),
) {
  const eligible = sites.filter(
    (site) => !site.disabled && !site.excludeFromTotalBalance,
  )
  const observations = eligible.flatMap((site) => {
    const snapshot = site.manualBalanceSnapshot ?? site.balanceSnapshot
    return snapshot ? [{ site, snapshot }] : []
  })
  const snapshots = observations.map((observation) => observation.snapshot)
  const includeLastKnown = purpose === BALANCE_PURPOSES.Available
  const { duplicateSnapshotIndices, ...portfolio } = aggregateBalances(
    snapshots,
    purpose,
    asOf,
    includeLastKnown,
  )
  const included = new Set(
    portfolio.contributions
      .filter(({ positions }) => positions.length > 0)
      .map(({ snapshotIndex }) => observations[snapshotIndex]!.site.id),
  )
  const conflictPositions = new Set(
    portfolio.conflicts.flatMap(({ positions }) => positions),
  )
  const snapshotIndices = new Map(
    observations.map(({ site }, index) => [site.id, index]),
  )
  const omissionReasons = (site: DisplaySiteData) => {
    if (site.disabled)
      return [FINANCIAL_ACCOUNT_EXCLUSION_REASONS.Disabled] as const
    if (site.excludeFromTotalBalance)
      return [FINANCIAL_ACCOUNT_EXCLUSION_REASONS.Settings] as const
    const index = snapshotIndices.get(site.id)
    if (index === undefined)
      return [FINANCIAL_ACCOUNT_EXCLUSION_REASONS.NoBalance] as const
    const snapshot = snapshots[index]!
    const reasons = new Set<
      | BalanceExclusion["reason"]
      | typeof FINANCIAL_ACCOUNT_EXCLUSION_REASONS.Duplicate
    >(
      projectBalance(snapshot, purpose, asOf, includeLastKnown).excluded.map(
        ({ reason }) => reason,
      ),
    )
    if (duplicateSnapshotIndices.has(index))
      reasons.add(FINANCIAL_ACCOUNT_EXCLUSION_REASONS.Duplicate)
    if (snapshot.positions.some((position) => conflictPositions.has(position)))
      reasons.add(BALANCE_EXCLUSION_REASONS.Conflict)
    return reasons.size > 0
      ? [...reasons]
      : ([FINANCIAL_ACCOUNT_EXCLUSION_REASONS.NoBalance] as const)
  }
  const excludedAccounts = sites
    .filter((site) => !included.has(site.id))
    .map((site) => ({ accountId: site.id, reasons: omissionReasons(site) }))
  const contributions = portfolio.contributions.map(
    ({ snapshotIndex, positions }) => ({
      site: observations[snapshotIndex]!.site,
      positions,
    }),
  )
  const lastKnownCount = contributions.filter(({ positions }) =>
    positions.some(
      ({ amount }) => amount.status === OBSERVATION_STATUSES.Stale,
    ),
  ).length
  let referenceUsd: { USD: string; CNY: string } | undefined
  const convertedSubtotal = (currency: "USD" | "CNY") => {
    try {
      const converted = contributions.flatMap(({ site, positions }) =>
        positions.flatMap(({ asset, amount }) =>
          asset.kind === ASSET_KINDS.Currency &&
          asset.code === currency &&
          isKnownOrStaleObservation(amount)
            ? [
                currency === CURRENCIES.USD
                  ? convertUsdToCny(amount.value, site.exchangeRate)
                  : convertCnyToUsd(amount.value, site.exchangeRate),
              ]
            : [],
        ),
      )
      return converted.length ? sumDecimals(converted) : undefined
    } catch {
      // If display conversion exceeds the decimal bounds, keep the native subtotal.
      return undefined
    }
  }
  const usdInCny = convertedSubtotal(CURRENCIES.USD)
  const cnyInUsd = convertedSubtotal(CURRENCIES.CNY)
  const nativeCurrencyTotal = (currency: CurrencyType) =>
    portfolio.amounts.find(
      ({ asset }) =>
        asset.kind === ASSET_KINDS.Currency && asset.code === currency,
    )?.value
  const convertedCurrencyTotals: Partial<Record<CurrencyType, string>> = {}
  for (const currency of [CURRENCIES.USD, CURRENCIES.CNY] as const) {
    const otherCurrency =
      currency === CURRENCIES.USD ? CURRENCIES.CNY : CURRENCIES.USD
    const convertedOther = currency === CURRENCIES.USD ? cnyInUsd : usdInCny
    if (
      nativeCurrencyTotal(otherCurrency) !== undefined &&
      convertedOther === undefined
    )
      continue
    const values = [nativeCurrencyTotal(currency), convertedOther].filter(
      (value): value is string => value !== undefined,
    )
    try {
      if (values.length) convertedCurrencyTotals[currency] = sumDecimals(values)
    } catch {
      // Native groups remain readable when a reference total exceeds decimal bounds.
    }
  }
  if (purpose === BALANCE_PURPOSES.Available) {
    const references = observations.flatMap(({ site, snapshot }) => {
      const value = getReferenceUsdBalance(snapshot)
      return value === undefined
        ? []
        : [{ value, exchangeRate: site.exchangeRate }]
    })
    if (references.length) {
      try {
        referenceUsd = {
          USD: sumDecimals(references.map(({ value }) => value)),
          CNY: sumDecimals(
            references.map(({ value, exchangeRate }) =>
              convertUsdToCny(value, exchangeRate),
            ),
          ),
        }
      } catch {
        // A reference subtotal is optional when decimal bounds are exceeded.
      }
    }
  }
  return {
    ...portfolio,
    contributions,
    convertedCurrencyTotals,
    lastKnownCount,
    ...(usdInCny === undefined ? {} : { usdInCny }),
    ...(cnyInUsd === undefined ? {} : { cnyInUsd }),
    ...(referenceUsd === undefined ? {} : { referenceUsd }),
    eligibleCount: eligible.length,
    coverage:
      snapshots.length === eligible.length
        ? portfolio.coverage
        : FINANCIAL_COVERAGE.Partial,
    manualCount: eligible.filter((site) => site.manualBalanceSnapshot).length,
    excludedAccounts,
  }
}
