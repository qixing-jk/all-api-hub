import { z } from "zod"

import { Storage } from "@plasmohq/storage"

import { QUOTA_PER_USD } from "~/constants/money"
import { accountAllowanceSnapshotSchema } from "~/services/accounts/allowances"
import { assetIdentity } from "~/services/amounts/assets"
import {
  balanceSnapshotSchema,
  usageScopeKey,
  usageScopeSchema,
} from "~/services/amounts/balance"
import {
  BALANCE_ROLES,
  FINANCIAL_SETTLEMENT_STATUSES,
  FINANCIAL_SUBJECT_KINDS,
  OBSERVATION_STATUSES,
} from "~/services/amounts/financialConstants"
import { financialIncomeFactSchema } from "~/services/amounts/income"
import {
  financialConsumptionFactSchema,
  isCumulativeConsumption,
  reportedUsageCostSchema,
  type FinancialConsumptionFact,
} from "~/services/amounts/usage"
import { STORAGE_KEYS, STORAGE_LOCKS } from "~/services/core/storageKeys"
import { withExtensionStorageWriteLock } from "~/services/core/storageWriteLock"
import type {
  DailyBalanceHistoryStore,
  DailyBalanceReferenceSnapshot,
  FinancialHistorySnapshot,
} from "~/types/dailyBalanceHistory"
import {
  DAILY_BALANCE_HISTORY_CAPTURE_SOURCES,
  DAILY_BALANCE_HISTORY_STORE_SCHEMA_VERSION,
} from "~/types/dailyBalanceHistory"
import { createUnixDayKeyFormatter, parseDayKey } from "~/utils/core/dayKey"
import { getErrorMessage } from "~/utils/core/error"
import { createLogger } from "~/utils/core/logger"

import { computeRetentionCutoffDayKey } from "./dayKeys"
import {
  compareFinancialHistorySnapshots,
  getAllowanceSeriesKey,
  getFinancialSeriesKey,
  getFinancialSnapshotCapturedAt,
} from "./identity"
import {
  getSoleAccountBalance,
  isConsumptionApplicableToBalance,
  NET_INFLOW_MAX_CLOCK_SKEW_MS,
} from "./netInflow"

const logger = createLogger("DailyBalanceHistoryStorage")

const financialHistorySnapshotSchema = z
  .strictObject({
    generation: z.number().int().nonnegative().safe().optional(),
    balance: balanceSnapshotSchema.optional(),
    allowances: accountAllowanceSnapshotSchema.optional(),
    settledConsumption: z.array(financialConsumptionFactSchema).optional(),
    reportedDayCosts: z
      .array(
        reportedUsageCostSchema
          .extend({
            dayKey: z
              .string()
              .refine((value) => Boolean(parseDayKey(value)))
              .optional(),
            scope: usageScopeSchema,
          })
          .strict(),
      )
      .optional(),
    reportedIncome: z.array(financialIncomeFactSchema).optional(),
    source: z.enum(DAILY_BALANCE_HISTORY_CAPTURE_SOURCES),
    endedPositionKeys: z.array(z.string()).optional(),
    endedAllowanceKeys: z.array(z.string()).optional(),
  })
  .refine(
    (snapshot) =>
      snapshot.balance !== undefined ||
      snapshot.allowances !== undefined ||
      Boolean(
        snapshot.settledConsumption?.length ||
        snapshot.reportedIncome?.length ||
        snapshot.reportedDayCosts?.length,
      ),
    "Missing financial observations",
  )
  .refine(
    (snapshot) => !snapshot.endedPositionKeys?.length || snapshot.balance,
    "Missing balance observation for ended positions",
  )
  .refine(
    (snapshot) => !snapshot.endedAllowanceKeys?.length || snapshot.allowances,
    "Missing allowance observation for ended plans",
  )

