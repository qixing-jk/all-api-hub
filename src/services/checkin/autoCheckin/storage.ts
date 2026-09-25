import { Storage } from "@plasmohq/storage"

import { STORAGE_LOCKS } from "~/services/core/storageKeys"
import { withExtensionStorageWriteLock } from "~/services/core/storageWriteLock"
import {
  AUTO_CHECKIN_SKIP_REASON,
  CHECKIN_RESULT_STATUS,
  getAutoCheckinRunResultFromSummary,
  getAutoCheckinSkipReasonTranslationKey,
  type AutoCheckinAccountSnapshot,
  type AutoCheckinRunSummary,
  type AutoCheckinStatus,
  type CheckinAccountResult,
} from "~/types/autoCheckin"
import { createLogger } from "~/utils/core/logger"
import { isPlainObject } from "~/utils/core/object"

import { isRetryableCheckinResult } from "./resultPolicy"

const logger = createLogger("AutoCheckinStorage")

/**
 * Storage keys for Auto Check-in
 */
const STORAGE_KEYS = {
  AUTO_CHECKIN_STATUS: "autoCheckin_status",
} as const

/**
 * Recalculate the aggregated auto check-in run summary from per-account results.
 * @param perAccount Record of account ids to their latest check-in result.
 * @param previousSummary Optional previous summary used to preserve
 * `totalEligible` when the caller already knows the original eligible count.
 * @returns A normalized summary containing `totalEligible`, `executed`,
 * `successCount`, `failedCount`, `skippedCount`, and `needsRetry`.
 *
 * `successCount` retains all successful outcomes, while `alreadyCheckedCount`
 * identifies the already-checked subset. `executed` counts all non-skipped outcomes, while
 * `totalEligible` falls back to `executed + skipped`
 * when no prior eligible total is provided. `needsRetry` is true only when a
 * failed result remains eligible for the ordinary retry queue.
 */
function recalculateSummaryFromResults(
  perAccount: Record<string, CheckinAccountResult>,
  previousSummary?: AutoCheckinRunSummary,
): AutoCheckinRunSummary {
  const values = Object.values(perAccount)
  const successCount = values.filter(
    (value) =>
      value.status === CHECKIN_RESULT_STATUS.SUCCESS ||
      value.status === CHECKIN_RESULT_STATUS.ALREADY_CHECKED,
  ).length
  const alreadyCheckedCount = values.filter(
    (value) => value.status === CHECKIN_RESULT_STATUS.ALREADY_CHECKED,
  ).length
  const failedCount = values.filter(
    (value) => value.status === CHECKIN_RESULT_STATUS.FAILED,
  ).length
  const skippedCount = values.filter(
    (value) => value.status === CHECKIN_RESULT_STATUS.SKIPPED,
  ).length
  const uncertainCount = values.filter(
    (value) => value.status === CHECKIN_RESULT_STATUS.UNCERTAIN,
  ).length

  const executed = successCount + failedCount + uncertainCount
  const totalEligible =
    previousSummary?.totalEligible ?? executed + skippedCount

  return {
    totalEligible,
    executed,
    successCount,
    ...(alreadyCheckedCount > 0 ? { alreadyCheckedCount } : {}),
    failedCount,
    skippedCount,
    ...(uncertainCount > 0 ? { uncertainCount } : {}),
    needsRetry: values.some(isRetryableCheckinResult),
  }
}

/**
 * Merge a per-account result back into the stored account snapshots.
 * @param snapshots Existing account snapshots for the latest run, if any.
 * @param result Latest per-account result that should be reflected in the
 * matching snapshot.
 * @param skipReason Optional skip reason override used when the result is being
 * synthesized from a disabled-account transition.
 * @returns The updated snapshots array, or the original `snapshots` when there
 * is nothing to update.
 */
