import { QUOTA_PER_USD } from "~/constants/money"
import { assetIdentity } from "~/services/amounts/assets"
import { usageScopeKey } from "~/services/amounts/balance"
import {
  ASSET_KINDS,
  EVIDENCE_KINDS,
  FINANCIAL_SETTLEMENT_STATUSES,
  OBSERVATION_STATUSES,
} from "~/services/amounts/financialConstants"
import {
  financialConsumptionFactSchema,
  mergeRecordedConsumption,
  type FinancialConsumptionFact,
} from "~/services/amounts/usage"
import { NEW_API_FINANCIAL_CONTRACT_VERSIONS } from "~/services/apiService/newApiFamily/financialContractVersions"
import { getHistoryRetentionCutoffDayKey } from "~/services/history/retention"
import { LogType } from "~/services/history/usageHistory/usageLogModel"
import type { LogItem } from "~/services/history/usageHistory/usageLogModel"
import {
  UNKNOWN_USAGE_TOKEN_ID,
  USAGE_HISTORY_SYNC_STATES,
  type UsageHistoryAccountStore,
  type UsageHistoryAggregate,
  type UsageHistoryCursor,
  type UsageHistoryLatencyAggregate,
} from "~/types/usageHistory"
import { getDayKeyFromUnixSeconds } from "~/utils/core/dayKey"

/**
 * Fixed latency threshold (seconds) for "slow" outcomes.
 *
 * This is used for slow-focused analytics and MUST NOT require raw logs to compute.
 */
export const USAGE_HISTORY_SLOW_THRESHOLD_SECONDS = 5

/**
 * Fixed latency histogram bucket upper bounds (seconds).
 *
 * Buckets are computed as:
 * - bucket 0: [0, bounds[0])
 * - bucket i: [bounds[i-1], bounds[i]) for 1 <= i < bounds.length
 * - last bucket: [bounds[last], +∞)
 */
export const USAGE_HISTORY_LATENCY_BUCKET_UPPER_BOUNDS_SECONDS = [
  0.25, 0.5, 1, 2, 3, 5, 8, 13, 21, 34,
] as const

/**
 * Convert unix seconds into a local hour bucket (`00`-`23`).
 *
 * When `timeZone` is omitted, the current environment's local timezone is used.
 */
function getHourKeyFromUnixSeconds(
  unixSeconds: number,
  timeZone?: string,
): string {
  const date = new Date(unixSeconds * 1000)
  const formatter = new Intl.DateTimeFormat("en-GB", {
    timeZone,
    hour: "2-digit",
    hourCycle: "h23",
  })

  const parts = formatter.formatToParts(date)
  let hour = ""
  for (const part of parts) {
    if (part.type === "hour") hour = part.value
  }

  if (!/^(0\d|1\d|2[0-3])$/.test(hour)) {
    throw new Error(`Failed to format hourKey for unixSeconds=${unixSeconds}`)
  }

  return hour
}

/**
 * Compute the earliest day bucket that should be retained for the given retention window.
 */
export function computeRetentionCutoffDayKey(
  retentionDays: number,
  nowUnixSeconds: number,
  timeZone?: string,
): string {
  const todayKey = getDayKeyFromUnixSeconds(nowUnixSeconds, timeZone)
  return getHistoryRetentionCutoffDayKey(todayKey, retentionDays)
}

/**
 * Create an empty aggregate bucket.
 */
export function createEmptyUsageHistoryAggregate(): UsageHistoryAggregate {
  return {
    requests: 0,
    promptTokens: 0,
    completionTokens: 0,
    totalTokens: 0,
  }
}

/**
 * Create an empty bounded latency aggregate bucket.
 */
export function createEmptyUsageHistoryLatencyAggregate(): UsageHistoryLatencyAggregate {
  return {
    count: 0,
    sum: 0,
    max: 0,
    slowCount: 0,
    unknownCount: 0,
    buckets: Array.from(
      { length: USAGE_HISTORY_LATENCY_BUCKET_UPPER_BOUNDS_SECONDS.length + 1 },
      () => 0,
    ),
  }
}