/** Reject invalid records so a read-modify-write cannot silently destroy them. */
function parseFinancialSnapshot(
  value: unknown,
  accountId: string,
): FinancialHistorySnapshot {
  const snapshot = financialHistorySnapshotSchema.parse(value)
  const belongsToAccount = (subject: { kind: string; accountId?: string }) =>
    subject.kind === FINANCIAL_SUBJECT_KINDS.Account &&
    subject.accountId === accountId
  if (
    (snapshot.balance && !belongsToAccount(snapshot.balance.subject)) ||
    snapshot.balance?.positions.some(
      (position) => !belongsToAccount(position.scope.subject),
    ) ||
    (snapshot.allowances && !belongsToAccount(snapshot.allowances.subject)) ||
    snapshot.allowances?.entries.some(
      (entry) => !belongsToAccount(entry.constraint.scope.subject),
    ) ||
    snapshot.settledConsumption?.some(
      (fact) => !belongsToAccount(fact.scope.subject),
    ) ||
    snapshot.reportedDayCosts?.some(
      (fact) => !belongsToAccount(fact.scope.subject),
    ) ||
    snapshot.reportedIncome?.some(
      (fact) => !belongsToAccount(fact.scope.subject),
    )
  ) {
    throw new Error("balance_history_subject_mismatch")
  }
  return snapshot
}

/**
 * Creates an empty daily balance history store.
 */
function createEmptyStore(): DailyBalanceHistoryStore {
  return {
    schemaVersion: DAILY_BALANCE_HISTORY_STORE_SCHEMA_VERSION,
    referenceSnapshotsByAccountId: {},
    financialSnapshotsByAccountId: {},
  }
}

/** Decode archived amounts using the version's denomination. */
function readReferenceSnapshot(
  value: unknown,
  legacy: boolean,
): DailyBalanceReferenceSnapshot | null {
  if (!value || typeof value !== "object") return null
  const payload = value as Record<string, unknown>
  const amount = (raw: unknown) =>
    typeof raw === "number" && Number.isFinite(raw)
      ? legacy
        ? raw / QUOTA_PER_USD
        : raw
      : null

  const balanceUsd = amount(legacy ? payload.quota : payload.balanceUsd)
  const { capturedAt, source } = payload
  if (
    balanceUsd === null ||
    typeof capturedAt !== "number" ||
    !Number.isFinite(capturedAt) ||
    (source !== DAILY_BALANCE_HISTORY_CAPTURE_SOURCES.Refresh &&
      source !== DAILY_BALANCE_HISTORY_CAPTURE_SOURCES.Alarm)
  )
    return null

  return {
    balanceUsd,
    incomeUsd: amount(legacy ? payload.today_income : payload.incomeUsd),
    consumptionUsd: amount(
      legacy ? payload.today_quota_consumption : payload.consumptionUsd,
    ),
    capturedAt,
    source,
  }
}

type StoredBalanceHistory = Omit<
  Partial<DailyBalanceHistoryStore>,
  "schemaVersion"
> & {
  schemaVersion?: unknown
  snapshotsByAccountId?: unknown
}

/**
 * Sanitizes the daily balance history store.
 */