function updateSnapshotWithResult(
  snapshots: AutoCheckinAccountSnapshot[] | undefined,
  result: CheckinAccountResult,
  skipReason?: (typeof AUTO_CHECKIN_SKIP_REASON)[keyof typeof AUTO_CHECKIN_SKIP_REASON],
): AutoCheckinAccountSnapshot[] | undefined {
  if (!snapshots || snapshots.length === 0) {
    return snapshots
  }

  let updated = false
  const nextSnapshots = snapshots.map((snapshot) => {
    if (snapshot.accountId !== result.accountId) {
      return snapshot
    }
    updated = true
    return {
      ...snapshot,
      skipReason: skipReason ?? snapshot.skipReason,
      lastResult: result,
    }
  })

  return updated ? nextSnapshots : snapshots
}

/**
 * Derive the next stored status from the value currently in storage.
 *
 * `current` is the value in storage at the moment the update runs, not a
 * caller-held snapshot. `patch` holds the fields to merge, or `null` to leave
 * storage untouched; `result` is handed back to the caller.
 *
 * The function runs while the status write lock is held, so it must be
 * synchronous: awaiting inside extends the critical section, and calling back
 * into {@link AutoCheckinStorage.updateStatus} would deadlock on the
 * exclusive lock.
 *
 * Mirrors `AccountConfigStore.mutate`, except that the update returns a patch
 * rather than mutating in place — the status has a genuine "not stored yet"
 * state that a patch merges into naturally.
 */
export type AutoCheckinStatusUpdate<T = void> = (
  current: AutoCheckinStatus | null,
) => {
  /** Fields to merge into the stored status; `null` skips the write. */
  patch: Partial<AutoCheckinStatus> | null
  /** Value handed back to the caller. */
  result?: T
}

/**
 * Outcome of {@link AutoCheckinStorage.updateStatus}.
 */
export interface AutoCheckinStatusUpdateOutcome<T> {
  /** `false` when the read or the write failed; nothing was persisted. */
  ok: boolean
  /** Whatever the update derived, or `null` when it did not run. */
  result: T | null
}

/**
 * Storage service for Auto Check-in
 */
class AutoCheckinStorage {
  private storage: Storage

  constructor() {
    this.storage = new Storage({
      area: "local",
    })
  }

  /**
   * Get auto check-in status
   */
  async getStatus(): Promise<AutoCheckinStatus | null> {
    try {
      const stored = (await this.storage.get(
        STORAGE_KEYS.AUTO_CHECKIN_STATUS,
      )) as AutoCheckinStatus | undefined

      return stored || null
    } catch (error) {
      logger.error("Failed to get status", error)
      return null
    }
  }

  /**
   * Apply an update to the stored status under the shared write lock.
   *
   * Status is a single stored object that several flows read, patch and write
   * back. Writing a snapshot that was read *outside* this lock lets a run that
   * finished in the meantime be silently reverted, so this is the only
   * supported way to persist status: callers describe how the next value
   * derives from the current one instead of handing over a whole object.
   */
  async updateStatus<T = void>(
    update: AutoCheckinStatusUpdate<T>,
  ): Promise<AutoCheckinStatusUpdateOutcome<T>> {
    return withExtensionStorageWriteLock(
      STORAGE_LOCKS.AUTO_CHECKIN_STATUS,
      async () => {
        let current: AutoCheckinStatus | null
        try {
          const stored = (await this.storage.get(
            STORAGE_KEYS.AUTO_CHECKIN_STATUS,
          )) as AutoCheckinStatus | undefined
          current = stored || null
        } catch (error) {
          // Without a trustworthy read there is no base to patch, and writing
          // anyway would drop whatever is stored.
          logger.error("Failed to read status for update", error)
          return { ok: false, result: null }
        }

        let applied: ReturnType<AutoCheckinStatusUpdate<T>>
        try {
          applied = update(current)
        } catch (error) {
          logger.error("Failed to apply status update", error)
          return { ok: false, result: null }
        }

        if (!applied.patch) {
          return { ok: true, result: applied.result ?? null }
        }

        const next = {
          ...(current ?? {}),
          ...applied.patch,
        } as AutoCheckinStatus
        try {
          await this.storage.set(STORAGE_KEYS.AUTO_CHECKIN_STATUS, next)
          logger.debug("Status updated")
          return { ok: true, result: applied.result ?? null }
        } catch (error) {
          logger.error("Failed to update status", error)
          return { ok: false, result: null }
        }
      },
    )
  }

