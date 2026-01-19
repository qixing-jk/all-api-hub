import { LogType, type LogItem } from "~/services/apiService/common/type"
import type {
  UsageHistoryAccountStore,
  UsageHistoryAggregate,
  UsageHistoryCursor,
  UsageHistoryLatencyAggregate,
} from "~/types/usageHistory"

import { USAGE_HISTORY_LIMITS } from "./constants"

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
 * Pad a numeric value to 2 digits using leading zeros.
 */
function pad2(value: number): string {
  return String(value).padStart(2, "0")
}

/**
 * Format a Date into a day bucket (`YYYY-MM-DD`) using UTC fields.
 *
 * This is used for day-key arithmetic and display; bucket assignment itself can be local.
 */
export function formatDayKeyUtc(date: Date): string {
  return `${date.getUTCFullYear()}-${pad2(date.getUTCMonth() + 1)}-${pad2(date.getUTCDate())}`
}

/**
 * Parse a `YYYY-MM-DD` day key into date parts.
 */
export function parseDayKey(dayKey: string): {
  year: number
  month: number
  day: number
} | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dayKey)
  if (!match) {
    return null
  }

  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])

  if (
    !Number.isFinite(year) ||
    !Number.isFinite(month) ||
    !Number.isFinite(day) ||
    month < 1 ||
    month > 12 ||
    day < 1 ||
    day > 31
  ) {
    return null
  }

  return { year, month, day }
}

/**
 * Subtract N calendar days from a `YYYY-MM-DD` day key and return the new day key.
 */
export function subtractDaysFromDayKey(dayKey: string, days: number): string {
  const parsed = parseDayKey(dayKey)
  if (!parsed) {
    throw new Error(`Invalid dayKey: ${dayKey}`)
  }

  const safeDays = Number.isFinite(days) ? Math.trunc(days) : 0
  const date = new Date(Date.UTC(parsed.year, parsed.month - 1, parsed.day))
  date.setUTCDate(date.getUTCDate() - safeDays)
  return formatDayKeyUtc(date)
}

/**
 * Convert unix seconds into a local day bucket (`YYYY-MM-DD`).
 *
 * When `timeZone` is omitted, the current environment's local timezone is used.
 */
export function getDayKeyFromUnixSeconds(
  unixSeconds: number,
  timeZone?: string,
): string {
  const date = new Date(unixSeconds * 1000)
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  })

  const parts = formatter.formatToParts(date)
  let year = ""
  let month = ""
  let day = ""

  for (const part of parts) {
    if (part.type === "year") year = part.value
    if (part.type === "month") month = part.value
    if (part.type === "day") day = part.value
  }

  const dayKey = `${year}-${month}-${day}`
  if (!parseDayKey(dayKey)) {
    throw new Error(`Failed to format dayKey for unixSeconds=${unixSeconds}`)
  }

  return dayKey
}

/**
 * Convert unix seconds into a local hour bucket (`00`-`23`).
 *
 * When `timeZone` is omitted, the current environment's local timezone is used.
 */
