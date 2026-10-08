import {
  createEmptyUsageHistoryAggregate,
  createEmptyUsageHistoryLatencyAggregate,
} from "~/services/history/usageHistory/core"
import type {
  UsageHistoryAggregate,
  UsageHistoryExport,
  UsageHistoryLatencyAggregate,
} from "~/types/usageHistory"

type UsageAnalyticsTokenSelection = string[]

interface UsageAnalyticsModelTotalsRow {
  modelName: string
  totalTokens: number
  quotaConsumed: number
}

interface UsageAnalyticsSlowTotalsRow {
  key: string
  label: string
  slowCount: number
  totalCount: number
}

interface UsageAnalyticsAccountTotalsRow {
  accountId: string
  accountLabel: string
  totalTokens: number
  requests: number
  quotaConsumed: number
}

/**
 * Merge numeric usage aggregates in-place.
 *
 * This intentionally mirrors the aggregation semantics in `~/services/history/usageHistory/analytics`
 * but is kept local to the UI layer to avoid coupling chart helpers to the export builder.
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
 * Return an aggregate bucket for `key`, creating it when missing.
 */
function getOrCreateAggregate(
  map: Record<string, UsageHistoryAggregate>,
  key: string,
): UsageHistoryAggregate {
  const existing = map[key]
  if (existing) return existing
  const created = createEmptyUsageHistoryAggregate()
  map[key] = created
  return created
}

/**
 * Merge bounded latency aggregates in-place, padding histogram buckets for forward-compatibility.
 *
 * The usage-history schema may grow additional latency buckets over time; UI aggregation should
 * keep working even when it encounters longer bucket arrays from newer data.
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
 * Return a latency aggregate bucket for `key`, creating it when missing.
 */
function getOrCreateLatencyAggregate(
  map: Record<string, UsageHistoryLatencyAggregate>,
  key: string,
): UsageHistoryLatencyAggregate {
  const existing = map[key]
  if (existing) return existing
  const created = createEmptyUsageHistoryLatencyAggregate()
  map[key] = created
  return created
}

/**
 * Stable Top-N selection with an optional `Other` bucket.
 */
export function topNWithOther<T extends { key: string; value: number }>(
  items: T[],
  n: number,
  otherLabel = "Other",
): Array<T | { key: string; value: number }> {
  const safeN = Math.max(0, Math.trunc(n))
  const sorted = [...items].sort((a, b) => {
    const delta = b.value - a.value
    if (delta !== 0) return delta
    return a.key.localeCompare(b.key)
  })

  const top = sorted.slice(0, safeN)
  const rest = sorted.slice(safeN)
  const otherValue = rest.reduce((sum, item) => sum + item.value, 0)

  if (otherValue > 0) {
    return [...top, { key: otherLabel, value: otherValue }]
  }

  return top
}

/**
 * Resolve fused daily aggregates, optionally filtered to a set of token ids.
 *
 * Notes:
 * - An empty `tokenIds` list means "no filter" (i.e. use all tokens / all accounts).
 * - Missing token ids are ignored.
 */
export function resolveFusedDailyForTokens(
  exportData: UsageHistoryExport,
  tokenIds: UsageAnalyticsTokenSelection,
): Record<string, UsageHistoryAggregate> {
  if (tokenIds.length === 0) {
    return exportData.fused.daily
  }

  const out: Record<string, UsageHistoryAggregate> = {}
  for (const tokenId of tokenIds) {
    const tokenDaily = exportData.fused.dailyByToken[tokenId]
    if (!tokenDaily) continue

    for (const [dayKey, aggregate] of Object.entries(tokenDaily)) {
      addToAggregate(getOrCreateAggregate(out, dayKey), aggregate)
    }
  }

  return out
}

/**
 * Resolve fused hourly aggregates, optionally filtered to a set of token ids.
 *
 * Notes:
 * - An empty `tokenIds` list means "no filter" (i.e. use all tokens / all accounts).
 * - Missing token ids are ignored.
 */
export function resolveFusedHourlyForTokens(
  exportData: UsageHistoryExport,
  tokenIds: UsageAnalyticsTokenSelection,
): Record<string, Record<string, UsageHistoryAggregate>> {
  if (tokenIds.length === 0) {
    return exportData.fused.hourly
  }

  const out: Record<string, Record<string, UsageHistoryAggregate>> = {}
  for (const tokenId of tokenIds) {
    const tokenHourlyByDay = exportData.fused.hourlyByToken[tokenId]
    if (!tokenHourlyByDay) continue

    for (const [dayKey, hourly] of Object.entries(tokenHourlyByDay)) {
      out[dayKey] ??= {}
      for (const [hourKey, aggregate] of Object.entries(hourly)) {
        addToAggregate(getOrCreateAggregate(out[dayKey], hourKey), aggregate)
      }
    }
  }

  return out
}

