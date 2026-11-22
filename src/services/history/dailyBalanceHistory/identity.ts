import {
  accountAllowanceEntryKey,
  type AccountAllowanceEntry,
} from "~/services/accounts/allowances"
import { assetIdentity } from "~/services/amounts/assets"
import {
  balancePositionKey,
  usageScopeKey,
  type BalancePosition,
} from "~/services/amounts/balance"
import { BUDGET_WINDOW_KINDS } from "~/services/amounts/financialConstants"
import type { FinancialHistorySnapshot } from "~/types/dailyBalanceHistory"

/** A history receipt can contain wallets, plans, or both. */
export function getFinancialSnapshotCapturedAt(
  snapshot: FinancialHistorySnapshot,
): number {
  const balanceCapturedAt = Math.max(
    snapshot.balance?.capturedAt ?? -Infinity,
    snapshot.allowances?.capturedAt ?? -Infinity,
  )
  return [
    ...(snapshot.settledConsumption ?? []),
    ...(snapshot.reportedIncome ?? []),
    ...(snapshot.reportedDayCosts ?? []),
  ].reduce(
    (latest, { amount, window }) =>
      Math.max(
        latest,
        "observedAt" in amount ? amount.observedAt : (window?.end ?? -Infinity),
      ),
    balanceCapturedAt,
  )
}

/** Window identity stays stable across resets; plan/source/asset remain separate. */
export function getAllowanceSeriesKey(entry: AccountAllowanceEntry): string {
  const window = entry.constraint.window
  return JSON.stringify([
    accountAllowanceEntryKey(entry),
    assetIdentity(entry.constraint.asset),
    window.kind,
    window.kind === BUDGET_WINDOW_KINDS.Lifetime ? null : window.period,
  ])
}

/** Unsequenced archives precede live acceptance generations; wall-clock rollback cannot revive removed members. */
export function compareFinancialHistorySnapshots(
  a: FinancialHistorySnapshot,
  b: FinancialHistorySnapshot,
): number {
  if (a.generation !== undefined && b.generation !== undefined)
    return a.generation - b.generation
  if (a.generation !== undefined) return 1
  if (b.generation !== undefined) return -1
  return getFinancialSnapshotCapturedAt(a) - getFinancialSnapshotCapturedAt(b)
}

/** A comparable history series keeps its original asset, role, scope and source. */
export function getFinancialSeriesKey(position: BalancePosition): string {
  return JSON.stringify([
    balancePositionKey(position),
    usageScopeKey(position.scope),
    assetIdentity(position.asset),
    position.role,
    position.amount.source.kind,
  ])
}
