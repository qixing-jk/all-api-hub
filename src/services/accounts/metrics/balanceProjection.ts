import { BALANCE_IDENTITY_CHANGED_REASON } from "~/services/accounts/refresh/balanceAcceptance"
import { assetIdentity } from "~/services/amounts/assets"
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
  FINANCIAL_COVERAGE,
  OBSERVATION_STATUSES,
  SCOPE_SELECTION_KINDS,
} from "~/services/amounts/financialConstants"

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

export type BalancePurpose =
  (typeof BALANCE_PURPOSES)[keyof typeof BALANCE_PURPOSES]
export type BalanceExclusion = {
  position: BalancePosition
  reason: (typeof BALANCE_EXCLUSION_REASONS)[keyof typeof BALANCE_EXCLUSION_REASONS]
}
type BalanceConflict = {
  positions: BalancePosition[]
  reason: (typeof BALANCE_CONFLICT_REASONS)[keyof typeof BALANCE_CONFLICT_REASONS]
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

/** Native assets group only by identity; this projection never invents exchange rates. */
function sumPositions(positions: BalancePosition[]) {
  const scopedAsset = (p: BalancePosition) =>
    p.asset.kind === ASSET_KINDS.Quota
      ? {
          ...p.asset,
          id: JSON.stringify([p.scope.authority, p.asset.id]),
        }
      : p.asset
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
function projectBalance(
  snapshot: BalanceSnapshot,
  purpose: (typeof BALANCE_PURPOSES)["Prepaid" | "Available"],
  asOf = Date.now(),
  includeLastKnown = false,
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
      position.validity.kind === BALANCE_VALIDITY_KINDS.Expires &&
      position.validity.at <= asOf
    )
      reason = BALANCE_EXCLUSION_REASONS.Validity
    else if (
      position.window &&
      ((position.window.resetsAt !== undefined &&
        position.window.resetsAt <= asOf) ||
        (position.amount.status === OBSERVATION_STATUSES.Stale &&
          position.window.end <= asOf))
    )
      reason = BALANCE_EXCLUSION_REASONS.Validity
    else if (
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
    const projection = projectBalance(snapshot, purpose, asOf, includeLastKnown)
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
    positions.push(...selected.positions)
    included.add(selected.index)
    includedPositions.set(selected.index, [
      ...(includedPositions.get(selected.index) ?? []),
      ...selected.positions,
    ])
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
