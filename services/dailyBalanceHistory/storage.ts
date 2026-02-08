import { Storage } from "@plasmohq/storage"

import { STORAGE_KEYS, STORAGE_LOCKS } from "~/services/storageKeys"
import { withExtensionStorageWriteLock } from "~/services/storageWriteLock"
import type {
  DailyBalanceHistoryStore,
  DailyBalanceSnapshot,
} from "~/types/dailyBalanceHistory"
import { DAILY_BALANCE_HISTORY_STORE_SCHEMA_VERSION } from "~/types/dailyBalanceHistory"
import { getErrorMessage } from "~/utils/error"
import { createLogger } from "~/utils/logger"

import { computeRetentionCutoffDayKey, parseDayKey } from "./dayKeys"

const logger = createLogger("DailyBalanceHistoryStorage")

/**
 *
 */
function createEmptyStore(): DailyBalanceHistoryStore {
  return {
    schemaVersion: DAILY_BALANCE_HISTORY_STORE_SCHEMA_VERSION,
    snapshotsByAccountId: {},
  }
}

/**
 *
 */
function sanitizeSnapshot(value: unknown): DailyBalanceSnapshot | null {
  if (!value || typeof value !== "object") {
    return null
  }

  const payload = value as Partial<DailyBalanceSnapshot>

  const quota =
    typeof payload.quota === "number" && Number.isFinite(payload.quota)
      ? payload.quota
      : null

  const capturedAt =
    typeof payload.capturedAt === "number" &&
    Number.isFinite(payload.capturedAt)
      ? payload.capturedAt
      : null

  const source =
    payload.source === "refresh" || payload.source === "alarm"
      ? payload.source
      : null

  if (quota === null || capturedAt === null || source === null) {
    return null
  }

  const today_income =
    payload.today_income === null
      ? null
      : typeof payload.today_income === "number" &&
          Number.isFinite(payload.today_income)
        ? payload.today_income
        : null

  const today_quota_consumption =
    payload.today_quota_consumption === null
      ? null
      : typeof payload.today_quota_consumption === "number" &&
          Number.isFinite(payload.today_quota_consumption)
        ? payload.today_quota_consumption
        : null

  return {
    quota,
    today_income,
    today_quota_consumption,
    capturedAt,
    source,
  }
}

/**
 *
 */
function sanitizeStore(value: unknown): DailyBalanceHistoryStore {
  const base = createEmptyStore()

  if (!value || typeof value !== "object") {
    return base
  }

  const payload = value as Partial<DailyBalanceHistoryStore>
  const rawSnapshots = (payload as any).snapshotsByAccountId

  if (!rawSnapshots || typeof rawSnapshots !== "object") {
    return base
  }

  const snapshotsByAccountId: DailyBalanceHistoryStore["snapshotsByAccountId"] =
    {}

  for (const [accountId, perDayValue] of Object.entries(rawSnapshots)) {
    if (!accountId || typeof accountId !== "string") continue
    if (!perDayValue || typeof perDayValue !== "object") continue

    const perDayOut: Record<string, DailyBalanceSnapshot> = {}
    for (const [dayKey, snapshotValue] of Object.entries(
      perDayValue as Record<string, unknown>,
    )) {
      if (typeof dayKey !== "string" || !parseDayKey(dayKey)) {
        continue
      }

      const sanitized = sanitizeSnapshot(snapshotValue)
      if (sanitized) {
        perDayOut[dayKey] = sanitized
      }
    }

    if (Object.keys(perDayOut).length > 0) {
      snapshotsByAccountId[accountId] = perDayOut
    }
  }

  return {
    schemaVersion: DAILY_BALANCE_HISTORY_STORE_SCHEMA_VERSION,
    snapshotsByAccountId,
  }
}

/**
 *
 */
function pruneStoreInPlace(
  store: DailyBalanceHistoryStore,
  cutoffDayKey: string,
) {
  for (const accountId of Object.keys(store.snapshotsByAccountId)) {
    const perDay = store.snapshotsByAccountId[accountId]
    for (const dayKey of Object.keys(perDay)) {
      if (dayKey < cutoffDayKey) {
        delete perDay[dayKey]
      }
    }

    if (Object.keys(perDay).length === 0) {
      delete store.snapshotsByAccountId[accountId]
    }
  }
}

class DailyBalanceHistoryStorage {
  private storage: Storage

  constructor() {
    this.storage = new Storage({ area: "local" })
  }

  /**
   * Read the store from extension storage and sanitize it to the latest schema.
   */
  async getStore(): Promise<DailyBalanceHistoryStore> {
    const raw = await this.storage.get(STORAGE_KEYS.DAILY_BALANCE_HISTORY_STORE)
    return sanitizeStore(raw)
  }

  private async setStore(store: DailyBalanceHistoryStore): Promise<boolean> {
    try {
      await this.storage.set(
        STORAGE_KEYS.DAILY_BALANCE_HISTORY_STORE,
        sanitizeStore(store),
      )
      return true
    } catch (error) {
      logger.error("Failed to persist store", error)
      return false
    }
  }

  /**
   * Update the store under an exclusive write lock to avoid cross-context
   * read-modify-write races.
   */
  async updateStore(
    updater: (
      store: DailyBalanceHistoryStore,
    ) => DailyBalanceHistoryStore | void,
  ): Promise<DailyBalanceHistoryStore> {
    return withExtensionStorageWriteLock(
      STORAGE_LOCKS.DAILY_BALANCE_HISTORY,
      async () => {
        const current = await this.getStore()
        const updated = updater(current) ?? current
        await this.setStore(updated)
        return updated
      },
    )
  }

  /**
   * Upsert a single account/day snapshot and prune to the configured retention window.
   */
  async upsertSnapshot(params: {
    accountId: string
    dayKey: string
    snapshot: DailyBalanceSnapshot
    retentionDays: number
    timeZone?: string
  }): Promise<boolean> {
    try {
      if (!parseDayKey(params.dayKey)) {
        return false
      }

      const cutoffDayKey = computeRetentionCutoffDayKey({
        retentionDays: params.retentionDays,
        nowUnixSeconds: Math.floor(Date.now() / 1000),
        timeZone: params.timeZone,
      })

      await this.updateStore((store) => {
        const perDay = store.snapshotsByAccountId[params.accountId] ?? {}
        perDay[params.dayKey] = params.snapshot
        store.snapshotsByAccountId[params.accountId] = perDay
        pruneStoreInPlace(store, cutoffDayKey)
      })

      return true
    } catch (error) {
      logger.error("Failed to upsert snapshot", {
        error: getErrorMessage(error),
      })
      return false
    }
  }

  /**
   * Prune all stored snapshots to the configured retention window.
   *
   * Safe to run repeatedly and used both on writes and when the user changes
   * retention settings.
   */
  async pruneAll(params: {
    retentionDays: number
    timeZone?: string
  }): Promise<boolean> {
    try {
      const cutoffDayKey = computeRetentionCutoffDayKey({
        retentionDays: params.retentionDays,
        nowUnixSeconds: Math.floor(Date.now() / 1000),
        timeZone: params.timeZone,
      })

      await this.updateStore((store) => {
        pruneStoreInPlace(store, cutoffDayKey)
      })

      return true
    } catch (error) {
      logger.error("Failed to prune store", { error: getErrorMessage(error) })
      return false
    }
  }
}

export const dailyBalanceHistoryStorage = new DailyBalanceHistoryStorage()
