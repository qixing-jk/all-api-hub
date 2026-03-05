import { Storage } from "@plasmohq/storage"

import type { AutoCheckinStatus } from "~/types/autoCheckin"
import { createLogger } from "~/utils/core/logger"

const logger = createLogger("AutoCheckinStorage")

/**
 * Storage keys for Auto Check-in
 */
const STORAGE_KEYS = {
  AUTO_CHECKIN_STATUS: "autoCheckin_status",
} as const

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
   * Best-effort pruning for account-scoped auto check-in status data.
   *
   * This helps keep the status blob clean after bulk account deletions so UI
   * components and retry schedulers don't retain stale per-account entries.
   */
  async pruneStatusForDeletedAccounts(accountIds: string[]): Promise<boolean> {
    const uniqueIds = Array.from(new Set(accountIds)).filter(Boolean)
    if (uniqueIds.length === 0) return true

    const isPlainObject = (value: unknown): value is Record<string, any> =>
      typeof value === "object" && value !== null && !Array.isArray(value)

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
        const nextPerAccountEntries = Object.entries(perAccountValue).filter(
          ([accountId]) => !idSet.has(accountId),
        )
        if (
          nextPerAccountEntries.length !== Object.keys(perAccountValue).length
        ) {
          next.perAccount =
            nextPerAccountEntries.length > 0
              ? Object.fromEntries(nextPerAccountEntries)
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
                attemptsByAccount: Object.fromEntries(attemptsByAccountEntries),
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
          if (!nextRetryState) {
            next.pendingRetry = false
            next.nextRetryScheduledAt = undefined
            next.retryAlarmTargetDay = undefined
          }
          changed = true
        }
      }

      if (!changed) return true

      const success = await this.saveStatus(next)
      if (!success) {
        logger.warn(
          "Failed to prune auto check-in status after account deletion",
          {
            deletedAccountCount: uniqueIds.length,
          },
        )
      }
      return success
    } catch (error) {
      logger.warn(
        "Failed to prune auto check-in status after account deletion",
        {
          deletedAccountCount: uniqueIds.length,
          error,
        },
      )
      return false
    }
  }
}

// Create singleton instance
export const autoCheckinStorage = new AutoCheckinStorage()