/**
 * Create an empty incremental cursor.
 */
function createEmptyUsageHistoryCursor(): UsageHistoryCursor {
  return {
    lastSeenCreatedAt: 0,
    fingerprintsAtLastSeenCreatedAt: [],
  }
}

/**
 * Create an empty per-account store.
 */
export function createEmptyUsageHistoryAccountStore(): UsageHistoryAccountStore {
  return {
    cursor: createEmptyUsageHistoryCursor(),
    status: {
      state: USAGE_HISTORY_SYNC_STATES.Never,
    },
    daily: {},
    hourly: {},
    dailyByModel: {},
    tokenNamesById: {},
    dailyByToken: {},
    hourlyByToken: {},
    dailyByTokenByModel: {},
    latencyDaily: {},
    latencyDailyByModel: {},
    latencyDailyByToken: {},
    latencyDailyByTokenByModel: {},
  }
}

/**
 * Build a privacy-safe fingerprint for a log item to support cursor boundary dedupe.
 *
 * This includes additional stable fields (token id, use_time) to reduce collisions
 * when multiple requests share the same `created_at` second.
 */
export function fingerprintLogItem(
  item: Pick<
    LogItem,
    | "created_at"
    | "type"
    | "model_name"
    | "prompt_tokens"
    | "completion_tokens"
    | "quota"
    | "channel_id"
    | "token_id"
    | "use_time"
    | "consumption"
  >,
): string {
  const useTime = Number(item.use_time)
  const useTimePart = Number.isFinite(useTime) ? useTime : "unknown"
  const legacy = [
    "v1",
    item.created_at,
    item.type,
    item.model_name ?? "",
    item.quota ?? 0,
    item.prompt_tokens ?? 0,
    item.completion_tokens ?? 0,
    item.channel_id ?? 0,
    item.token_id ?? 0,
    useTimePart,
  ].join("|")
  const fact = item.consumption
  return fact
    ? `${legacy}|financial:${JSON.stringify(
        normalizeFinancialIdentity([
          assetIdentity(fact.asset),
          usageScopeKey(fact.scope),
          fact.amount.status,
          "value" in fact.amount ? fact.amount.value : undefined,
          null,
          fact.amount.source.operation,
          fact.amount.source.contractVersion,
          fact.window,
          fact.settlement,
        ]),
      )}`
    : legacy
}

/** Match the source log independently of how its already-recorded charge is displayed. */
function normalizeFinancialIdentity(parts: unknown[]): unknown[] {
  const [
    asset,
    scope,
    status,
    value,
    ,
    operation,
    contract,
    window,
    settlement,
  ] = parts
  if (
    operation === "/api/log/self:quota" &&
    (contract === NEW_API_FINANCIAL_CONTRACT_VERSIONS.NativeQuota ||
      contract === NEW_API_FINANCIAL_CONTRACT_VERSIONS.StandardUsd)
  ) {
    // The legacy prefix holds the original quota used by both representations.
    return [null, scope, null, null, null, operation, null, window, settlement]
  }
  return [
    asset,
    scope,
    status,
    value,
    null,
    operation,
    contract,
    window,
    settlement,
  ]
}

/** Match stored cursors created before the financial source key was normalized. */
function normalizeBoundaryFingerprint(fingerprint: string): string {
  const marker = "|financial:"
  for (
    let index = fingerprint.indexOf(marker);
    index !== -1;
    index = fingerprint.indexOf(marker, index + marker.length)
  ) {
    const payloadStart = index + marker.length
    try {
      const parts: unknown = JSON.parse(fingerprint.slice(payloadStart))
      if (Array.isArray(parts) && parts.length === 9) {
        return (
          fingerprint.slice(0, payloadStart) +
          JSON.stringify(normalizeFinancialIdentity(parts))
        )
      }
    } catch {
      // A model name can itself contain the marker.
    }
  }
  return fingerprint
}