  /**
   * Clear auto check-in status
   */
  async clearStatus(): Promise<boolean> {
    try {
      await this.storage.remove(STORAGE_KEYS.AUTO_CHECKIN_STATUS)
      logger.debug("Status cleared")
      return true
    } catch (error) {
      logger.error("Failed to clear status", error)
      return false
    }
  }

  /**
   * Preserve the account's historical row while converting it into a disabled skip.
   *
   * This keeps the Auto Check-in page truthful after a manual disable action:
   * the record remains visible, but it no longer presents retry/disable flows as
   * if the account were still an active failed item.
   */
  async markAccountsDisabledInStatus(
    accounts: Array<{ accountId: string; accountName?: string }>,
  ): Promise<boolean> {
    const normalizedAccounts = Array.from(
      new Map(
        accounts
          .filter((account) => Boolean(account.accountId))
          .map((account) => [account.accountId, account]),
      ).values(),
    )
    if (normalizedAccounts.length === 0) return true

    const { ok } = await this.updateStatus((current) => {
      if (!current) return { patch: null }

      const currentPerAccount = isPlainObject(current.perAccount)
        ? (current.perAccount as Record<string, CheckinAccountResult>)
        : {}
      const currentSnapshots = Array.isArray(current.accountsSnapshot)
        ? (current.accountsSnapshot as AutoCheckinAccountSnapshot[])
        : undefined

      const perAccount: Record<string, CheckinAccountResult> = {
        ...currentPerAccount,
      }

      let nextSnapshots = currentSnapshots
      const matchedAccountIds = new Set<string>()
      for (const account of normalizedAccounts) {
        const snapshotMatch = nextSnapshots?.find(
          (snapshot) => snapshot.accountId === account.accountId,
        )
        const previousResult = perAccount[account.accountId]
        if (!previousResult && !snapshotMatch) {
          continue
        }

        matchedAccountIds.add(account.accountId)
        const resolvedAccountName =
          account.accountName ||
          previousResult?.accountName ||
          snapshotMatch?.accountName ||
          account.accountId

        const disabledResult: CheckinAccountResult = {
          accountId: account.accountId,
          accountName: resolvedAccountName,
          status: CHECKIN_RESULT_STATUS.SKIPPED,
          messageKey: getAutoCheckinSkipReasonTranslationKey(
            AUTO_CHECKIN_SKIP_REASON.ACCOUNT_DISABLED,
          ),
          reasonCode: AUTO_CHECKIN_SKIP_REASON.ACCOUNT_DISABLED,
          timestamp: Date.now(),
        }

        perAccount[account.accountId] = disabledResult
        nextSnapshots = updateSnapshotWithResult(
          nextSnapshots,
          disabledResult,
          AUTO_CHECKIN_SKIP_REASON.ACCOUNT_DISABLED,
        )
      }

      if (matchedAccountIds.size === 0) {
        return { patch: null }
      }

      const disabledIdSet = matchedAccountIds
      let retryState = isPlainObject(current.retryState)
        ? current.retryState
        : undefined

      if (retryState) {
        const pendingAccountIds = Array.isArray(retryState.pendingAccountIds)
          ? retryState.pendingAccountIds.filter(
              (pendingId: unknown): pendingId is string =>
                typeof pendingId === "string" && !disabledIdSet.has(pendingId),
            )
          : []
        const attemptsByAccount = isPlainObject(retryState.attemptsByAccount)
          ? Object.fromEntries(
              Object.entries(retryState.attemptsByAccount).filter(
                ([pendingId]) => !disabledIdSet.has(pendingId),
              ),
            )
          : {}

        // The day's counts outlive its work list: an account that spent the
        // budget stays spent even when nothing is left to retry.
        retryState =
          typeof retryState.day === "string" &&
          (pendingAccountIds.length > 0 ||
            Object.keys(attemptsByAccount).length > 0)
            ? {
                day: retryState.day,
                pendingAccountIds,
                attemptsByAccount,
              }
            : undefined
      }

      const summaryBase = recalculateSummaryFromResults(
        perAccount,
        current.summary,
      )
      const snapshotEligibleCount = nextSnapshots?.length ?? 0
      const summary =
        !current.summary && snapshotEligibleCount > 0
          ? {
              ...summaryBase,
              totalEligible: Math.max(
                summaryBase.totalEligible,
                snapshotEligibleCount,
              ),
            }
          : summaryBase
      const pendingRetry = Boolean(
        retryState &&
          Array.isArray(retryState.pendingAccountIds) &&
          retryState.pendingAccountIds.length > 0,
      )

      return {
        patch: {
          lastRunResult: getAutoCheckinRunResultFromSummary(summary),
          perAccount,
          summary,
          retryState,
          pendingRetry,
          nextRetryScheduledAt: pendingRetry
            ? current.nextRetryScheduledAt
            : undefined,
          retryAlarmTargetDay: pendingRetry
            ? current.retryAlarmTargetDay
            : undefined,
          accountsSnapshot: nextSnapshots,
        },
      }
    })

    if (!ok) {
      logger.warn("Failed to mark disabled accounts in auto check-in status", {
        accountIds: normalizedAccounts.map((account) => account.accountId),
      })
    }
    return ok
  }

