import { Storage } from "@plasmohq/storage"

import { STORAGE_LOCKS } from "~/services/core/storageKeys"
import { withExtensionStorageWriteLock } from "~/services/core/storageWriteLock"
import {
  LogType,
  type LogItem,
} from "~/services/history/usageHistory/usageLogModel"
import { userPreferences } from "~/services/preferences/userPreferences"
import {
  USAGE_HISTORY_STORE_SCHEMA_VERSION,
  type UsageHistoryAccountStore,
  type UsageHistoryAggregate,
  type UsageHistoryCursor,
  type UsageHistoryLatencyAggregate,
  type UsageHistoryStore,
} from "~/types/usageHistory"
import { getDayKeyFromUnixSeconds, parseDayKey } from "~/utils/core/dayKey"
import { getErrorMessage } from "~/utils/core/error"
import { createLogger } from "~/utils/core/logger"
import { isPlainObject } from "~/utils/core/object"

import {
  USAGE_HISTORY_LIMITS,
  USAGE_HISTORY_STORAGE_KEYS,
  USAGE_HISTORY_UNSUPPORTED_COOLDOWN_MS,
} from "./constants"
import {
  computeRetentionCutoffDayKey,
  createEmptyUsageHistoryAccountStore,
  createEmptyUsageHistoryLatencyAggregate,
  ingestConsumeLogItems,
  pruneUsageHistoryAccountStore,
} from "./core"

const logger = createLogger("UsageHistoryStorage")

/**
 * Create a new empty top-level store (current schema).
 */
function createEmptyStore(): UsageHistoryStore {
  return {
    schemaVersion: USAGE_HISTORY_STORE_SCHEMA_VERSION,
    accounts: {},
  }
}

/**
 * Sanitize stored numeric aggregates into a safe shape for analysis/rendering.
 */
function sanitizeAggregate(value: unknown): UsageHistoryAggregate {
  const payload = isPlainObject(value) ? value : {}
  const requests = Number(payload.requests)
  const promptTokens = Number(payload.promptTokens)
  const completionTokens = Number(payload.completionTokens)
  const totalTokens = Number(payload.totalTokens)
  const quotaConsumed = Number(payload.quotaConsumed)

  return {
    requests: Number.isFinite(requests) && requests > 0 ? requests : 0,
    promptTokens:
      Number.isFinite(promptTokens) && promptTokens > 0 ? promptTokens : 0,
    completionTokens:
      Number.isFinite(completionTokens) && completionTokens > 0
        ? completionTokens
        : 0,
    totalTokens:
      Number.isFinite(totalTokens) && totalTokens > 0 ? totalTokens : 0,
    quotaConsumed:
      Number.isFinite(quotaConsumed) && quotaConsumed > 0 ? quotaConsumed : 0,
  }
}

/**
 * Sanitizes a latency aggregate.
 */
function sanitizeLatencyAggregate(
  value: unknown,
): UsageHistoryLatencyAggregate {
  const payload = isPlainObject(value) ? value : {}
  const base = createEmptyUsageHistoryLatencyAggregate()

  const count = Number(payload.count)
  const sum = Number(payload.sum)
  const max = Number(payload.max)
  const slowCount = Number(payload.slowCount)
  const unknownCount = Number(payload.unknownCount)
  const buckets = Array.isArray(payload.buckets) ? payload.buckets : []

  base.count = Number.isFinite(count) && count > 0 ? count : 0
  base.sum = Number.isFinite(sum) && sum > 0 ? sum : 0
  base.max = Number.isFinite(max) && max > 0 ? max : 0
  base.slowCount = Number.isFinite(slowCount) && slowCount > 0 ? slowCount : 0
  base.unknownCount =
    Number.isFinite(unknownCount) && unknownCount > 0 ? unknownCount : 0

  for (let index = 0; index < base.buckets.length; index += 1) {
    const bucketValue = Number(buckets[index])
    base.buckets[index] =
      Number.isFinite(bucketValue) && bucketValue > 0 ? bucketValue : 0
  }

  return base
}