function sanitizeStore(value: unknown): DailyBalanceHistoryStore {
  const base = createEmptyStore()

  if (value === undefined) {
    return base
  }
  if (value === null || typeof value !== "object")
    throw new Error("invalid_balance_history_store")

  const payload = value as StoredBalanceHistory
  if (
    payload.schemaVersion !== 1 &&
    payload.schemaVersion !== 2 &&
    payload.schemaVersion !== 3 &&
    payload.schemaVersion !== DAILY_BALANCE_HISTORY_STORE_SCHEMA_VERSION
  )
    throw new Error("unsupported_balance_history_version")
  const legacy =
    payload.schemaVersion !== DAILY_BALANCE_HISTORY_STORE_SCHEMA_VERSION
  const rawSnapshots =
    (legacy
      ? payload.snapshotsByAccountId
      : payload.referenceSnapshotsByAccountId) ?? {}
  if (typeof rawSnapshots !== "object" || Array.isArray(rawSnapshots))
    throw new Error("invalid_balance_history_store")
  const rawFinancial = z
    .record(z.string().min(1), z.array(z.unknown()))
    .parse(payload.financialSnapshotsByAccountId ?? {})

  const referenceSnapshotsByAccountId: DailyBalanceHistoryStore["referenceSnapshotsByAccountId"] =
    {}

  for (const [accountId, perDayValue] of Object.entries(rawSnapshots)) {
    if (!accountId || typeof accountId !== "string") continue
    if (!perDayValue || typeof perDayValue !== "object") continue

    const perDayOut: Record<string, DailyBalanceReferenceSnapshot> = {}
    for (const [dayKey, snapshotValue] of Object.entries(
      perDayValue as Record<string, unknown>,
    )) {
      if (typeof dayKey !== "string" || !parseDayKey(dayKey)) {
        continue
      }

      const sanitized = readReferenceSnapshot(snapshotValue, legacy)
      if (sanitized) {
        perDayOut[dayKey] = sanitized
      }
    }

    if (Object.keys(perDayOut).length > 0) {
      referenceSnapshotsByAccountId[accountId] = perDayOut
    }
  }

  return {
    schemaVersion: DAILY_BALANCE_HISTORY_STORE_SCHEMA_VERSION,
    referenceSnapshotsByAccountId,
    financialSnapshotsByAccountId: Object.fromEntries(
      Object.entries(rawFinancial).map(([id, entries]) => [
        id,
        entries.map((entry) => parseFinancialSnapshot(entry, id)),
      ]),
    ),
  }
}

/** Find eligible recorded baselines per billing boundary and independent balance series. */
function getBillingBaselines(entries: FinancialHistorySnapshot[]) {
  // Keep a local day of candidate baselines even if the provider has a longer
  // DST day or does not return a billing window until after midnight.
  const recentSince = Date.now() - 26 * 60 * 60_000
  const recentWindows: FinancialConsumptionFact[] = []
  const windows = new Map<number, Map<string, FinancialConsumptionFact>>()
  const bucketFor = (at: number) =>
    Math.floor(at / NET_INFLOW_MAX_CLOCK_SKEW_MS)
  for (const { settledConsumption } of entries) {
    for (const fact of settledConsumption ?? []) {
      if (
        !isCumulativeConsumption(fact) ||
        fact.settlement !== FINANCIAL_SETTLEMENT_STATUSES.Settled ||
        fact.amount.status !== OBSERVATION_STATUSES.Known
      )
        continue
      if (fact.window.end >= recentSince) recentWindows.push(fact)
      const bucket = bucketFor(fact.window.start)
      const facts = windows.get(bucket) ?? new Map()
      facts.set(
        JSON.stringify([
          fact.window.start,
          assetIdentity(fact.asset),
          usageScopeKey(fact.scope),
          fact.amount.source.adapter,
          fact.amount.source.contractVersion,
        ]),
        fact,
      )
      windows.set(bucket, facts)
    }
  }
  const closest = new Map<
    string,
    { distance: number; entry: FinancialHistorySnapshot }
  >()
  const unclassified = new Set<FinancialHistorySnapshot>()
  for (const entry of entries) {
    const positions = entry.balance?.positions ?? []
    const sole = getSoleAccountBalance(positions)
    for (const position of positions) {
      if (position.amount.status !== OBSERVATION_STATUSES.Known) continue
      const at = position.amount.observedAt
      if (
        at >= recentSince &&
        (position.role === BALANCE_ROLES.Ledger || position === sole) &&
        !recentWindows.some(
          (fact) =>
            at >= fact.window.start - NET_INFLOW_MAX_CLOCK_SKEW_MS &&
            at <= fact.window.end &&
            isConsumptionApplicableToBalance(position, fact, position === sole),
        )
      )
        unclassified.add(entry)
      const bucket = bucketFor(at)
      for (const candidate of [bucket - 1, bucket, bucket + 1]) {
        for (const [id, fact] of windows.get(candidate) ?? []) {
          const distance = Math.abs(at - fact.window.start)
          if (
            distance > NET_INFLOW_MAX_CLOCK_SKEW_MS ||
            !isConsumptionApplicableToBalance(position, fact, position === sole)
          )
            continue
          const key = JSON.stringify([id, getFinancialSeriesKey(position)])
          const previous = closest.get(key)
          if (!previous || distance < previous.distance)
            closest.set(key, { distance, entry })
        }
      }
    }
  }
  for (const { entry } of closest.values()) unclassified.add(entry)
  return unclassified
}

