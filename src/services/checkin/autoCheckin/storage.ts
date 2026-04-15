import { Storage } from "@plasmohq/storage"

import { withExtensionStorageWriteLock } from "~/services/core/storageWriteLock"
import {
  AUTO_CHECKIN_RUN_RESULT,
  AUTO_CHECKIN_SKIP_REASON,
  CHECKIN_RESULT_STATUS,
  getAutoCheckinSkipReasonTranslationKey,
  type AutoCheckinAccountSnapshot,
  type AutoCheckinRunResult,
  type AutoCheckinRunSummary,
  type AutoCheckinStatus,
  type CheckinAccountResult,
  type CheckinResultStatus,
} from "~/types/autoCheckin"
import { createLogger } from "~/utils/core/logger"
import { isPlainObject } from "~/utils/core/object"

const logger = createLogger("AutoCheckinStorage")

/**
 * Storage keys for Auto Check-in
 */
const STORAGE_KEYS = {
  AUTO_CHECKIN_STATUS: "autoCheckin_status",
} as const

export const AUTO_CHECKIN_STATUS_STORAGE_LOCK =
  "all-api-hub:auto-checkin-status" as const

/**
 * Recalculate the aggregated auto check-in run summary from per-account results.
 * @param perAccount Record of account ids to their latest check-in result.
 * @param previousSummary Optional previous summary used to preserve
 * `totalEligible` when the caller already knows the original eligible count.
 * @returns A normalized summary containing `totalEligible`, `executed`,
 * `successCount`, `failedCount`, `skippedCount`, and `needsRetry`.
 *
 * `successCount` includes both `CHECKIN_RESULT_STATUS.SUCCESS` and
 * `CHECKIN_RESULT_STATUS.ALREADY_CHECKED`. `executed` counts only successful and
 * failed executions, while `totalEligible` falls back to `executed + skipped`
 * when no prior eligible total is provided. `needsRetry` is true whenever
 * `failedCount > 0`.
 */
function recalculateSummaryFromResults(
  perAccount: Record<string, CheckinAccountResult>,
  previousSummary?: AutoCheckinRunSummary,
): AutoCheckinRunSummary {
  const values = Object.values(perAccount)
  const successStatuses: CheckinResultStatus[] = [
    CHECKIN_RESULT_STATUS.SUCCESS,
    CHECKIN_RESULT_STATUS.ALREADY_CHECKED,
  ]
  const successCount = values.filter((value) =>
    successStatuses.includes(value.status),
  ).length
  const failedCount = values.filter(
    (value) => value.status === CHECKIN_RESULT_STATUS.FAILED,
  ).length
  const skippedCount = values.filter(
    (value) => value.status === CHECKIN_RESULT_STATUS.SKIPPED,
  ).length

  const executed = successCount + failedCount
  const totalEligible =
    previousSummary?.totalEligible ?? executed + skippedCount

  return {
    totalEligible,
    executed,
    successCount,
    failedCount,
    skippedCount,
    needsRetry: failedCount > 0,
  }
}

/**
 *
 */
function getRunResultFromSummary(
  summary: AutoCheckinRunSummary,
): AutoCheckinRunResult {
  if (summary.failedCount > 0 && summary.successCount > 0) {
    return AUTO_CHECKIN_RUN_RESULT.PARTIAL
  }
  if (summary.failedCount > 0) {
    return AUTO_CHECKIN_RUN_RESULT.FAILED
  }
  return AUTO_CHECKIN_RUN_RESULT.SUCCESS
}