/**
 * Sanitizes a usage history cursor.
 */
function sanitizeCursor(value: unknown): UsageHistoryCursor {
  const payload = isPlainObject(value) ? value : {}
  const lastSeenCreatedAt = Number(payload.lastSeenCreatedAt)
  const fingerprintsAtLastSeenCreatedAt = Array.isArray(
    payload.fingerprintsAtLastSeenCreatedAt,
  )
    ? payload.fingerprintsAtLastSeenCreatedAt.filter(
        (item): item is string =>
          typeof item === "string" && item.trim() !== "",
      )
    : []

  return {
    lastSeenCreatedAt:
      Number.isFinite(lastSeenCreatedAt) && lastSeenCreatedAt > 0
        ? lastSeenCreatedAt
        : 0,
    fingerprintsAtLastSeenCreatedAt,
  }
}

/**
 * Sanitizes aggregate usage grouped by day.
 */
function sanitizeAggregateByDay(
  value: unknown,
): Record<string, UsageHistoryAggregate> {
  if (!isPlainObject(value)) {
    return {}
  }

  const out: Record<string, UsageHistoryAggregate> = {}
  for (const [dayKey, aggregate] of Object.entries(value)) {
    if (!parseDayKey(dayKey)) {
      continue
    }
    out[dayKey] = sanitizeAggregate(aggregate)
  }
  return out
}

/**
 * Sanitizes aggregate usage grouped by hour.
 */
function sanitizeAggregateByHour(
  value: unknown,
): Record<string, UsageHistoryAggregate> {
  if (!isPlainObject(value)) {
    return {}
  }

  const out: Record<string, UsageHistoryAggregate> = {}
  for (const [hourKey, aggregate] of Object.entries(value)) {
    if (!/^(0\d|1\d|2[0-3])$/.test(hourKey)) {
      continue
    }
    out[hourKey] = sanitizeAggregate(aggregate)
  }
  return out
}

/**
 * Sanitizes hourly usage grouped by day.
 */
function sanitizeHourlyByDay(
  value: unknown,
): Record<string, Record<string, UsageHistoryAggregate>> {
  if (!isPlainObject(value)) {
    return {}
  }

  const out: Record<string, Record<string, UsageHistoryAggregate>> = {}
  for (const [dayKey, hourly] of Object.entries(value)) {
    if (!parseDayKey(dayKey)) {
      continue
    }
    const sanitized = sanitizeAggregateByHour(hourly)
    if (Object.keys(sanitized).length > 0) {
      out[dayKey] = sanitized
    }
  }
  return out
}

/**
 * Sanitizes hourly usage by token grouped by day.
 */
function sanitizeHourlyByTokenByDay(
  value: unknown,
): Record<string, Record<string, Record<string, UsageHistoryAggregate>>> {
  if (!isPlainObject(value)) {
    return {}
  }

  const out: Record<
    string,
    Record<string, Record<string, UsageHistoryAggregate>>
  > = {}
  for (const [tokenId, perToken] of Object.entries(value)) {
    if (!tokenId || !isPlainObject(perToken)) {
      continue
    }

    const tokenOut: Record<string, Record<string, UsageHistoryAggregate>> = {}
    for (const [dayKey, hourly] of Object.entries(perToken)) {
      if (!parseDayKey(dayKey)) {
        continue
      }
      const sanitized = sanitizeAggregateByHour(hourly)
      if (Object.keys(sanitized).length > 0) {
        tokenOut[dayKey] = sanitized
      }
    }

    if (Object.keys(tokenOut).length > 0) {
      out[tokenId] = tokenOut
    }
  }

  return out
}

/**
 * Sanitizes aggregate usage by model grouped by day.
 */