/** Merge counters and coverage in-place before folding recorded charges. */
function addAggregateCounters(
  target: UsageHistoryAggregate,
  delta: UsageHistoryAggregate,
) {
  target.requests += delta.requests
  target.promptTokens += delta.promptTokens
  target.completionTokens += delta.completionTokens
  target.totalTokens += delta.totalTokens
  if (delta.referenceCostUsd !== undefined)
    target.referenceCostUsd =
      (target.referenceCostUsd ?? 0) + delta.referenceCostUsd
  if (
    delta.consumptionIncomplete ||
    (delta.requests > 0 && !delta.consumption?.length)
  )
    target.consumptionIncomplete = true
}

/** Merge counters and recorded charges in-place. */
export function addToAggregate(
  target: UsageHistoryAggregate,
  delta: UsageHistoryAggregate,
) {
  addAggregateCounters(target, delta)
  if (delta.consumption?.length) {
    target.consumption = mergeRecordedConsumption(
      target.consumption ?? [],
      delta.consumption,
    )
  }
}

/** Merge bounded latency aggregates without dropping newer histogram buckets. */
export function addToLatencyAggregate(
  target: UsageHistoryLatencyAggregate,
  delta: UsageHistoryLatencyAggregate,
) {
  target.count += delta.count
  target.sum += delta.sum
  target.max = Math.max(target.max, delta.max)
  target.slowCount += delta.slowCount
  target.unknownCount += delta.unknownCount

  const maxLength = Math.max(target.buckets.length, delta.buckets.length)
  if (target.buckets.length < maxLength) {
    target.buckets = target.buckets.concat(
      Array.from({ length: maxLength - target.buckets.length }, () => 0),
    )
  }
  for (let index = 0; index < maxLength; index += 1) {
    target.buckets[index] =
      (target.buckets[index] ?? 0) + (delta.buckets[index] ?? 0)
  }
}

/**
 * Return the aggregate bucket for a key, creating it when missing.
 */
export function getOrCreateAggregate(
  map: Record<string, UsageHistoryAggregate>,
  key: string,
): UsageHistoryAggregate {
  const existing = map[key]
  if (existing) {
    return existing
  }
  const created = createEmptyUsageHistoryAggregate()
  map[key] = created
  return created
}

/**
 * Return the latency aggregate bucket for a key, creating it when missing.
 */
export function getOrCreateLatencyAggregate(
  map: Record<string, UsageHistoryLatencyAggregate>,
  key: string,
): UsageHistoryLatencyAggregate {
  const existing = map[key]
  if (existing) {
    return existing
  }
  const created = createEmptyUsageHistoryLatencyAggregate()
  map[key] = created
  return created
}

/**
 * Resolve a stable token id for aggregation keys.
 */
function getTokenIdForLogItem(item: LogItem): string {
  const tokenId = Number(item.token_id)
  return Number.isFinite(tokenId) ? String(tokenId) : UNKNOWN_USAGE_TOKEN_ID
}

/**
 * Resolve a stable model name for aggregation keys.
 */
function getModelNameForLogItem(item: LogItem): string {
  return String(item.model_name || "").trim() || "unknown"
}

/**
 * Resolve a bucket index for a latency value in seconds.
 */
function getLatencyBucketIndex(seconds: number): number {
  const index = USAGE_HISTORY_LATENCY_BUCKET_UPPER_BOUNDS_SECONDS.findIndex(
    (upperBoundSeconds) => seconds < upperBoundSeconds,
  )
  return index === -1
    ? USAGE_HISTORY_LATENCY_BUCKET_UPPER_BOUNDS_SECONDS.length
    : index
}

/**
 * Ingest a single Consume log item into usage + performance aggregates.
 */