/**
 *
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
   * Save auto check-in status
   */
  async saveStatus(status: AutoCheckinStatus): Promise<boolean> {
    try {
      await this.storage.set(STORAGE_KEYS.AUTO_CHECKIN_STATUS, status)
      logger.debug("Status saved")
      return true
    } catch (error) {
      logger.error("Failed to save status", error)
      return false
    }
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

    return withExtensionStorageWriteLock(
      AUTO_CHECKIN_STATUS_STORAGE_LOCK,
      async () => {
        try {
          const current = (await this.getStatus()) as unknown as any
          if (!current) return true

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
            return true
          }

          const disabledIdSet = matchedAccountIds
          let retryState = isPlainObject(current.retryState)
            ? current.retryState
            : undefined

          if (retryState) {
            const pendingAccountIds = Array.isArray(
              retryState.pendingAccountIds,
            )
              ? retryState.pendingAccountIds.filter(
                  (pendingId: unknown): pendingId is string =>
                    typeof pendingId === "string" &&
                    !disabledIdSet.has(pendingId),
                )
              : []
            const attemptsByAccount = isPlainObject(
              retryState.attemptsByAccount,
            )
              ? Object.fromEntries(
                  Object.entries(retryState.attemptsByAccount).filter(
                    ([pendingId]) => !disabledIdSet.has(pendingId),
                  ),
                )
              : {}

            retryState =
              typeof retryState.day === "string" && pendingAccountIds.length > 0
                ? {
                    day: retryState.day,
                    pendingAccountIds,
                    attemptsByAccount,
                  }
                : undefined
          }

          const summary = recalculateSummaryFromResults(
            perAccount,
            current.summary,
          )
          const pendingRetry = Boolean(
            retryState &&
              Array.isArray(retryState.pendingAccountIds) &&
              retryState.pendingAccountIds.length > 0,
          )

          const nextStatus: AutoCheckinStatus = {
            ...current,
            lastRunResult: getRunResultFromSummary(summary),
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
          }

          const success = await this.saveStatus(nextStatus)
          if (!success) {
            logger.warn(
              "Failed to mark disabled accounts in auto check-in status",
              {
                accountIds: normalizedAccounts.map(
                  (account) => account.accountId,
                ),
              },
            )
          }
          return success
        } catch (error) {
          logger.warn(
            "Failed to mark disabled accounts in auto check-in status",
            {
              accountIds: normalizedAccounts.map(
                (account) => account.accountId,
              ),
              error,
            },
          )
          return false
        }
      },
    )
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

    return withExtensionStorageWriteLock(
      AUTO_CHECKIN_STATUS_STORAGE_LOCK,
      async () => {
        try {
          const current = (await this.getStatus()) as unknown as any
          if (!current) return true

          const idSet = new Set(uniqueIds)
          let changed = false

          const next: AutoCheckinStatus = { ...current }

          const perAccountValue = current.perAccount
          if (perAccountValue && !isPlainObject(perAccountValue)) {
            next.perAccount = undefined
            changed = true
          } else if (isPlainObject(perAccountValue)) {
            const nextPerAccountEntries = Object.entries(
              perAccountValue,
            ).filter(([accountId]) => !idSet.has(accountId))
            if (
              nextPerAccountEntries.length !==
              Object.keys(perAccountValue).length
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
              day && pendingAccountIdsFiltered.length > 0
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

            if (
              pendingChanged ||
              attemptsChanged ||
              retryStateHadInvalidShapes
            ) {
              next.retryState = nextRetryState
              if (!nextRetryState) {
                next.pendingRetry = false
                next.nextRetryScheduledAt = undefined
                next.retryAlarmTargetDay = undefined
              }
              changed = true
            }
          }

          if (!changed) return true

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
              resultCount > 0 ? getRunResultFromSummary(summary) : undefined
          } else {
            next.summary = undefined
            next.lastRunResult = undefined
          }

          const success = await this.saveStatus(next)
          if (!success) {
            logger.warn(
              "Failed to prune auto check-in status for account ids",
              {
                accountCount: uniqueIds.length,
              },
            )
          }
          return success
        } catch (error) {
          logger.warn("Failed to prune auto check-in status for account ids", {
            accountCount: uniqueIds.length,
            error,
          })
          return false
        }
      },
    )
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