function sanitizeAggregateByModelByDay(
  value: unknown,
): Record<string, Record<string, UsageHistoryAggregate>> {
  if (!isPlainObject(value)) {
    return {}
  }

  const out: Record<string, Record<string, UsageHistoryAggregate>> = {}
  for (const [modelName, daily] of Object.entries(value)) {
    if (!modelName) {
      continue
    }
    const sanitized = sanitizeAggregateByDay(daily)
    if (Object.keys(sanitized).length > 0) {
      out[modelName] = sanitized
    }
  }
  return out
}

/**
 * Sanitizes aggregate usage by token grouped by day.
 */
function sanitizeAggregateByTokenByDay(
  value: unknown,
): Record<string, Record<string, UsageHistoryAggregate>> {
  if (!isPlainObject(value)) {
    return {}
  }

  const out: Record<string, Record<string, UsageHistoryAggregate>> = {}
  for (const [tokenId, daily] of Object.entries(value)) {
    if (!tokenId) {
      continue
    }
    const sanitized = sanitizeAggregateByDay(daily)
    if (Object.keys(sanitized).length > 0) {
      out[tokenId] = sanitized
    }
  }
  return out
}

/**
 * Sanitizes aggregate usage by token and model grouped by day.
 */
function sanitizeAggregateByTokenByModelByDay(
  value: unknown,
): Record<string, Record<string, Record<string, UsageHistoryAggregate>>> {
  if (!isPlainObject(value)) {
    return {}
  }

  const out: Record<
    string,
    Record<string, Record<string, UsageHistoryAggregate>>
  > = {}
  for (const [tokenId, perToken] of Object.entries(value)) {
    if (!tokenId || !isPlainObject(perToken)) {
      continue
    }

    const tokenOut: Record<string, Record<string, UsageHistoryAggregate>> = {}
    for (const [modelName, modelDaily] of Object.entries(perToken)) {
      if (!modelName) {
        continue
      }
      const sanitized = sanitizeAggregateByDay(modelDaily)
      if (Object.keys(sanitized).length > 0) {
        tokenOut[modelName] = sanitized
      }
    }

    if (Object.keys(tokenOut).length > 0) {
      out[tokenId] = tokenOut
    }
  }

  return out
}

/**
 * Sanitizes latency grouped by day.
 */
function sanitizeLatencyByDay(
  value: unknown,
): Record<string, UsageHistoryLatencyAggregate> {
  if (!isPlainObject(value)) {
    return {}
  }

  const out: Record<string, UsageHistoryLatencyAggregate> = {}
  for (const [dayKey, aggregate] of Object.entries(value)) {
    if (!parseDayKey(dayKey)) {
      continue
    }
    out[dayKey] = sanitizeLatencyAggregate(aggregate)
  }
  return out
}

/**
 * Sanitizes latency by model grouped by day.
 */
function sanitizeLatencyByModelByDay(
  value: unknown,
): Record<string, Record<string, UsageHistoryLatencyAggregate>> {
  if (!isPlainObject(value)) {
    return {}
  }

  const out: Record<string, Record<string, UsageHistoryLatencyAggregate>> = {}
  for (const [modelName, daily] of Object.entries(value)) {
    if (!modelName) {
      continue
    }
    const sanitized = sanitizeLatencyByDay(daily)
    if (Object.keys(sanitized).length > 0) {
      out[modelName] = sanitized
    }
  }
  return out
}

/**
 * Sanitizes latency by token grouped by day.
 */
function sanitizeLatencyByTokenByDay(
  value: unknown,
): Record<string, Record<string, UsageHistoryLatencyAggregate>> {
  if (!isPlainObject(value)) {
    return {}
  }

  const out: Record<string, Record<string, UsageHistoryLatencyAggregate>> = {}
  for (const [tokenId, daily] of Object.entries(value)) {
    if (!tokenId) {
      continue
    }
    const sanitized = sanitizeLatencyByDay(daily)
    if (Object.keys(sanitized).length > 0) {
      out[tokenId] = sanitized
    }
  }
  return out
}

/**
 * Sanitizes latency by token and model grouped by day.
 */
