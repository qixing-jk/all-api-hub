import { assetIdentity } from "~/services/amounts/assets"
import {
  balancePositionKey,
  balanceSnapshotParts,
  balanceSnapshotSchema,
  financialCollectionKey,
  staleObservation,
  usageScopeKey,
  type BalancePosition,
  type BalanceRefreshPart,
  type BalanceSnapshot,
} from "~/services/amounts/balance"
import {
  EVIDENCE_KINDS,
  FINANCIAL_COVERAGE,
  FINANCIAL_ENUMERATION,
  FINANCIAL_OBSERVATION_REASONS,
  OBSERVATION_STATUSES,
} from "~/services/amounts/financialConstants"

export const BALANCE_IDENTITY_CHANGED_REASON =
  FINANCIAL_OBSERVATION_REASONS.IdentityChanged
export const LEGACY_BALANCE_SUPERSEDED_REASON =
  FINANCIAL_OBSERVATION_REASONS.LegacySuperseded

/** Snapshot-only adapters do not prove omitted collection members were removed. */
export function snapshotRefreshParts(
  snapshot: BalanceSnapshot,
): BalanceRefreshPart[] {
  return balanceSnapshotParts(snapshot, FINANCIAL_ENUMERATION.Partial)
}

/** Failure preserves the original observation time and value, never a new zero. */
export function staleBalancePosition(
  position: BalancePosition,
  reason: string,
): BalancePosition {
  return {
    ...position,
    amount:
      reason === BALANCE_IDENTITY_CHANGED_REASON &&
      position.amount.status === OBSERVATION_STATUSES.Stale
        ? { ...position.amount, reason }
        : staleObservation(position.amount, reason),
  }
}

/** Merge only the source collections explicitly observed by this accepted request. */
export function acceptBalanceRefresh(
  previous: BalanceSnapshot | undefined,
  parts: BalanceRefreshPart[],
  subject: BalanceSnapshot["subject"],
  capturedAt: number,
): BalanceSnapshot {
  const requested = new Set(
    parts
      .filter((part) => part.enumeration !== FINANCIAL_ENUMERATION.NotRequested)
      .map((part) => financialCollectionKey(part.collectionKey, part.source)),
  )
  const positions = (previous?.positions ?? []).map((position) =>
    requested.has(
      financialCollectionKey(position.collectionKey, position.amount.source),
    )
      ? position
      : staleBalancePosition(
          position,
          FINANCIAL_OBSERVATION_REASONS.NotRequested,
        ),
  )
  for (const part of parts) {
    if (part.enumeration === FINANCIAL_ENUMERATION.NotRequested) continue
    const key = financialCollectionKey(part.collectionKey, part.source)
    const matches = (p: BalancePosition) =>
      financialCollectionKey(p.collectionKey, p.amount.source) === key
    if (part.positions.some((p) => !matches(p)))
      throw new Error("balance_collection_mismatch")
    const old = positions.filter(matches)
    const next =
      part.enumeration === FINANCIAL_ENUMERATION.Unavailable
        ? []
        : part.positions.map((position) => {
            const prior = old.find(
              (p) =>
                p.id === position.id &&
                assetIdentity(p.asset) === assetIdentity(position.asset) &&
                usageScopeKey(p.scope) === usageScopeKey(position.scope),
            )
            // A failed reading cannot reassign the last amount's timing or financial meaning.
            const refreshedLegacyReading =
              position.amount.status === OBSERVATION_STATUSES.Stale &&
              position.amount.source.kind === EVIDENCE_KINDS.Legacy &&
              position.amount.reason ===
                FINANCIAL_OBSERVATION_REASONS.LegacySemantics &&
              (!prior ||
                !("observedAt" in prior.amount) ||
                position.amount.observedAt >= prior.amount.observedAt)
            return position.amount.status !== OBSERVATION_STATUSES.Known &&
              !refreshedLegacyReading &&
              prior &&
              (prior.amount.status === OBSERVATION_STATUSES.Known ||
                (prior.amount.status === OBSERVATION_STATUSES.Stale &&
                  prior.amount.reason !== BALANCE_IDENTITY_CHANGED_REASON))
              ? staleBalancePosition(
                  prior,
                  FINANCIAL_OBSERVATION_REASONS.RefreshUnavailable,
                )
              : position
          })
    if (part.enumeration !== FINANCIAL_ENUMERATION.Complete) {
      for (const prior of old)
        if (
          !next.some((p) => balancePositionKey(p) === balancePositionKey(prior))
        )
          next.push(
            staleBalancePosition(
              prior,
              FINANCIAL_OBSERVATION_REASONS.IncompleteEnumeration,
            ),
          )
    }
    const first = positions.findIndex(matches)
    for (let i = positions.length - 1; i >= 0; i--)
      if (matches(positions[i]!)) positions.splice(i, 1)
    positions.splice(first < 0 ? positions.length : first, 0, ...next)
  }
  return balanceSnapshotSchema.parse({
    schemaVersion: 2,
    subject,
    capturedAt,
    positions,
    coverage:
      parts.every((p) => p.enumeration === FINANCIAL_ENUMERATION.Complete) &&
      positions.every((p) => p.amount.status === OBSERVATION_STATUSES.Known)
        ? FINANCIAL_COVERAGE.Complete
        : FINANCIAL_COVERAGE.Partial,
  })
}