export function getHourKeyFromUnixSeconds(
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
  const safeRetentionDays = Math.max(
    1,
    Number.isFinite(retentionDays) ? Math.trunc(retentionDays) : 1,
  )
  const todayKey = getDayKeyFromUnixSeconds(nowUnixSeconds, timeZone)
  return subtractDaysFromDayKey(todayKey, safeRetentionDays - 1)
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
    quotaConsumed: 0,
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
export function createEmptyUsageHistoryCursor(): UsageHistoryCursor {
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
      state: "never",
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
  >,
): string {
  return [
    "v3",
    item.created_at,
    item.type,
    item.model_name ?? "",
    item.quota ?? 0,
    item.prompt_tokens ?? 0,
    item.completion_tokens ?? 0,
    item.channel_id ?? 0,
    item.token_id ?? 0,
    Number(item.use_time) || 0,
  ].join("|")
}

/**
 * Merge numeric aggregates in-place.
 */
function addToAggregate(
  target: UsageHistoryAggregate,
  delta: UsageHistoryAggregate,
) {
  target.requests += delta.requests
  target.promptTokens += delta.promptTokens
  target.completionTokens += delta.completionTokens
  target.totalTokens += delta.totalTokens
  target.quotaConsumed += delta.quotaConsumed
}

/**
 * Return the aggregate bucket for a key, creating it when missing.
 */
function getOrCreateAggregate(
  map: Record<string, UsageHistoryAggregate>,
  dayKey: string,
): UsageHistoryAggregate {
  const existing = map[dayKey]
  if (existing) {
    return existing
  }
  const created = createEmptyUsageHistoryAggregate()
  map[dayKey] = created
  return created
}

/**
 * Return the latency aggregate bucket for a key, creating it when missing.
 */
function getOrCreateLatencyAggregate(
  map: Record<string, UsageHistoryLatencyAggregate>,
  dayKey: string,
): UsageHistoryLatencyAggregate {
  const existing = map[dayKey]
  if (existing) {
    return existing
  }
  const created = createEmptyUsageHistoryLatencyAggregate()
  map[dayKey] = created
  return created
}

/**
 * Resolve a stable token id for aggregation keys.
 */
function getTokenIdForLogItem(item: LogItem): string {
  const tokenId = Number(item.token_id)
  return Number.isFinite(tokenId) ? String(tokenId) : "unknown"
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
  for (
    let index = 0;
    index < USAGE_HISTORY_LATENCY_BUCKET_UPPER_BOUNDS_SECONDS.length;
    index += 1
  ) {
    if (seconds < USAGE_HISTORY_LATENCY_BUCKET_UPPER_BOUNDS_SECONDS[index]) {
      return index
    }
  }
  return USAGE_HISTORY_LATENCY_BUCKET_UPPER_BOUNDS_SECONDS.length
}

/**
 * Ingest a single Consume log item into usage + performance aggregates.
 */
function ingestConsumeItemToAccountStore(
  accountStore: UsageHistoryAccountStore,
  item: LogItem,
  dayKey: string,
  hourKey: string,
) {
  const promptTokens = Number(item.prompt_tokens) || 0
  const completionTokens = Number(item.completion_tokens) || 0
  const quotaConsumed = Number(item.quota) || 0

  const delta: UsageHistoryAggregate = {
    requests: 1,
    promptTokens,
    completionTokens,
    totalTokens: promptTokens + completionTokens,
    quotaConsumed,
  }

  addToAggregate(getOrCreateAggregate(accountStore.daily, dayKey), delta)
  accountStore.hourly[dayKey] ??= {}
  addToAggregate(
    getOrCreateAggregate(accountStore.hourly[dayKey], hourKey),
    delta,
  )

  const modelName = getModelNameForLogItem(item)
  accountStore.dailyByModel[modelName] ??= {}
  addToAggregate(
    getOrCreateAggregate(accountStore.dailyByModel[modelName], dayKey),
    delta,
  )

  const tokenId = getTokenIdForLogItem(item)
  const tokenName = String(item.token_name || "").trim()
  if (tokenName) {
    accountStore.tokenNamesById[tokenId] ??= tokenName
  }

  accountStore.dailyByToken[tokenId] ??= {}
  addToAggregate(
    getOrCreateAggregate(accountStore.dailyByToken[tokenId], dayKey),
    delta,
  )

  accountStore.hourlyByToken[tokenId] ??= {}
  accountStore.hourlyByToken[tokenId][dayKey] ??= {}
  addToAggregate(
    getOrCreateAggregate(accountStore.hourlyByToken[tokenId][dayKey], hourKey),
    delta,
  )

  accountStore.dailyByTokenByModel[tokenId] ??= {}
  accountStore.dailyByTokenByModel[tokenId][modelName] ??= {}
  addToAggregate(
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
 * Prune stored aggregates for one account, removing buckets strictly older than `cutoffDayKey`.
 */
export function pruneUsageHistoryAccountStore(
  accountStore: UsageHistoryAccountStore,
  cutoffDayKey: string,
) {
  for (const dayKey of Object.keys(accountStore.daily)) {
    if (dayKey < cutoffDayKey) {
      delete accountStore.daily[dayKey]
    }
  }

  for (const dayKey of Object.keys(accountStore.hourly)) {
    if (dayKey < cutoffDayKey) {
      delete accountStore.hourly[dayKey]
    }
  }

  for (const modelName of Object.keys(accountStore.dailyByModel)) {
    const perModel = accountStore.dailyByModel[modelName]
    for (const dayKey of Object.keys(perModel)) {
      if (dayKey < cutoffDayKey) {
        delete perModel[dayKey]
      }
    }

    if (Object.keys(perModel).length === 0) {
      delete accountStore.dailyByModel[modelName]
    }
  }

  for (const tokenId of Object.keys(accountStore.dailyByToken)) {
    const perToken = accountStore.dailyByToken[tokenId]
    for (const dayKey of Object.keys(perToken)) {
      if (dayKey < cutoffDayKey) {
        delete perToken[dayKey]
      }
    }

    if (Object.keys(perToken).length === 0) {
      delete accountStore.dailyByToken[tokenId]
    }
  }

  for (const tokenId of Object.keys(accountStore.hourlyByToken)) {
    const perToken = accountStore.hourlyByToken[tokenId]
    for (const dayKey of Object.keys(perToken)) {
      if (dayKey < cutoffDayKey) {
        delete perToken[dayKey]
      }
    }

    if (Object.keys(perToken).length === 0) {
      delete accountStore.hourlyByToken[tokenId]
    }
  }

  for (const tokenId of Object.keys(accountStore.dailyByTokenByModel)) {
    const perToken = accountStore.dailyByTokenByModel[tokenId]
    for (const modelName of Object.keys(perToken)) {
      const perModel = perToken[modelName]
      for (const dayKey of Object.keys(perModel)) {
        if (dayKey < cutoffDayKey) {
          delete perModel[dayKey]
        }
      }
      if (Object.keys(perModel).length === 0) {
        delete perToken[modelName]
      }
    }
    if (Object.keys(perToken).length === 0) {
      delete accountStore.dailyByTokenByModel[tokenId]
    }
  }

  for (const dayKey of Object.keys(accountStore.latencyDaily)) {
    if (dayKey < cutoffDayKey) {
      delete accountStore.latencyDaily[dayKey]
    }
  }

  for (const modelName of Object.keys(accountStore.latencyDailyByModel)) {
    const perModel = accountStore.latencyDailyByModel[modelName]
    for (const dayKey of Object.keys(perModel)) {
      if (dayKey < cutoffDayKey) {
        delete perModel[dayKey]
      }
    }
    if (Object.keys(perModel).length === 0) {
      delete accountStore.latencyDailyByModel[modelName]
    }
  }

  for (const tokenId of Object.keys(accountStore.latencyDailyByToken)) {
    const perToken = accountStore.latencyDailyByToken[tokenId]
    for (const dayKey of Object.keys(perToken)) {
      if (dayKey < cutoffDayKey) {
        delete perToken[dayKey]
      }
    }
    if (Object.keys(perToken).length === 0) {
      delete accountStore.latencyDailyByToken[tokenId]
    }
  }

  for (const tokenId of Object.keys(accountStore.latencyDailyByTokenByModel)) {
    const perToken = accountStore.latencyDailyByTokenByModel[tokenId]
    for (const modelName of Object.keys(perToken)) {
      const perModel = perToken[modelName]
      for (const dayKey of Object.keys(perModel)) {
        if (dayKey < cutoffDayKey) {
          delete perModel[dayKey]
        }
      }
      if (Object.keys(perModel).length === 0) {
        delete perToken[modelName]
      }
    }
    if (Object.keys(perToken).length === 0) {
      delete accountStore.latencyDailyByTokenByModel[tokenId]
    }
  }

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

  for (const item of items) {
    if (item.type !== LogType.Consume) {
      continue
    }

    const fingerprint = fingerprintLogItem(item)

    if (
      item.created_at === startCursor.lastSeenCreatedAt &&
      startCursor.fingerprintsAtLastSeenCreatedAt.includes(fingerprint)
    ) {
      continue
    }

    const dayKey = getDayKeyFromUnixSeconds(item.created_at, timeZone)
    const hourKey = getHourKeyFromUnixSeconds(item.created_at, timeZone)
    ingestConsumeItemToAccountStore(accountStore, item, dayKey, hourKey)
    ingestedCount += 1

    if (item.created_at > cursorCandidate.lastSeenCreatedAt) {
      cursorCandidate = {
        lastSeenCreatedAt: item.created_at,
        fingerprintsAtLastSeenCreatedAt: [fingerprint],
      }
      continue
    }

    if (item.created_at === cursorCandidate.lastSeenCreatedAt) {
      if (
        !cursorCandidate.fingerprintsAtLastSeenCreatedAt.includes(fingerprint)
      ) {
        cursorCandidate.fingerprintsAtLastSeenCreatedAt.push(fingerprint)
      }
    }
  }

  if (
    cursorCandidate.fingerprintsAtLastSeenCreatedAt.length >
    USAGE_HISTORY_LIMITS.maxFingerprints
  ) {
    cursorCandidate = {
      ...cursorCandidate,
      fingerprintsAtLastSeenCreatedAt:
        cursorCandidate.fingerprintsAtLastSeenCreatedAt.slice(
          -USAGE_HISTORY_LIMITS.maxFingerprints,
        ),
    }
  }

  return { cursorCandidate, ingestedCount }
}