function sanitizeLatencyByTokenByModelByDay(
  value: unknown,
): Record<
  string,
  Record<string, Record<string, UsageHistoryLatencyAggregate>>
> {
  if (!isPlainObject(value)) {
    return {}
  }

  const out: Record<
    string,
    Record<string, Record<string, UsageHistoryLatencyAggregate>>
  > = {}
  for (const [tokenId, perToken] of Object.entries(value)) {
    if (!tokenId || !isPlainObject(perToken)) {
      continue
    }

    const tokenOut: Record<
      string,
      Record<string, UsageHistoryLatencyAggregate>
    > = {}
    for (const [modelName, modelDaily] of Object.entries(perToken)) {
      if (!modelName) {
        continue
      }
      const sanitized = sanitizeLatencyByDay(modelDaily)
      if (Object.keys(sanitized).length > 0) {
        tokenOut[modelName] = sanitized
      }
    }

    if (Object.keys(tokenOut).length > 0) {
      out[tokenId] = tokenOut
    }
  }

  return out
}

/**
 * Sanitize a stored per-account payload into the expected current shape.
 */
function sanitizeAccountStore(value: unknown): UsageHistoryAccountStore {
  if (!value || typeof value !== "object") {
    return createEmptyUsageHistoryAccountStore()
  }

  const payload = value as Partial<UsageHistoryAccountStore>
  const status = payload.status as unknown

  return {
    cursor: sanitizeCursor(payload.cursor),
    status: {
      state:
        isPlainObject(status) &&
        (status.state === "success" ||
          status.state === "error" ||
          status.state === "unsupported")
          ? status.state
          : "never",
      lastSyncAt:
        isPlainObject(status) && typeof status.lastSyncAt === "number"
          ? status.lastSyncAt
          : undefined,
      lastSuccessAt:
        isPlainObject(status) && typeof status.lastSuccessAt === "number"
          ? status.lastSuccessAt
          : undefined,
      lastWarning:
        isPlainObject(status) && typeof status.lastWarning === "string"
          ? status.lastWarning
          : undefined,
      lastError:
        isPlainObject(status) && typeof status.lastError === "string"
          ? status.lastError
          : undefined,
      unsupportedUntil:
        isPlainObject(status) && typeof status.unsupportedUntil === "number"
          ? status.unsupportedUntil
          : undefined,
    },
    daily: sanitizeAggregateByDay(payload.daily),
    hourly: sanitizeHourlyByDay(
      (payload as Partial<UsageHistoryAccountStore>).hourly,
    ),
    dailyByModel: sanitizeAggregateByModelByDay(payload.dailyByModel),
    tokenNamesById:
      payload.tokenNamesById && typeof payload.tokenNamesById === "object"
        ? Object.fromEntries(
            Object.entries(payload.tokenNamesById as Record<string, unknown>)
              .filter(
                ([key, value]) => Boolean(key) && typeof value === "string",
              )
              .map(([key, value]) => [key, (value as string).trim()])
              .filter(([, value]) => Boolean(value)),
          )
        : {},
    dailyByToken: sanitizeAggregateByTokenByDay(payload.dailyByToken),
    hourlyByToken: sanitizeHourlyByTokenByDay(
      (payload as Partial<UsageHistoryAccountStore>).hourlyByToken,
    ),
    dailyByTokenByModel: sanitizeAggregateByTokenByModelByDay(
      payload.dailyByTokenByModel,
    ),
    latencyDaily: sanitizeLatencyByDay(payload.latencyDaily),
    latencyDailyByModel: sanitizeLatencyByModelByDay(
      payload.latencyDailyByModel,
    ),
    latencyDailyByToken: sanitizeLatencyByTokenByDay(
      payload.latencyDailyByToken,
    ),
    latencyDailyByTokenByModel: sanitizeLatencyByTokenByModelByDay(
      payload.latencyDailyByTokenByModel,
    ),
  }
}

/**
 * Sanitize the persisted store payload into the current store schema.
 */