function ingestConsumeItemToAccountStore(
  accountStore: UsageHistoryAccountStore,
  item: LogItem,
  dayKey: string,
  hourKey: string,
  addLogDelta: typeof addToAggregate,
) {
  const promptTokens = Number(item.prompt_tokens) || 0
  const completionTokens = Number(item.completion_tokens) || 0
  const rawQuota: unknown = item.quota
  const quotaConsumed =
    typeof rawQuota === "number" ||
    (typeof rawQuota === "string" && rawQuota.trim())
      ? Number(rawQuota)
      : Number.NaN
  const { data: consumption } = financialConsumptionFactSchema.safeParse(
    item.consumption,
  )
  const hasRecordedCharge =
    consumption?.amount.status === OBSERVATION_STATUSES.Known &&
    consumption.asset.kind !== ASSET_KINDS.Unknown &&
    consumption.settlement === FINANCIAL_SETTLEMENT_STATUSES.Settled &&
    consumption.amount.source.kind !== EVIDENCE_KINDS.Legacy &&
    consumption.amount.source.kind !== EVIDENCE_KINDS.Manual

  const delta: UsageHistoryAggregate = {
    requests: 1,
    promptTokens,
    completionTokens,
    totalTokens: promptTokens + completionTokens,
    ...(!hasRecordedCharge &&
    quotaConsumed >= 0 &&
    Number.isFinite(quotaConsumed)
      ? { referenceCostUsd: quotaConsumed / QUOTA_PER_USD }
      : {}),
    ...(consumption ? { consumption: [consumption] } : {}),
    ...(!hasRecordedCharge ? { consumptionIncomplete: true } : {}),
  }

  addLogDelta(getOrCreateAggregate(accountStore.daily, dayKey), delta)
  accountStore.hourly[dayKey] ??= {}
  addLogDelta(getOrCreateAggregate(accountStore.hourly[dayKey], hourKey), delta)

  const modelName = getModelNameForLogItem(item)
  accountStore.dailyByModel[modelName] ??= {}
  addLogDelta(
    getOrCreateAggregate(accountStore.dailyByModel[modelName], dayKey),
    delta,
  )

  const tokenId = getTokenIdForLogItem(item)
  const tokenName = String(item.token_name || "").trim()
  if (tokenName) {
    accountStore.tokenNamesById[tokenId] ??= tokenName
  }

  accountStore.dailyByToken[tokenId] ??= {}
  addLogDelta(
    getOrCreateAggregate(accountStore.dailyByToken[tokenId], dayKey),
    delta,
  )

  accountStore.hourlyByToken[tokenId] ??= {}
  accountStore.hourlyByToken[tokenId][dayKey] ??= {}
  addLogDelta(
    getOrCreateAggregate(accountStore.hourlyByToken[tokenId][dayKey], hourKey),
    delta,
  )

  accountStore.dailyByTokenByModel[tokenId] ??= {}
  accountStore.dailyByTokenByModel[tokenId][modelName] ??= {}
  addLogDelta(
    getOrCreateAggregate(
      accountStore.dailyByTokenByModel[tokenId][modelName],
      dayKey,
    ),
    delta,
  )

  const latencySeconds = Number(item.use_time)
  if (Number.isFinite(latencySeconds) && latencySeconds >= 0) {
    const bucketIndex = getLatencyBucketIndex(latencySeconds)
    const slow = latencySeconds >= USAGE_HISTORY_SLOW_THRESHOLD_SECONDS

    const applyLatency = (aggregate: UsageHistoryLatencyAggregate) => {
      aggregate.count += 1
      aggregate.sum += latencySeconds
      aggregate.max = Math.max(aggregate.max, latencySeconds)
      if (slow) {
        aggregate.slowCount += 1
      }
      aggregate.buckets[bucketIndex] = (aggregate.buckets[bucketIndex] ?? 0) + 1
    }

    applyLatency(getOrCreateLatencyAggregate(accountStore.latencyDaily, dayKey))

    accountStore.latencyDailyByModel[modelName] ??= {}
    applyLatency(
      getOrCreateLatencyAggregate(
        accountStore.latencyDailyByModel[modelName],
        dayKey,
      ),
    )

    accountStore.latencyDailyByToken[tokenId] ??= {}
    applyLatency(
      getOrCreateLatencyAggregate(
        accountStore.latencyDailyByToken[tokenId],
        dayKey,
      ),
    )

    accountStore.latencyDailyByTokenByModel[tokenId] ??= {}
    accountStore.latencyDailyByTokenByModel[tokenId][modelName] ??= {}
    applyLatency(
      getOrCreateLatencyAggregate(
        accountStore.latencyDailyByTokenByModel[tokenId][modelName],
        dayKey,
      ),
    )
  } else {
    getOrCreateLatencyAggregate(
      accountStore.latencyDaily,
      dayKey,
    ).unknownCount += 1

    accountStore.latencyDailyByModel[modelName] ??= {}
    getOrCreateLatencyAggregate(
      accountStore.latencyDailyByModel[modelName],
      dayKey,
    ).unknownCount += 1

    accountStore.latencyDailyByToken[tokenId] ??= {}
    getOrCreateLatencyAggregate(
      accountStore.latencyDailyByToken[tokenId],
      dayKey,
    ).unknownCount += 1

    accountStore.latencyDailyByTokenByModel[tokenId] ??= {}
    accountStore.latencyDailyByTokenByModel[tokenId][modelName] ??= {}
    getOrCreateLatencyAggregate(
      accountStore.latencyDailyByTokenByModel[tokenId][modelName],
      dayKey,
    ).unknownCount += 1
  }
}