/**
 * Resolve per-model totals, optionally filtered to a set of token ids.
 *
 * When filtered, the output is derived from `exportData.fused.byTokenByModel` by summing
 * per-token model totals, rather than attempting to re-aggregate from the time series.
 */
function resolveFusedByModelForTokens(
  exportData: UsageHistoryExport,
  tokenIds: UsageAnalyticsTokenSelection,
): Record<string, UsageHistoryAggregate> {
  if (tokenIds.length === 0) {
    return exportData.fused.byModel
  }

  const out: Record<string, UsageHistoryAggregate> = {}
  for (const tokenId of tokenIds) {
    const tokenByModel = exportData.fused.byTokenByModel[tokenId]
    if (!tokenByModel) continue

    for (const [modelName, aggregate] of Object.entries(tokenByModel)) {
      addToAggregate(getOrCreateAggregate(out, modelName), aggregate)
    }
  }

  return out
}

/**
 * Resolve per-model daily aggregates, optionally filtered to a set of token ids.
 *
 * This is used for model-over-time views (heatmaps/trends) when token filters are active.
 */
export function resolveFusedDailyByModelForTokens(
  exportData: UsageHistoryExport,
  tokenIds: UsageAnalyticsTokenSelection,
): Record<string, Record<string, UsageHistoryAggregate>> {
  if (tokenIds.length === 0) {
    return exportData.fused.dailyByModel
  }

  const out: Record<string, Record<string, UsageHistoryAggregate>> = {}
  for (const tokenId of tokenIds) {
    const tokenDailyByModel = exportData.fused.dailyByTokenByModel[tokenId]
    if (!tokenDailyByModel) continue

    for (const [modelName, modelDaily] of Object.entries(tokenDailyByModel)) {
      out[modelName] ??= {}
      for (const [dayKey, aggregate] of Object.entries(modelDaily)) {
        addToAggregate(getOrCreateAggregate(out[modelName], dayKey), aggregate)
      }
    }
  }

  return out
}

/**
 * Resolve a merged latency aggregate for the current selection.
 *
 * Selection semantics:
 * - `modelName` set: return latency for that model (optionally filtered by `tokenIds`).
 * - `modelName` unset: return latency over the whole selection window, optionally filtered by `tokenIds`.
 */
export function resolveLatencyAggregateForSelection(params: {
  exportData: UsageHistoryExport
  tokenIds: UsageAnalyticsTokenSelection
  modelName?: string | null
}): UsageHistoryLatencyAggregate {
  const { exportData, tokenIds, modelName } = params

  if (modelName) {
    if (tokenIds.length === 0) {
      return (
        exportData.fused.latencyByModel[modelName] ??
        createEmptyUsageHistoryLatencyAggregate()
      )
    }

    const merged = createEmptyUsageHistoryLatencyAggregate()
    for (const tokenId of tokenIds) {
      const perToken = exportData.fused.latencyByTokenByModel[tokenId]
      const aggregate = perToken?.[modelName]
      if (!aggregate) continue
      addToLatencyAggregate(merged, aggregate)
    }
    return merged
  }

  if (tokenIds.length === 0) {
    const merged = createEmptyUsageHistoryLatencyAggregate()
    for (const aggregate of Object.values(exportData.fused.latencyDaily)) {
      addToLatencyAggregate(merged, aggregate)
    }
    return merged
  }

  const merged = createEmptyUsageHistoryLatencyAggregate()
  for (const tokenId of tokenIds) {
    const aggregate = exportData.fused.latencyByToken[tokenId]
    if (!aggregate) continue
    addToLatencyAggregate(merged, aggregate)
  }
  return merged
}

/**
 * Resolve daily latency aggregates, optionally filtered to a set of token ids.
 *
 * This is used for the latency trend view. Missing token ids are ignored.
 */