function sanitizeStore(value: unknown): UsageHistoryStore {
  if (!isPlainObject(value)) {
    return createEmptyStore()
  }

  if (value.schemaVersion !== USAGE_HISTORY_STORE_SCHEMA_VERSION) {
    return createEmptyStore()
  }

  const accountsRaw = value.accounts

  const accounts: UsageHistoryStore["accounts"] = {}
  if (isPlainObject(accountsRaw)) {
    for (const [accountId, accountValue] of Object.entries(accountsRaw)) {
      if (!accountId) {
        continue
      }
      accounts[accountId] = sanitizeAccountStore(accountValue)
    }
  }

  return {
    schemaVersion: USAGE_HISTORY_STORE_SCHEMA_VERSION,
    accounts,
  }
}

/**
 * Storage service for usage-history aggregates and sync cursor/status state.
 */
class UsageHistoryStorage {
  private storage: Storage

  constructor() {
    this.storage = new Storage({
      area: "local",
    })
  }

  private async readStore(): Promise<{
    ok: boolean
    error?: unknown
    store: UsageHistoryStore
  }> {
    try {
      const stored = (await this.storage.get(
        USAGE_HISTORY_STORAGE_KEYS.STORE,
      )) as unknown

      if (stored && typeof stored === "object") {
        return { ok: true, store: sanitizeStore(stored) }
      }

      return { ok: true, store: createEmptyStore() }
    } catch (error) {
      logger.error("Failed to load store", error)
      return { ok: false, error, store: createEmptyStore() }
    }
  }

  async getStore(): Promise<UsageHistoryStore> {
    return (await this.readStore()).store
  }

  private async setStore(store: UsageHistoryStore): Promise<void> {
    await this.storage.set(USAGE_HISTORY_STORAGE_KEYS.STORE, store)
  }

  /** Returns a mutation receipt only after the locked store write succeeds. */
  private async mutateStore<TResult>(
    mutation: (
      store: UsageHistoryStore,
    ) =>
      | { store: UsageHistoryStore; result: TResult }
      | Promise<{ store: UsageHistoryStore; result: TResult }>,
  ): Promise<TResult> {
    return withExtensionStorageWriteLock(
      STORAGE_LOCKS.USAGE_HISTORY,
      async () => {
        const read = await this.readStore()
        if (!read.ok)
          throw read.error ?? new Error("Failed to load usage history")
        const changed = await mutation(read.store)
        await this.setStore(changed.store)
        return changed.result
      },
    )
  }

  /** Updates the latest store under its exclusive write lock. */
  async updateStore(
    updater: (
      store: UsageHistoryStore,
    ) => UsageHistoryStore | void | Promise<UsageHistoryStore | void>,
  ): Promise<UsageHistoryStore> {
    return this.mutateStore(async (current) => {
      const store = (await updater(current)) ?? current
      return { store, result: store }
    })
  }

  async getAccountStore(accountId: string): Promise<UsageHistoryAccountStore> {
    const store = await this.getStore()
    return store.accounts[accountId] ?? createEmptyUsageHistoryAccountStore()
  }

  async updateAccountStore(
    accountId: string,
    updater: (
      store: UsageHistoryAccountStore,
    ) => UsageHistoryAccountStore | void,
  ): Promise<UsageHistoryAccountStore> {
    const updated = await this.updateStore((store) => {
      const current =
        store.accounts[accountId] ?? createEmptyUsageHistoryAccountStore()
      const next = updater(current) ?? current
      store.accounts[accountId] = next
    })

    return updated.accounts[accountId] ?? createEmptyUsageHistoryAccountStore()
  }

  /** Strict admission read: collection cannot proceed from an unreadable cursor. */
  async getSyncState(
    accountId: string,
  ): Promise<Pick<UsageHistoryAccountStore, "cursor" | "status">> {
    const read = await this.readStore()
    if (!read.ok) throw read.error ?? new Error("Failed to load usage history")
    const account =
      read.store.accounts[accountId] ?? createEmptyUsageHistoryAccountStore()
    return { cursor: account.cursor, status: account.status }
  }