/** Prunes expired observations and compacts equivalent intraday receipts. */
function compactHistory(
  entries: FinancialHistorySnapshot[],
  dayKeyFor: (unixSeconds: number) => string,
  cutoff: string,
) {
  const baselines = getBillingBaselines(entries)
  const output: FinancialHistorySnapshot[] = []
  let signature: string | undefined
  let runLength = 0
  for (const entry of entries) {
    const at = getFinancialSnapshotCapturedAt(entry)
    const day = dayKeyFor(at / 1000)
    if (day < cutoff) continue
    const shape = JSON.stringify([
      day,
      entry.source,
      entry.balance && [
        entry.balance.coverage,
        entry.balance.positions.map((position) => [
          getFinancialSeriesKey(position),
          position.amount.status,
          position.window,
          position.validity,
        ]),
      ],
      entry.allowances && [
        entry.allowances.coverage,
        entry.allowances.entries.map((item) => [
          getAllowanceSeriesKey(item),
          item.validity,
          item.constraint.window,
          item.constraint.limitState,
          item.constraint.remaining?.status,
        ]),
      ],
      entry.settledConsumption?.map((fact) =>
        isCumulativeConsumption(fact)
          ? [
              fact.window,
              fact.scope,
              fact.asset,
              fact.amount.source.operation,
              fact.coverage,
              fact.amount.status,
            ]
          : fact,
      ),
      entry.reportedIncome?.map((fact) =>
        fact.amount.source.operation.endsWith(":credited-quota")
          ? [
              fact.window,
              fact.scope,
              fact.asset,
              fact.amount.source.operation,
              fact.coverage,
              fact.amount.status,
            ]
          : fact,
      ),
      entry.reportedDayCosts?.map(({ dayKey, scope, asset, amount }) => [
        dayKey,
        scope,
        asset,
        amount.status,
        amount.source.operation,
        amount.source.contractVersion,
      ]),
      // An early snapshot can be the only surviving baseline for the day's cumulative use.
      dayKeyFor((at - 10 * 60_000) / 1000) !== day,
    ])
    runLength = shape === signature ? runLength + 1 : 1
    signature = shape
    if (runLength > 2 && !baselines.has(output[output.length - 1]!))
      output[output.length - 1] = entry
    else output.push(entry)
  }
  return output
}