export function resolveLatencyDailyForTokens(
  exportData: UsageHistoryExport,
  tokenIds: UsageAnalyticsTokenSelection,
): Record<string, UsageHistoryLatencyAggregate> {
  if (tokenIds.length === 0) {
    return exportData.fused.latencyDaily
  }

  const out: Record<string, UsageHistoryLatencyAggregate> = {}
  for (const tokenId of tokenIds) {
    const tokenDaily = exportData.fused.latencyDailyByToken[tokenId]
    if (!tokenDaily) continue
    for (const [dayKey, aggregate] of Object.entries(tokenDaily)) {
      addToLatencyAggregate(getOrCreateLatencyAggregate(out, dayKey), aggregate)
    }
  }

  return out
}

/**
 * Build model totals rows for tables/charts, adding an `Other` bucket when applicable.
 *
 * Sorting is deterministic: by `totalTokens` descending, then `modelName` ascending.
 */
export function getModelTotalsRows(params: {
  exportData: UsageHistoryExport
  tokenIds: UsageAnalyticsTokenSelection
  topN: number
  otherLabel?: string
}): UsageAnalyticsModelTotalsRow[] {
  const { exportData, tokenIds, topN, otherLabel = "Other" } = params
  const byModel = resolveFusedByModelForTokens(exportData, tokenIds)

  const rows = Object.entries(byModel).map(([modelName, aggregate]) => ({
    modelName,
    totalTokens: aggregate.totalTokens,
    quotaConsumed: aggregate.quotaConsumed,
  }))

  rows.sort((a, b) => {
    const delta = b.totalTokens - a.totalTokens
    if (delta !== 0) return delta
    return a.modelName.localeCompare(b.modelName)
  })

  const safeTopN = Math.max(0, Math.trunc(topN))
  const top = rows.slice(0, safeTopN)
  const rest = rows.slice(safeTopN)

  const otherTokens = rest.reduce((sum, row) => sum + row.totalTokens, 0)
  const otherQuota = rest.reduce((sum, row) => sum + row.quotaConsumed, 0)

  if (otherTokens > 0) {
    return [
      ...top,
      {
        modelName: otherLabel,
        totalTokens: otherTokens,
        quotaConsumed: otherQuota,
      },
    ]
  }

  return top
}

/**
 * Build slow-by-model rows from latency aggregates, adding an `Other` bucket when applicable.
 *
 * When `tokenIds` is non-empty, only models seen in the selected tokens contribute.
 */
export function getSlowModelRows(params: {
  exportData: UsageHistoryExport
  tokenIds: UsageAnalyticsTokenSelection
  topN: number
  otherLabel?: string
}): UsageAnalyticsSlowTotalsRow[] {
  const { exportData, tokenIds, topN, otherLabel = "Other" } = params

  const slowByModel: Record<string, { slow: number; total: number }> = {}

  if (tokenIds.length === 0) {
    for (const [modelName, aggregate] of Object.entries(
      exportData.fused.latencyByModel,
    )) {
      slowByModel[modelName] = {
        slow: aggregate.slowCount,
        total: aggregate.count,
      }
    }
  } else {
    for (const tokenId of tokenIds) {
      const perToken = exportData.fused.latencyByTokenByModel[tokenId]
      if (!perToken) continue
      for (const [modelName, aggregate] of Object.entries(perToken)) {
        const existing = slowByModel[modelName] ?? { slow: 0, total: 0 }
        existing.slow += aggregate.slowCount
        existing.total += aggregate.count
        slowByModel[modelName] = existing
      }
    }
  }

  const items = Object.entries(slowByModel).map(([modelName, value]) => ({
    key: modelName,
    value: value.slow,
  }))

  return topNWithOther(items, topN, otherLabel).map((item) => ({
    key: item.key,
    label: item.key,
    slowCount: item.value,
    totalCount: slowByModel[item.key]?.total ?? 0,
  }))
}

/**
 * Build slow-by-token rows from latency aggregates, adding `Other` and handling unknown tokens.
 *
 * When `tokenIds` is non-empty, only those tokens contribute (missing tokens are ignored).
 */
