import {
  API_VERIFICATION_HISTORY_TARGET_KINDS,
  type ApiVerificationHistorySummary,
  type ApiVerificationHistoryTarget,
} from "./types"
import { serializeVerificationHistoryTarget } from "./utils"

/**
 * How long a persisted verification result stays meaningful.
 *
 * Aligned with the repository's longest history retention window
 * (`DEFAULT_BALANCE_HISTORY_PREFERENCES.retentionDays`), so a result is bounded
 * without surprising users who expect long-lived history.
 */
export const VERIFICATION_SUMMARY_MAX_AGE_MS = 365 * 24 * 60 * 60 * 1000

/**
 * Minimum gap between two full orphan sweeps.
 *
 * A sweep reads the live account and profile stores, so it is throttled well
 * above the cadence of verification writes.
 */
export const ORPHAN_SWEEP_INTERVAL_MS = 6 * 60 * 60 * 1000

export type VerificationRetentionSource = {
  now: number
  /**
   * Live profile ids. Omit when the profile store could not be read: an absent
   * set means "unknown", not "no profiles exist", and skips that ownership check
   * so a failed read cannot delete every profile-scoped result.
   */
  liveProfileIds?: ReadonlySet<string>
  /** Live account ids, with the same "unknown vs empty" contract. */
  liveAccountIds?: ReadonlySet<string>
}

export type VerificationOwnerReconcile = {
  removeProfileIds?: ReadonlySet<string>
  removeAccountIds?: ReadonlySet<string>
  remapProfileIds?: ReadonlyMap<string, string>
}

/**
 * Returns whether a target's owner is still known to exist.
 *
 * Account-scoped targets are owned by their account id even when the string
 * happens to match a profile id, so ownership follows the target kind.
 */
function isLiveOwner(
  target: ApiVerificationHistoryTarget,
  source: VerificationRetentionSource,
): boolean {
  if (target.kind === API_VERIFICATION_HISTORY_TARGET_KINDS.AccountModel) {
    return (
      source.liveAccountIds === undefined ||
      source.liveAccountIds.has(target.accountId)
    )
  }

  return (
    source.liveProfileIds === undefined ||
    source.liveProfileIds.has(target.profileId)
  )
}

/**
 * Drops results that are too old, or whose owning account/profile is gone.
 *
 * This is the store's only upper bound: total entry count is intentionally not
 * capped, so time and owner liveness define the retained set. Re-adding a count
 * cap, if it is ever needed, belongs here as one extra truncation step.
 * @param summaries - Persisted summaries in stored order.
 * @param source - Current time and the live owner ids that could be read.
 * @returns The retained summaries, and whether anything was dropped.
 */
export function applyVerificationRetention(
  summaries: ApiVerificationHistorySummary[],
  source: VerificationRetentionSource,
): { summaries: ApiVerificationHistorySummary[]; changed: boolean } {
  const cutoff = source.now - VERIFICATION_SUMMARY_MAX_AGE_MS

  const retained = summaries.filter(
    (summary) =>
      summary.verifiedAt >= cutoff && isLiveOwner(summary.target, source),
  )

  return retained.length === summaries.length
    ? { summaries, changed: false }
    : { summaries: retained, changed: true }
}

/** Returns whether a target belongs to an owner the caller removed. */
function isRemovedOwner(
  target: ApiVerificationHistoryTarget,
  reconcile: VerificationOwnerReconcile,
): boolean {
  if (target.kind === API_VERIFICATION_HISTORY_TARGET_KINDS.AccountModel) {
    return reconcile.removeAccountIds?.has(target.accountId) ?? false
  }

  return reconcile.removeProfileIds?.has(target.profileId) ?? false
}

/**
 * Rewrites a profile-scoped target onto its surviving profile id.
 * @returns The rewritten summary, or the original when no remap applies.
 */
function remapProfileOwner(
  summary: ApiVerificationHistorySummary,
  remapProfileIds: ReadonlyMap<string, string> | undefined,
): ApiVerificationHistorySummary {
  if (
    !remapProfileIds ||
    summary.target.kind === API_VERIFICATION_HISTORY_TARGET_KINDS.AccountModel
  ) {
    return summary
  }

  const nextProfileId = remapProfileIds.get(summary.target.profileId)
  if (!nextProfileId || nextProfileId === summary.target.profileId) {
    return summary
  }

  const target: ApiVerificationHistoryTarget = {
    ...summary.target,
    profileId: nextProfileId,
  }

  return {
    ...summary,
    target,
    targetKey: serializeVerificationHistoryTarget(target),
  }
}

/**
 * Applies owner removal and profile id remapping to persisted results.
 *
 * Order is significant and fixed here rather than left to callers: removal runs
 * before remapping. A credential edit can invalidate the surviving profile's own
 * stale results while a credential-identical twin is merged into it — the twin's
 * results were measured against the new credentials and must survive. Remapping
 * first would move them onto the surviving id and then delete them with the
 * stale ones.
 * @param summaries - Persisted summaries in stored order.
 * @param reconcile - Owners to drop and profile ids to rewrite.
 * @returns The reconciled summaries, plus removal and remap counts.
 */
export function applyOwnerReconcile(
  summaries: ApiVerificationHistorySummary[],
  reconcile: VerificationOwnerReconcile,
): {
  summaries: ApiVerificationHistorySummary[]
  removed: number
  remapped: number
} {
  let removed = 0
  let remapped = 0

  const reconciled: ApiVerificationHistorySummary[] = []
  for (const summary of summaries) {
    if (isRemovedOwner(summary.target, reconcile)) {
      removed += 1
      continue
    }

    const nextSummary = remapProfileOwner(summary, reconcile.remapProfileIds)
    if (nextSummary !== summary) remapped += 1
    reconciled.push(nextSummary)
  }

  // Remapping can collide two targets onto one key. Keep the most recently
  // verified result; a tie keeps the first stored one for a stable outcome.
  const indexByKey = new Map<string, number>()
  const deduped: ApiVerificationHistorySummary[] = []
  for (const summary of reconciled) {
    const existingIndex = indexByKey.get(summary.targetKey)
    if (existingIndex === undefined) {
      indexByKey.set(summary.targetKey, deduped.length)
      deduped.push(summary)
      continue
    }

    removed += 1
    if (summary.verifiedAt > deduped[existingIndex]!.verifiedAt) {
      deduped[existingIndex] = summary
    }
  }

  if (removed === 0 && remapped === 0) {
    return { summaries, removed, remapped }
  }

  return { summaries: deduped, removed, remapped }
}