/**
 * Delete every bucket in a day-keyed map that is strictly older than `cutoffDayKey`.
 */
function pruneDayBuckets<T>(
  bucketsByDay: Record<string, T>,
  cutoffDayKey: string,
): void {
  for (const dayKey of Object.keys(bucketsByDay)) {
    if (dayKey < cutoffDayKey) {
      delete bucketsByDay[dayKey]
    }
  }
}

/**
 * Prune a grouped `store[key][dayKey]` map, dropping keys whose buckets are all gone.
 */
function pruneGroupedDayBuckets<V>(
  store: Record<string, Record<string, V>>,
  cutoffDayKey: string,
): void {
  for (const [key, bucketsByDay] of Object.entries(store)) {
    pruneDayBuckets(bucketsByDay, cutoffDayKey)
    if (Object.keys(bucketsByDay).length === 0) {
      delete store[key]
    }
  }
}

/**
 * Prune a `store[key][name][dayKey]` map, dropping emptied buckets at both grouping levels.
 */
function pruneGroupedDayBucketsByName<V>(
  store: Record<string, Record<string, Record<string, V>>>,
  cutoffDayKey: string,
): void {
  for (const [key, groupedByDay] of Object.entries(store)) {
    pruneGroupedDayBuckets(groupedByDay, cutoffDayKey)
    if (Object.keys(groupedByDay).length === 0) {
      delete store[key]
    }
  }
}

/**
 * Prune stored aggregates for one account, removing buckets strictly older than `cutoffDayKey`.
 */
export function pruneUsageHistoryAccountStore(
  accountStore: UsageHistoryAccountStore,
  cutoffDayKey: string,
) {
  pruneDayBuckets(accountStore.daily, cutoffDayKey)
  pruneDayBuckets(accountStore.hourly, cutoffDayKey)
  pruneGroupedDayBuckets(accountStore.dailyByModel, cutoffDayKey)
  pruneGroupedDayBuckets(accountStore.dailyByToken, cutoffDayKey)
  pruneGroupedDayBuckets(accountStore.hourlyByToken, cutoffDayKey)
  pruneGroupedDayBucketsByName(accountStore.dailyByTokenByModel, cutoffDayKey)

  pruneDayBuckets(accountStore.latencyDaily, cutoffDayKey)
  pruneGroupedDayBuckets(accountStore.latencyDailyByModel, cutoffDayKey)
  pruneGroupedDayBuckets(accountStore.latencyDailyByToken, cutoffDayKey)
  pruneGroupedDayBucketsByName(
    accountStore.latencyDailyByTokenByModel,
    cutoffDayKey,
  )

  // Drop token labels that no longer have any retained aggregates.
  const retainedTokenIds = new Set([
    ...Object.keys(accountStore.dailyByToken),
    ...Object.keys(accountStore.hourlyByToken),
    ...Object.keys(accountStore.dailyByTokenByModel),
    ...Object.keys(accountStore.latencyDailyByToken),
    ...Object.keys(accountStore.latencyDailyByTokenByModel),
  ])
  for (const tokenId of Object.keys(accountStore.tokenNamesById)) {
    if (!retainedTokenIds.has(tokenId)) {
      delete accountStore.tokenNamesById[tokenId]
    }
  }
}