export function getSlowTokenRows(params: {
  exportData: UsageHistoryExport
  tokenIds: UsageAnalyticsTokenSelection
  topN: number
  otherLabel?: string
  unknownLabel?: string
}): UsageAnalyticsSlowTotalsRow[] {
  const {
    exportData,
    tokenIds,
    topN,
    otherLabel = "Other",
    unknownLabel = "Unknown token",
  } = params

  const tokenNamesById = exportData.fused.tokenNamesById
  const source: Record<string, UsageHistoryLatencyAggregate | undefined> =
    tokenIds.length === 0
      ? exportData.fused.latencyByToken
      : (Object.fromEntries(
          tokenIds
            .map((tokenId) => [
              tokenId,
              exportData.fused.latencyByToken[tokenId],
            ])
            .filter(([, value]) => Boolean(value)),
        ) as Record<string, UsageHistoryLatencyAggregate>)

  const slowByToken: Record<string, { slow: number; total: number }> = {}
  for (const [tokenId, aggregate] of Object.entries(source)) {
    if (!aggregate) continue
    slowByToken[tokenId] = { slow: aggregate.slowCount, total: aggregate.count }
  }

  const items = Object.entries(slowByToken).map(([tokenId, value]) => ({
    key: tokenId,
    value: value.slow,
  }))

  return topNWithOther(items, topN, otherLabel).map((item) => {
    const tokenId = item.key
    const tokenName = tokenNamesById[tokenId]
    const label =
      tokenId === otherLabel
        ? otherLabel
        : tokenId === "unknown"
          ? unknownLabel
          : tokenName
            ? `${tokenName} (#${tokenId})`
            : `#${tokenId}`

    return {
      key: tokenId,
      label,
      slowCount: item.value,
      totalCount: slowByToken[tokenId]?.total ?? 0,
    }
  })
}

/**
 * Build per-account totals rows, optionally filtered to a set of token ids.
 *
 * Sorting is deterministic: by `totalTokens` descending, then `accountLabel` ascending.
 */
export function getAccountTotalsRows(params: {
  exportData: UsageHistoryExport
  tokenIds: UsageAnalyticsTokenSelection
  accountLabels: Record<string, string>
}): UsageAnalyticsAccountTotalsRow[] {
  const { exportData, tokenIds, accountLabels } = params

  const rows: UsageAnalyticsAccountTotalsRow[] = []

  for (const accountId of exportData.selection.accountIds) {
    const accountData = exportData.accounts[accountId]
    if (!accountData) continue

    const totals = createEmptyUsageHistoryAggregate()

    if (tokenIds.length === 0) {
      for (const aggregate of Object.values(accountData.daily)) {
        addToAggregate(totals, aggregate)
      }
    } else {
      for (const tokenId of tokenIds) {
        const tokenDaily = accountData.dailyByToken[tokenId]
        if (!tokenDaily) continue
        for (const aggregate of Object.values(tokenDaily)) {
          addToAggregate(totals, aggregate)
        }
      }
    }

    rows.push({
      accountId,
      accountLabel: accountLabels[accountId] ?? accountId,
      totalTokens: totals.totalTokens,
      requests: totals.requests,
      quotaConsumed: totals.quotaConsumed,
    })
  }

  rows.sort((a, b) => {
    const delta = b.totalTokens - a.totalTokens
    if (delta !== 0) return delta
    return a.accountLabel.localeCompare(b.accountLabel)
  })

  return rows
}

/** Projects one token selection consistently for all usage summaries and charts. */
export function resolveUsageSelection(input: {
  exportData: UsageHistoryExport | null
  tokenIds: string[]
  accountLabels: Record<string, string>
  otherLabel: string
  unknownLabel: string
}) {
  const { exportData, tokenIds, accountLabels, otherLabel, unknownLabel } =
    input
  return {
    fusedDailyForTokens: exportData
      ? resolveFusedDailyForTokens(exportData, tokenIds)
      : {},
    fusedHourlyForTokens: exportData
      ? resolveFusedHourlyForTokens(exportData, tokenIds)
      : {},
    fusedDailyByModelForTokens: exportData
      ? resolveFusedDailyByModelForTokens(exportData, tokenIds)
      : {},
    modelTotalsRows: exportData
      ? getModelTotalsRows({ exportData, tokenIds, topN: 12, otherLabel })
      : [],
    accountTotalsFullRows: exportData
      ? getAccountTotalsRows({ exportData, tokenIds, accountLabels })
      : [],
    slowModelRows: exportData
      ? getSlowModelRows({ exportData, tokenIds, topN: 12, otherLabel })
      : [],
    slowTokenRows: exportData
      ? getSlowTokenRows({
          exportData,
          tokenIds,
          topN: 12,
          otherLabel,
          unknownLabel,
        })
      : [],
    latencyDailyForTokens: exportData
      ? resolveLatencyDailyForTokens(exportData, tokenIds)
      : {},
  }
}