  /** Commits collected logs against the latest cursor and retention policy under one write lock. */
  async commitSync(
    accountId: string,
    params: {
      items: LogItem[]
      nowMs: number
      partial: boolean
      retentionDays: number
      timeZone?: string
    },
  ): Promise<{ ingestedCount: number }> {
    return this.mutateStore(async (store) => {
      const account =
        store.accounts[accountId] ?? createEmptyUsageHistoryAccountStore()
      // Batch settings are a collection snapshot. A settings change that completed
      // while requests were pending owns the retention applied by this commit.
      const preferences = await userPreferences.getPreferencesStrict()
      const retentionDays =
        preferences.usageHistory?.retentionDays ?? params.retentionDays
      const cutoffDayKey = computeRetentionCutoffDayKey(
        retentionDays,
        Math.floor(Date.now() / 1000),
        params.timeZone,
      )
      const items = params.items.filter(
        (item) =>
          item.type === LogType.Consume &&
          !(item.created_at < account.cursor.lastSeenCreatedAt) &&
          getDayKeyFromUnixSeconds(item.created_at, params.timeZone) >=
            cutoffDayKey,
      )
      const startCursor = {
        ...account.cursor,
        fingerprintsAtLastSeenCreatedAt: [
          ...account.cursor.fingerprintsAtLastSeenCreatedAt,
        ],
      }
      const result = ingestConsumeLogItems({
        accountStore: account,
        items,
        startCursor,
        cursorCandidate: {
          ...startCursor,
          fingerprintsAtLastSeenCreatedAt: [
            ...startCursor.fingerprintsAtLastSeenCreatedAt,
          ],
        },
        timeZone: params.timeZone,
      })
      account.cursor = result.cursorCandidate
      pruneUsageHistoryAccountStore(account, cutoffDayKey)
      account.status = {
        ...account.status,
        state: "success",
        lastSyncAt: params.nowMs,
        lastSuccessAt: params.nowMs,
        lastWarning: params.partial
          ? `Reached safety limits (maxPages=${USAGE_HISTORY_LIMITS.maxPages}, maxItems=${USAGE_HISTORY_LIMITS.maxItems}); history may be incomplete for this run.`
          : undefined,
        lastError: undefined,
        unsupportedUntil: undefined,
      }
      store.accounts[accountId] = account
      return { store, result: { ingestedCount: result.ingestedCount } }
    })
  }

  /** Records one failed attempt; callers may report it even if this write also fails. */
  async recordSyncFailure(
    accountId: string,
    params: { nowMs: number; unsupported: boolean; message: string },
  ): Promise<void> {
    await this.updateAccountStore(accountId, (account) => {
      account.status = {
        ...account.status,
        state: params.unsupported ? "unsupported" : "error",
        lastSyncAt: params.nowMs,
        lastWarning: undefined,
        lastError: params.message,
        unsupportedUntil: params.unsupported
          ? params.nowMs + USAGE_HISTORY_UNSUPPORTED_COOLDOWN_MS
          : account.status.unsupportedUntil,
      }
    })
  }

  /**
   * Prune stored aggregates to the current retention window.
   *
   * This is safe to run repeatedly and is used both after sync and when the
   * user changes retention settings.
   */
  async pruneAllAccounts(
    retentionDays: number,
    timeZone?: string,
  ): Promise<boolean> {
    try {
      const nowUnixSeconds = Math.floor(Date.now() / 1000)
      const cutoffDayKey = computeRetentionCutoffDayKey(
        retentionDays,
        nowUnixSeconds,
        timeZone,
      )

      await this.updateStore((store) => {
        for (const accountStore of Object.values(store.accounts)) {
          pruneUsageHistoryAccountStore(accountStore, cutoffDayKey)
        }
      })

      return true
    } catch (error) {
      logger.error("Failed to prune store", { error: getErrorMessage(error) })
      return false
    }
  }
}

export const usageHistoryStorage = new UsageHistoryStorage()