  async markAccountDisabledInStatus(
    accountId: string,
    accountName?: string,
  ): Promise<boolean> {
    return this.markAccountsDisabledInStatus([
      {
        accountId,
        accountName,
      },
    ])
  }

  /**
   * Best-effort pruning for account-scoped auto check-in status data.
   *
   * This keeps the status blob clean when an account is deleted or intentionally
   * removed from the current auto check-in workflow.
   */
  async pruneStatusForAccountIds(accountIds: string[]): Promise<boolean> {
    const uniqueIds = Array.from(new Set(accountIds)).filter(Boolean)
    if (uniqueIds.length === 0) return true

    const { ok } = await this.updateStatus((current) => {
      if (!current) return { patch: null }

      const idSet = new Set(uniqueIds)
      let changed = false

      const next: AutoCheckinStatus = { ...current }

      const perAccountValue = current.perAccount
      if (perAccountValue && !isPlainObject(perAccountValue)) {
        next.perAccount = undefined
        changed = true
      } else if (isPlainObject(perAccountValue)) {
        const nextPerAccountEntries = Object.entries(perAccountValue).filter(
          ([accountId]) => !idSet.has(accountId),
        )
        if (
          nextPerAccountEntries.length !== Object.keys(perAccountValue).length
        ) {
          next.perAccount =
            nextPerAccountEntries.length > 0
              ? (Object.fromEntries(
                  nextPerAccountEntries,
                ) as AutoCheckinStatus["perAccount"])
              : undefined
          changed = true
        }
      }

      const accountsSnapshotValue = current.accountsSnapshot
      if (accountsSnapshotValue && !Array.isArray(accountsSnapshotValue)) {
        next.accountsSnapshot = undefined
        changed = true
      } else if (Array.isArray(accountsSnapshotValue)) {
        const filtered = accountsSnapshotValue.filter(
          (snapshot: any) => !idSet.has(snapshot?.accountId),
        )
        if (filtered.length !== accountsSnapshotValue.length) {
          next.accountsSnapshot = filtered.length > 0 ? filtered : undefined
          changed = true
        }
      }

      const retryStateValue = current.retryState
      if (retryStateValue && !isPlainObject(retryStateValue)) {
        next.retryState = undefined
        next.pendingRetry = false
        next.nextRetryScheduledAt = undefined
        next.retryAlarmTargetDay = undefined
        changed = true
      } else if (isPlainObject(retryStateValue)) {
        const pendingAccountIdsValue = retryStateValue.pendingAccountIds
        const pendingAccountIdsRaw = Array.isArray(pendingAccountIdsValue)
          ? pendingAccountIdsValue
          : []
        const pendingAccountIds = pendingAccountIdsRaw.filter(
          (accountId: unknown): accountId is string =>
            typeof accountId === "string" && Boolean(accountId),
        )
        const pendingAccountIdsFiltered = pendingAccountIds.filter(
          (accountId) => !idSet.has(accountId),
        )

        const attemptsByAccountValue = retryStateValue.attemptsByAccount
        const attemptsByAccountRaw = isPlainObject(attemptsByAccountValue)
          ? attemptsByAccountValue
          : {}
        const attemptsByAccountEntries = Object.entries(
          attemptsByAccountRaw,
        ).filter(([accountId]) => !idSet.has(accountId))

        const dayValue = retryStateValue.day
        const day = typeof dayValue === "string" ? dayValue : ""

        const nextRetryState =
          day &&
          (pendingAccountIdsFiltered.length > 0 ||
            attemptsByAccountEntries.length > 0)
            ? {
                day,
                pendingAccountIds: pendingAccountIdsFiltered,
                attemptsByAccount: Object.fromEntries(
                  attemptsByAccountEntries,
                ) as NonNullable<
                  NonNullable<
                    AutoCheckinStatus["retryState"]
                  >["attemptsByAccount"]
                >,
              }
            : undefined

        const retryStateHadInvalidShapes =
          (pendingAccountIdsValue !== undefined &&
            !Array.isArray(pendingAccountIdsValue)) ||
          (attemptsByAccountValue !== undefined &&
            !isPlainObject(attemptsByAccountValue)) ||
          typeof dayValue !== "string" ||
          !day ||
          pendingAccountIds.length !== pendingAccountIdsRaw.length

        const pendingChanged =
          pendingAccountIdsFiltered.length !== pendingAccountIds.length
        const attemptsChanged =
          attemptsByAccountEntries.length !==
          Object.keys(attemptsByAccountRaw).length

        if (pendingChanged || attemptsChanged || retryStateHadInvalidShapes) {
          next.retryState = nextRetryState
          // The day's ledger can survive with an empty work list, so the alarm
          // fields follow the work list rather than the ledger's existence.
          next.pendingRetry =
            (nextRetryState?.pendingAccountIds.length ?? 0) > 0
          if (!next.pendingRetry) {
            next.nextRetryScheduledAt = undefined
            next.retryAlarmTargetDay = undefined
          }
          changed = true
        }
      }

      if (!changed) return { patch: null }

      const nextPerAccount = isPlainObject(next.perAccount)
        ? (next.perAccount as Record<string, CheckinAccountResult>)
        : {}
      const nextSnapshots = Array.isArray(next.accountsSnapshot)
        ? (next.accountsSnapshot as AutoCheckinAccountSnapshot[])
        : undefined
      const resultCount = Object.keys(nextPerAccount).length
      const remainingAccountCount = Math.max(
        resultCount,
        nextSnapshots?.length ?? 0,
      )

      if (remainingAccountCount > 0) {
        const summary = {
          ...recalculateSummaryFromResults(nextPerAccount),
          totalEligible: remainingAccountCount,
        }

        next.summary = summary
        next.lastRunResult =
          resultCount > 0
            ? getAutoCheckinRunResultFromSummary(summary)
            : undefined
      } else {
        next.summary = undefined
        next.lastRunResult = undefined
      }

      return { patch: next }
    })

    if (!ok) {
      logger.warn("Failed to prune auto check-in status for account ids", {
        accountCount: uniqueIds.length,
      })
    }
    return ok
  }

  /**
   * Backward-compatible alias for delete-driven callers.
   */
  async pruneStatusForDeletedAccounts(accountIds: string[]): Promise<boolean> {
    return this.pruneStatusForAccountIds(accountIds)
  }
}

// Create singleton instance
export const autoCheckinStorage = new AutoCheckinStorage()
