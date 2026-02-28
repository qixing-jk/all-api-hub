import type {
  UsageHistoryAggregate,
  UsageHistoryExport,
  UsageHistoryExportSelection,
  UsageHistoryLatencyAggregate,
  UsageHistoryStore,
} from "~/types/usageHistory"
import { USAGE_HISTORY_EXPORT_SCHEMA_VERSION } from "~/types/usageHistory"

import {
  createEmptyUsageHistoryAggregate,
  createEmptyUsageHistoryLatencyAggregate,
  parseDayKey,
} from "./core"

/**
 * Validate whether a string is a `YYYY-MM-DD` day key.
 */
function isDayKey(value: string): boolean {
  return Boolean(parseDayKey(value))
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
 * Merge bounded latency aggregates in-place.
 */
function addToLatencyAggregate(
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
function getOrCreateAggregate(
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
function getOrCreateLatencyAggregate(
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
 * Filter daily aggregates to an inclusive day range.
 */
function pickDailyInRange(
  daily: UsageHistoryStore["accounts"][string]["daily"],
  startDay: string,
  endDay: string,
): UsageHistoryStore["accounts"][string]["daily"] {
  const filtered: UsageHistoryStore["accounts"][string]["daily"] = {}

  for (const [dayKey, aggregate] of Object.entries(daily)) {
    if (dayKey < startDay || dayKey > endDay) {
      continue
    }
    filtered[dayKey] = aggregate
  }

  return filtered
}

/**
 * Filter hourly aggregates to an inclusive day range.
 */
function pickHourlyInRange(
  hourly: UsageHistoryStore["accounts"][string]["hourly"],
  startDay: string,
  endDay: string,
): UsageHistoryStore["accounts"][string]["hourly"] {
  const filtered: UsageHistoryStore["accounts"][string]["hourly"] = {}

  for (const [dayKey, hourlyByDay] of Object.entries(hourly)) {
    if (dayKey < startDay || dayKey > endDay) {
      continue
    }
    filtered[dayKey] = hourlyByDay
  }

  return filtered
}

/**
 * Filter per-model daily aggregates to an inclusive day range.
 */
function pickDailyByModelInRange(
  dailyByModel: UsageHistoryStore["accounts"][string]["dailyByModel"],
  startDay: string,
  endDay: string,
): UsageHistoryStore["accounts"][string]["dailyByModel"] {
  const filtered: UsageHistoryStore["accounts"][string]["dailyByModel"] = {}

  for (const [modelName, modelDaily] of Object.entries(dailyByModel)) {
    const picked: Record<string, UsageHistoryAggregate> = {}
    for (const [dayKey, aggregate] of Object.entries(modelDaily)) {
      if (dayKey < startDay || dayKey > endDay) {
        continue
      }
      picked[dayKey] = aggregate
    }

    if (Object.keys(picked).length > 0) {
      filtered[modelName] = picked
    }
  }

  return filtered
}

/**
 * Filter per-token daily aggregates to an inclusive day range.
 */
function pickDailyByTokenInRange(
  dailyByToken: UsageHistoryStore["accounts"][string]["dailyByToken"],
  startDay: string,
  endDay: string,
): UsageHistoryStore["accounts"][string]["dailyByToken"] {
  const filtered: UsageHistoryStore["accounts"][string]["dailyByToken"] = {}

  for (const [tokenId, tokenDaily] of Object.entries(dailyByToken)) {
    const picked: Record<string, UsageHistoryAggregate> = {}
    for (const [dayKey, aggregate] of Object.entries(tokenDaily)) {
      if (dayKey < startDay || dayKey > endDay) {
        continue
      }
      picked[dayKey] = aggregate
    }

    if (Object.keys(picked).length > 0) {
      filtered[tokenId] = picked
    }
  }

  return filtered
}

/**
 * Filter per-token hourly aggregates to an inclusive day range.
 */
function pickHourlyByTokenInRange(
  hourlyByToken: UsageHistoryStore["accounts"][string]["hourlyByToken"],
  startDay: string,
  endDay: string,
): UsageHistoryStore["accounts"][string]["hourlyByToken"] {
  const filtered: UsageHistoryStore["accounts"][string]["hourlyByToken"] = {}

  for (const [tokenId, perToken] of Object.entries(hourlyByToken)) {
    const tokenPicked: Record<
      string,
      Record<string, UsageHistoryAggregate>
    > = {}

    for (const [dayKey, hourly] of Object.entries(perToken)) {
      if (dayKey < startDay || dayKey > endDay) {
        continue
      }
      tokenPicked[dayKey] = hourly
    }

    if (Object.keys(tokenPicked).length > 0) {
      filtered[tokenId] = tokenPicked
    }
  }

  return filtered
}

/**
 * Filter per-token per-model daily aggregates to an inclusive day range.
 */
function pickDailyByTokenByModelInRange(
  dailyByTokenByModel: UsageHistoryStore["accounts"][string]["dailyByTokenByModel"],
  startDay: string,
  endDay: string,
): UsageHistoryStore["accounts"][string]["dailyByTokenByModel"] {
  const filtered: UsageHistoryStore["accounts"][string]["dailyByTokenByModel"] =
    {}

  for (const [tokenId, perToken] of Object.entries(dailyByTokenByModel)) {
    const tokenPicked: Record<
      string,
      Record<string, UsageHistoryAggregate>
    > = {}

    for (const [modelName, modelDaily] of Object.entries(perToken)) {
      const picked: Record<string, UsageHistoryAggregate> = {}
      for (const [dayKey, aggregate] of Object.entries(modelDaily)) {
        if (dayKey < startDay || dayKey > endDay) {
          continue
        }
        picked[dayKey] = aggregate
      }

      if (Object.keys(picked).length > 0) {
        tokenPicked[modelName] = picked
      }
    }

    if (Object.keys(tokenPicked).length > 0) {
      filtered[tokenId] = tokenPicked
    }
  }

  return filtered
}

/**
 * Filter latency aggregates to an inclusive day range.
 */
function pickLatencyDailyInRange(
  daily: UsageHistoryStore["accounts"][string]["latencyDaily"],
  startDay: string,
  endDay: string,
): UsageHistoryStore["accounts"][string]["latencyDaily"] {
  const filtered: UsageHistoryStore["accounts"][string]["latencyDaily"] = {}

  for (const [dayKey, aggregate] of Object.entries(daily)) {
    if (dayKey < startDay || dayKey > endDay) {
      continue
    }
    filtered[dayKey] = aggregate
  }

  return filtered
}

/**
 * Filter per-model latency aggregates to an inclusive day range.
 */
function pickLatencyDailyByModelInRange(
  dailyByModel: UsageHistoryStore["accounts"][string]["latencyDailyByModel"],
  startDay: string,
  endDay: string,
): UsageHistoryStore["accounts"][string]["latencyDailyByModel"] {
  const filtered: UsageHistoryStore["accounts"][string]["latencyDailyByModel"] =
    {}

  for (const [modelName, modelDaily] of Object.entries(dailyByModel)) {
    const picked: Record<string, UsageHistoryLatencyAggregate> = {}
    for (const [dayKey, aggregate] of Object.entries(modelDaily)) {
      if (dayKey < startDay || dayKey > endDay) {
        continue
      }
      picked[dayKey] = aggregate
    }

    if (Object.keys(picked).length > 0) {
      filtered[modelName] = picked
    }
  }

  return filtered
}

/**
 * Filter per-token latency aggregates to an inclusive day range.
 */
function pickLatencyDailyByTokenInRange(
  dailyByToken: UsageHistoryStore["accounts"][string]["latencyDailyByToken"],
  startDay: string,
  endDay: string,
): UsageHistoryStore["accounts"][string]["latencyDailyByToken"] {
  const filtered: UsageHistoryStore["accounts"][string]["latencyDailyByToken"] =
    {}

  for (const [tokenId, tokenDaily] of Object.entries(dailyByToken)) {
    const picked: Record<string, UsageHistoryLatencyAggregate> = {}
    for (const [dayKey, aggregate] of Object.entries(tokenDaily)) {
      if (dayKey < startDay || dayKey > endDay) {
        continue
      }
      picked[dayKey] = aggregate
    }

    if (Object.keys(picked).length > 0) {
      filtered[tokenId] = picked
    }
  }

  return filtered
}

/**
 * Filter per-token per-model latency aggregates to an inclusive day range.
 */
function pickLatencyDailyByTokenByModelInRange(
  dailyByTokenByModel: UsageHistoryStore["accounts"][string]["latencyDailyByTokenByModel"],
  startDay: string,
  endDay: string,
): UsageHistoryStore["accounts"][string]["latencyDailyByTokenByModel"] {
  const filtered: UsageHistoryStore["accounts"][string]["latencyDailyByTokenByModel"] =
    {}

  for (const [tokenId, perToken] of Object.entries(dailyByTokenByModel)) {
    const tokenPicked: Record<
      string,
      Record<string, UsageHistoryLatencyAggregate>
    > = {}

    for (const [modelName, modelDaily] of Object.entries(perToken)) {
      const picked: Record<string, UsageHistoryLatencyAggregate> = {}
      for (const [dayKey, aggregate] of Object.entries(modelDaily)) {
        if (dayKey < startDay || dayKey > endDay) {
          continue
        }
        picked[dayKey] = aggregate
      }

      if (Object.keys(picked).length > 0) {
        tokenPicked[modelName] = picked
      }
    }

    if (Object.keys(tokenPicked).length > 0) {
      filtered[tokenId] = tokenPicked
    }
  }

  return filtered
}

/**
 * Build an export payload for the current selection (accounts + date range),
 * including both per-account data and fused totals.
 */
export function computeUsageHistoryExport(params: {
  store: UsageHistoryStore
  selection: UsageHistoryExportSelection
}): UsageHistoryExport {
  const { store, selection } = params
  const { accountIds, startDay, endDay } = selection

  if (!isDayKey(startDay) || !isDayKey(endDay) || startDay > endDay) {
    throw new Error("Invalid export day range")
  }

  const allAccountIds = Object.keys(store.accounts)
  const resolvedAccountIds =
    Array.isArray(accountIds) && accountIds.length > 0
      ? accountIds
      : allAccountIds

  const accounts: UsageHistoryExport["accounts"] = {}
  const fusedDaily: Record<string, UsageHistoryAggregate> = {}
  const fusedHourly: Record<string, Record<string, UsageHistoryAggregate>> = {}
  const fusedDailyByModel: Record<
    string,
    Record<string, UsageHistoryAggregate>
  > = {}
  const fusedByModel: Record<string, UsageHistoryAggregate> = {}
  const fusedTokenNamesById: Record<string, string> = {}
  const fusedDailyByToken: Record<
    string,
    Record<string, UsageHistoryAggregate>
  > = {}
  const fusedHourlyByToken: Record<
    string,
    Record<string, Record<string, UsageHistoryAggregate>>
  > = {}
  const fusedDailyByTokenByModel: Record<
    string,
    Record<string, Record<string, UsageHistoryAggregate>>
  > = {}
  const fusedByToken: Record<string, UsageHistoryAggregate> = {}
  const fusedByTokenByModel: Record<
    string,
    Record<string, UsageHistoryAggregate>
  > = {}
  const fusedLatencyDaily: Record<string, UsageHistoryLatencyAggregate> = {}
  const fusedLatencyDailyByToken: Record<
    string,
    Record<string, UsageHistoryLatencyAggregate>
  > = {}
  const fusedLatencyByModel: Record<string, UsageHistoryLatencyAggregate> = {}
  const fusedLatencyByToken: Record<string, UsageHistoryLatencyAggregate> = {}
  const fusedLatencyByTokenByModel: Record<
    string,
    Record<string, UsageHistoryLatencyAggregate>
  > = {}

  for (const accountId of resolvedAccountIds) {
    const accountStore = store.accounts[accountId]
    if (!accountStore) {
      continue
    }

    const daily = pickDailyInRange(accountStore.daily, startDay, endDay)
    const hourly = pickHourlyInRange(accountStore.hourly, startDay, endDay)
    const dailyByModel = pickDailyByModelInRange(
      accountStore.dailyByModel,
      startDay,
      endDay,
    )
    const dailyByToken = pickDailyByTokenInRange(
      accountStore.dailyByToken,
      startDay,
      endDay,
    )
    const hourlyByToken = pickHourlyByTokenInRange(
      accountStore.hourlyByToken,
      startDay,
      endDay,
    )
    const dailyByTokenByModel = pickDailyByTokenByModelInRange(
      accountStore.dailyByTokenByModel,
      startDay,
      endDay,
    )
    const latencyDaily = pickLatencyDailyInRange(
      accountStore.latencyDaily,
      startDay,
      endDay,
    )
    const latencyDailyByModel = pickLatencyDailyByModelInRange(
      accountStore.latencyDailyByModel,
      startDay,
      endDay,
    )
    const latencyDailyByToken = pickLatencyDailyByTokenInRange(
      accountStore.latencyDailyByToken,
      startDay,
      endDay,
    )
    const latencyDailyByTokenByModel = pickLatencyDailyByTokenByModelInRange(
      accountStore.latencyDailyByTokenByModel,
      startDay,
      endDay,
    )

    accounts[accountId] = {
      daily,
      hourly,
      dailyByModel,
      tokenNamesById: accountStore.tokenNamesById,
      dailyByToken,
      hourlyByToken,
      dailyByTokenByModel,
      latencyDaily,
      latencyDailyByModel,
      latencyDailyByToken,
      latencyDailyByTokenByModel,
    }

    for (const [dayKey, aggregate] of Object.entries(daily)) {
      addToAggregate(getOrCreateAggregate(fusedDaily, dayKey), aggregate)
    }

    for (const [dayKey, hourlyByDay] of Object.entries(hourly)) {
      fusedHourly[dayKey] ??= {}
      for (const [hourKey, aggregate] of Object.entries(hourlyByDay)) {
        addToAggregate(
          getOrCreateAggregate(fusedHourly[dayKey], hourKey),
          aggregate,
        )
      }
    }

    for (const [modelName, modelDaily] of Object.entries(dailyByModel)) {
      fusedDailyByModel[modelName] ??= {}
      for (const [dayKey, aggregate] of Object.entries(modelDaily)) {
        addToAggregate(
          getOrCreateAggregate(fusedDailyByModel[modelName], dayKey),
          aggregate,
        )
        addToAggregate(getOrCreateAggregate(fusedByModel, modelName), aggregate)
      }
    }

    for (const [tokenId, tokenName] of Object.entries(
      accountStore.tokenNamesById,
    )) {
      if (!fusedTokenNamesById[tokenId] && tokenName) {
        fusedTokenNamesById[tokenId] = tokenName
      }
    }

    for (const [tokenId, tokenDaily] of Object.entries(dailyByToken)) {
      fusedDailyByToken[tokenId] ??= {}
      for (const [dayKey, aggregate] of Object.entries(tokenDaily)) {
        addToAggregate(
          getOrCreateAggregate(fusedDailyByToken[tokenId], dayKey),
          aggregate,
        )
        addToAggregate(getOrCreateAggregate(fusedByToken, tokenId), aggregate)
      }
    }

    for (const [tokenId, perToken] of Object.entries(hourlyByToken)) {
      fusedHourlyByToken[tokenId] ??= {}
      for (const [dayKey, hourlyByDay] of Object.entries(perToken)) {
        fusedHourlyByToken[tokenId][dayKey] ??= {}
        for (const [hourKey, aggregate] of Object.entries(hourlyByDay)) {
          addToAggregate(
            getOrCreateAggregate(fusedHourlyByToken[tokenId][dayKey], hourKey),
            aggregate,
          )
        }
      }
    }

    for (const [tokenId, perToken] of Object.entries(dailyByTokenByModel)) {
      fusedDailyByTokenByModel[tokenId] ??= {}
      fusedByTokenByModel[tokenId] ??= {}

      for (const [modelName, modelDaily] of Object.entries(perToken)) {
        fusedDailyByTokenByModel[tokenId][modelName] ??= {}
        for (const [dayKey, aggregate] of Object.entries(modelDaily)) {
          addToAggregate(
            getOrCreateAggregate(
              fusedDailyByTokenByModel[tokenId][modelName],
              dayKey,
            ),
            aggregate,
          )

          fusedByTokenByModel[tokenId][modelName] ??=
            createEmptyUsageHistoryAggregate()
          addToAggregate(fusedByTokenByModel[tokenId][modelName], aggregate)
        }
      }
    }

    for (const [dayKey, aggregate] of Object.entries(latencyDaily)) {
      addToLatencyAggregate(
        getOrCreateLatencyAggregate(fusedLatencyDaily, dayKey),
        aggregate,
      )
    }

    for (const [modelName, modelDaily] of Object.entries(latencyDailyByModel)) {
      for (const aggregate of Object.values(modelDaily)) {
        addToLatencyAggregate(
          getOrCreateLatencyAggregate(fusedLatencyByModel, modelName),
          aggregate,
        )
      }
    }

    for (const [tokenId, tokenDaily] of Object.entries(latencyDailyByToken)) {
      fusedLatencyDailyByToken[tokenId] ??= {}
      for (const [dayKey, aggregate] of Object.entries(tokenDaily)) {
        addToLatencyAggregate(
          getOrCreateLatencyAggregate(
            fusedLatencyDailyByToken[tokenId],
            dayKey,
          ),
          aggregate,
        )
        addToLatencyAggregate(
          getOrCreateLatencyAggregate(fusedLatencyByToken, tokenId),
          aggregate,
        )
      }
    }

    for (const [tokenId, perToken] of Object.entries(
      latencyDailyByTokenByModel,
    )) {
      fusedLatencyByTokenByModel[tokenId] ??= {}
      for (const [modelName, modelDaily] of Object.entries(perToken)) {
        for (const aggregate of Object.values(modelDaily)) {
          fusedLatencyByTokenByModel[tokenId][modelName] ??=
            createEmptyUsageHistoryLatencyAggregate()
          addToLatencyAggregate(
            fusedLatencyByTokenByModel[tokenId][modelName],
            aggregate,
          )
        }
      }
    }
  }

  return {
    schemaVersion: USAGE_HISTORY_EXPORT_SCHEMA_VERSION,
    createdAt: Date.now(),
    selection: {
      accountIds: resolvedAccountIds,
      startDay,
      endDay,
    },
    accounts,
    fused: {
      daily: fusedDaily,
      dailyByModel: fusedDailyByModel,
      hourly: fusedHourly,
      byModel: fusedByModel,
      tokenNamesById: fusedTokenNamesById,
      dailyByToken: fusedDailyByToken,
      hourlyByToken: fusedHourlyByToken,
      dailyByTokenByModel: fusedDailyByTokenByModel,
      byToken: fusedByToken,
      byTokenByModel: fusedByTokenByModel,
      latencyDaily: fusedLatencyDaily,
      latencyDailyByToken: fusedLatencyDailyByToken,
      latencyByModel: fusedLatencyByModel,
      latencyByToken: fusedLatencyByToken,
      latencyByTokenByModel: fusedLatencyByTokenByModel,
    },
  }
}