/**
 * Ingest Consume log items into a per-account store with cursor boundary dedupe.
 *
 * This function mutates `accountStore` by updating aggregates and returns an
 * updated cursor candidate for the current sync run.
 */
export function ingestConsumeLogItems(params: {
  accountStore: UsageHistoryAccountStore
  items: LogItem[]
  /**
   * Cursor snapshot from the start of the sync run. Used only for boundary dedupe.
   */
  startCursor: UsageHistoryCursor
  /**
   * Current cursor candidate for this sync run (updated as items are ingested).
   */
  cursorCandidate: UsageHistoryCursor
  timeZone?: string
}): { cursorCandidate: UsageHistoryCursor; ingestedCount: number } {
  const { accountStore, items, startCursor, timeZone } = params
  let cursorCandidate = params.cursorCandidate

  let ingestedCount = 0
  const boundary = new Set(
    startCursor.fingerprintsAtLastSeenCreatedAt.map(
      normalizeBoundaryFingerprint,
    ),
  )
  let candidateFingerprints = new Set(
    cursorCandidate.fingerprintsAtLastSeenCreatedAt,
  )
  const pendingCharges = new Map<
    UsageHistoryAggregate,
    FinancialConsumptionFact[]
  >()
  const addLogDelta: typeof addToAggregate = (target, delta) => {
    addAggregateCounters(target, delta)
    if (!delta.consumption?.length) return

    let charges = pendingCharges.get(target)
    if (!charges) {
      charges = []
      pendingCharges.set(target, charges)
    }
    charges.push(...delta.consumption)
  }

  for (const item of items) {
    if (item.type !== LogType.Consume) {
      continue
    }

    const fingerprint = fingerprintLogItem(item)

    if (
      item.created_at === startCursor.lastSeenCreatedAt &&
      (boundary.has(fingerprint) ||
        (item.consumption &&
          boundary.has(
            fingerprintLogItem({ ...item, consumption: undefined }),
          )))
    ) {
      continue
    }

    const dayKey = getDayKeyFromUnixSeconds(item.created_at, timeZone)
    const hourKey = getHourKeyFromUnixSeconds(item.created_at, timeZone)
    ingestConsumeItemToAccountStore(
      accountStore,
      item,
      dayKey,
      hourKey,
      addLogDelta,
    )
    ingestedCount += 1

    if (item.created_at > cursorCandidate.lastSeenCreatedAt) {
      cursorCandidate = {
        lastSeenCreatedAt: item.created_at,
        fingerprintsAtLastSeenCreatedAt: [fingerprint],
      }
      candidateFingerprints = new Set([fingerprint])
      continue
    }

    if (
      item.created_at === cursorCandidate.lastSeenCreatedAt &&
      !candidateFingerprints.has(fingerprint)
    ) {
      candidateFingerprints.add(fingerprint)
      cursorCandidate.fingerprintsAtLastSeenCreatedAt.push(fingerprint)
    }
  }

  for (const [aggregate, charges] of pendingCharges) {
    aggregate.consumption = mergeRecordedConsumption(
      aggregate.consumption ?? [],
      charges,
    )
  }

  // Keep the complete boundary for deduplication; a newer timestamp replaces it.
  return { cursorCandidate, ingestedCount }
}