/** Reclaim expired history and bound repeated intraday observations before writing. */
function pruneStoreInPlace(
  store: DailyBalanceHistoryStore,
  cutoffDayKey: string,
  timeZone?: string,
) {
  const dayKeyFor = createUnixDayKeyFormatter(timeZone)
  for (const [id, entries] of Object.entries(
    store.financialSnapshotsByAccountId ?? {},
  )) {
    const retained = compactHistory(entries, dayKeyFor, cutoffDayKey)
    if (retained.length) store.financialSnapshotsByAccountId![id] = retained
    else delete store.financialSnapshotsByAccountId![id]
  }
  for (const [accountId, perDay] of Object.entries(
    store.referenceSnapshotsByAccountId,
  )) {
    for (const dayKey of Object.keys(perDay)) {
      if (dayKey < cutoffDayKey) {
        delete perDay[dayKey]
      }
    }

    if (Object.keys(perDay).length === 0) {
      delete store.referenceSnapshotsByAccountId[accountId]
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
    const raw = await this.readStored()
    if (!this.needsMigration(raw)) return sanitizeStore(raw)

    return withExtensionStorageWriteLock(
      STORAGE_LOCKS.DAILY_BALANCE_HISTORY,
      async () => {
        const current = await this.readStored()
        const store = sanitizeStore(current)
        if (this.needsMigration(current) && !(await this.setStore(store))) {
          throw new Error("balance_history_write_failed")
        }
        return store
      },
    )
  }

  private readStored() {
    return this.storage.get<StoredBalanceHistory>(
      STORAGE_KEYS.DAILY_BALANCE_HISTORY_STORE,
    )
  }

  private needsMigration(raw: StoredBalanceHistory | undefined) {
    return (
      raw?.schemaVersion === 1 ||
      raw?.schemaVersion === 2 ||
      raw?.schemaVersion === 3
    )
  }

  /** Appends accepted canonical facts without rewriting the legacy daily series. */
  async appendFinancialSnapshot(params: {
    accountId: string
    snapshot: FinancialHistorySnapshot
    retentionDays: number
    timeZone?: string
  }): Promise<boolean> {
    try {
      const snapshot = parseFinancialSnapshot(params.snapshot, params.accountId)
      const signature = (entry: FinancialHistorySnapshot) =>
        JSON.stringify([
          entry.generation,
          entry.balance,
          entry.allowances,
          entry.settledConsumption,
          entry.reportedDayCosts,
          entry.reportedIncome,
        ])
      const snapshotSignature = signature(snapshot)
      const updated = await this.updateStore((store) => {
        const byAccount = (store.financialSnapshotsByAccountId ??= {})
        const entries = (byAccount[params.accountId] ??= [])
        if (
          entries.some(
            (entry) =>
              entry.generation === snapshot.generation &&
              getFinancialSnapshotCapturedAt(entry) ===
                getFinancialSnapshotCapturedAt(snapshot) &&
              signature(entry) === snapshotSignature,
          )
        )
          return
        entries.push(snapshot)
        entries.sort(compareFinancialHistorySnapshots)
        let previousPositionKeys: string[] = []
        let previousAllowanceKeys: string[] = []
        for (const entry of entries) {
          delete entry.endedPositionKeys
          delete entry.endedAllowanceKeys
          if (entry.balance) {
            const currentKeys = entry.balance.positions.map(
              getFinancialSeriesKey,
            )
            const ended = previousPositionKeys.filter(
              (key) => !currentKeys.includes(key),
            )
            if (ended.length) entry.endedPositionKeys = ended
            previousPositionKeys = currentKeys
          }
          if (entry.allowances) {
            const currentKeys = entry.allowances.entries.map(
              getAllowanceSeriesKey,
            )
            const ended = previousAllowanceKeys.filter(
              (key) => !currentKeys.includes(key),
            )
            if (ended.length) entry.endedAllowanceKeys = ended
            previousAllowanceKeys = currentKeys
          }
        }
        pruneStoreInPlace(
          store,
          computeRetentionCutoffDayKey({
            retentionDays: params.retentionDays,
            nowUnixSeconds: Math.floor(Date.now() / 1000),
            timeZone: params.timeZone,
          }),
          params.timeZone,
        )
      })
      return (
        updated.financialSnapshotsByAccountId?.[params.accountId]?.some(
          (entry) => signature(entry) === snapshotSignature,
        ) ?? false
      )
    } catch (error) {
      logger.error("Failed to append financial history", {
        error: getErrorMessage(error),
      })
      return false
    }
  }

  private async setStore(store: DailyBalanceHistoryStore): Promise<boolean> {
    try {
      await this.storage.set(STORAGE_KEYS.DAILY_BALANCE_HISTORY_STORE, store)
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
  private async updateStore(
    updater: (
      store: DailyBalanceHistoryStore,
    ) => DailyBalanceHistoryStore | void,
  ): Promise<DailyBalanceHistoryStore> {
    return withExtensionStorageWriteLock(
      STORAGE_LOCKS.DAILY_BALANCE_HISTORY,
      async () => {
        const current = sanitizeStore(await this.readStored())
        const updated = updater(current) ?? current
        if (!(await this.setStore(updated)))
          throw new Error("balance_history_write_failed")
        return updated
      },
    )
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
        pruneStoreInPlace(store, cutoffDayKey, params.timeZone)
      })

      return true
    } catch (error) {
      logger.error("Failed to prune store", { error: getErrorMessage(error) })
      return false
    }
  }
}

export const dailyBalanceHistoryStorage = new DailyBalanceHistoryStorage()
