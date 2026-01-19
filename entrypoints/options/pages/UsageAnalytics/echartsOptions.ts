import type { EChartsOption } from "~/components/charts/echarts"
import {
  createEmptyUsageHistoryAggregate,
  createEmptyUsageHistoryLatencyAggregate,
  USAGE_HISTORY_LATENCY_BUCKET_UPPER_BOUNDS_SECONDS,
} from "~/services/usageHistory/core"
import type {
  UsageHistoryAggregate,
  UsageHistoryExport,
  UsageHistoryLatencyAggregate,
} from "~/types/usageHistory"

export type UsageAnalyticsTokenSelection = string[]

export interface UsageAnalyticsModelTotalsRow {
  modelName: string
  totalTokens: number
  quotaConsumed: number
}

export interface UsageAnalyticsTokenTotalsRow {
  tokenId: string
  tokenLabel: string
  totalTokens: number
}

export interface UsageAnalyticsSlowTotalsRow {
  key: string
  label: string
  slowCount: number
  totalCount: number
}

export interface UsageAnalyticsAccountTotalsRow {
  accountId: string
  accountLabel: string
  totalTokens: number
  requests: number
  quotaConsumed: number
}

/**
 * Create human-readable bucket labels aligned with `USAGE_HISTORY_LATENCY_BUCKET_UPPER_BOUNDS_SECONDS`.
 */
export function getLatencyBucketLabels(): string[] {
  const bounds = USAGE_HISTORY_LATENCY_BUCKET_UPPER_BOUNDS_SECONDS
  const labels: string[] = []

  labels.push(`<${bounds[0]}s`)
  for (let index = 1; index < bounds.length; index += 1) {
    labels.push(`${bounds[index - 1]}–${bounds[index]}s`)
  }
  labels.push(`≥${bounds[bounds.length - 1]}s`)

  return labels
}

/**
 * Merge numeric usage aggregates in-place.
 *
 * This intentionally mirrors the aggregation semantics in `~/services/usageHistory/analytics`
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
export function resolveFusedByModelForTokens(
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
 * Build token totals rows for tables/charts, adding `Other` and handling unknown tokens.
 *
 * Notes:
 * - Token ids are storage-safe identifiers (no secrets).
 * - The special id `unknown` is formatted via `unknownLabel`.
 */
export function getTokenTotalsRows(params: {
  exportData: UsageHistoryExport
  topN: number
  otherLabel?: string
  unknownLabel?: string
}): UsageAnalyticsTokenTotalsRow[] {
  const {
    exportData,
    topN,
    otherLabel = "Other",
    unknownLabel = "Unknown token",
  } = params

  const tokenNamesById = exportData.fused.tokenNamesById
  const items = Object.entries(exportData.fused.byToken).map(
    ([tokenId, aggregate]) => ({
      key: tokenId,
      value: aggregate.totalTokens,
    }),
  )

  const rows = topNWithOther(items, topN, otherLabel).map((item) => {
    const tokenId = item.key
    const tokenName = tokenNamesById[tokenId]
    const tokenLabel =
      tokenId === "unknown"
        ? unknownLabel
        : tokenName
          ? `${tokenName} (#${tokenId})`
          : `#${tokenId}`

    return {
      tokenId,
      tokenLabel,
      totalTokens: item.value,
    }
  })

  return rows
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
      tokenId === "unknown"
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

/**
 * Build the combined daily overview chart option (requests + token counts + quota).
 *
 * `dayKeys` is assumed to be a dense, ordered domain; any missing aggregate buckets are treated as 0.
 */
export function buildDailyOverviewOption(params: {
  dayKeys: string[]
  daily: Record<string, UsageHistoryAggregate>
  requestsAxisLabel: string
  tokensAxisLabel: string
  requestsSeriesLabel: string
  promptTokensSeriesLabel: string
  completionTokensSeriesLabel: string
  totalTokensSeriesLabel: string
  quotaSeriesLabel: string
  legendSelected?: Record<string, boolean>
  isDark?: boolean
}): EChartsOption {
  const {
    dayKeys,
    daily,
    requestsAxisLabel,
    tokensAxisLabel,
    requestsSeriesLabel,
    promptTokensSeriesLabel,
    completionTokensSeriesLabel,
    totalTokensSeriesLabel,
    quotaSeriesLabel,
    legendSelected,
    isDark = false,
  } = params

  const requests = dayKeys.map((dayKey) => daily[dayKey]?.requests ?? 0)
  const promptTokens = dayKeys.map((dayKey) => daily[dayKey]?.promptTokens ?? 0)
  const completionTokens = dayKeys.map(
    (dayKey) => daily[dayKey]?.completionTokens ?? 0,
  )
  const totalTokens = dayKeys.map((dayKey) => daily[dayKey]?.totalTokens ?? 0)
  const quotaConsumed = dayKeys.map(
    (dayKey) => daily[dayKey]?.quotaConsumed ?? 0,
  )

  return {
    backgroundColor: "transparent",
    tooltip: { trigger: "axis" },
    legend: { top: 0, ...(legendSelected ? { selected: legendSelected } : {}) },
    toolbox: {
      feature: {
        restore: {},
        saveAsImage: {},
      },
    },
    grid: { left: "10%", right: "10%" },
    xAxis: {
      type: "category",
      data: dayKeys,
      axisLabel: { color: isDark ? "#9ca3af" : "#6b7280" },
      axisLine: { lineStyle: { color: isDark ? "#374151" : "#e5e7eb" } },
    },
    yAxis: [
      {
        type: "value",
        name: requestsAxisLabel,
        axisLabel: { color: isDark ? "#9ca3af" : "#6b7280" },
        splitLine: { lineStyle: { color: isDark ? "#1f2937" : "#f3f4f6" } },
      },
      {
        type: "value",
        name: tokensAxisLabel,
        axisLabel: { color: isDark ? "#9ca3af" : "#6b7280" },
        splitLine: { show: false },
      },
    ],
    dataZoom: [
      { type: "inside", xAxisIndex: 0 },
      { type: "slider", xAxisIndex: 0, bottom: 8, height: 20 },
    ],
    series: [
      {
        name: requestsSeriesLabel,
        type: "line",
        yAxisIndex: 0,
        data: requests,
        showSymbol: false,
        smooth: true,
      },
      {
        name: promptTokensSeriesLabel,
        type: "line",
        yAxisIndex: 1,
        data: promptTokens,
        showSymbol: false,
        smooth: true,
        areaStyle: { opacity: 0.2 },
        stack: "tokens",
      },
      {
        name: completionTokensSeriesLabel,
        type: "line",
        yAxisIndex: 1,
        data: completionTokens,
        showSymbol: false,
        smooth: true,
        areaStyle: { opacity: 0.2 },
        stack: "tokens",
      },
      {
        name: totalTokensSeriesLabel,
        type: "line",
        yAxisIndex: 1,
        data: totalTokens,
        showSymbol: false,
        smooth: true,
      },
      {
        name: quotaSeriesLabel,
        type: "line",
        yAxisIndex: 1,
        data: quotaConsumed,
        showSymbol: false,
        smooth: true,
        lineStyle: { type: "dashed" },
      },
    ],
  }
}

/**
 * Build a simple horizontal bar chart option (used for Top-N tables and breakdown views).
 */
export function buildHorizontalBarOption(params: {
  categories: string[]
  values: number[]
  valueLabel?: string
  inverse?: boolean
  isDark?: boolean
}): EChartsOption {
  const {
    categories,
    values,
    valueLabel,
    inverse = true,
    isDark = false,
  } = params

  return {
    backgroundColor: "transparent",
    tooltip: { trigger: "item" },
    grid: { left: 16, right: 16, top: 16, bottom: 16, containLabel: true },
    xAxis: {
      type: "value",
      axisLabel: { color: isDark ? "#9ca3af" : "#6b7280" },
      splitLine: { lineStyle: { color: isDark ? "#1f2937" : "#f3f4f6" } },
    },
    yAxis: {
      type: "category",
      data: categories,
      inverse,
      axisLabel: { color: isDark ? "#9ca3af" : "#6b7280" },
      axisLine: { lineStyle: { color: isDark ? "#374151" : "#e5e7eb" } },
    },
    series: [
      {
        name: valueLabel ?? "",
        type: "bar",
        data: values,
      },
    ],
  }
}

/**
 * Build a basic pie chart option for distribution-style breakdown views.
 *
 * Notes:
 * - Uses a donut-style radius to leave room for labels/legend.
 * - Keeps labels hidden by default to avoid clutter; they show on hover/emphasis.
 */
export function buildPieOption(params: {
  categories: string[]
  values: number[]
  valueLabel?: string
  isDark?: boolean
}): EChartsOption {
  const { categories, values, valueLabel, isDark = false } = params
  const data = categories.map((name, index) => ({
    name,
    value: values[index] ?? 0,
  }))

  return {
    backgroundColor: "transparent",
    tooltip: { trigger: "item" },
    legend: {
      type: "scroll",
      bottom: 0,
      textStyle: { color: isDark ? "#9ca3af" : "#6b7280" },
    },
    series: [
      {
        name: valueLabel ?? "",
        type: "pie",
        radius: ["35%", "70%"],
        center: ["50%", "44%"],
        avoidLabelOverlap: true,
        label: { show: false, position: "center" },
        emphasis: {
          label: { show: true, fontSize: 12, fontWeight: "bold" },
        },
        labelLine: { show: false },
        data,
      },
    ],
  }
}

/**
 * Build a single-series line chart option for trend views.
 *
 * `null` values are allowed and are connected via `connectNulls` for smoother time-series visuals.
 */
export function buildLineTrendOption(params: {
  categories: string[]
  values: Array<number | null>
  seriesLabel: string
  yAxisLabel?: string
  isDark?: boolean
}): EChartsOption {
  const { categories, values, seriesLabel, yAxisLabel, isDark = false } = params

  return {
    backgroundColor: "transparent",
    tooltip: { trigger: "axis" },
    grid: { left: 16, right: 16, top: 16, bottom: 24, containLabel: true },
    xAxis: {
      type: "category",
      data: categories,
      axisLabel: { color: isDark ? "#9ca3af" : "#6b7280" },
      axisLine: { lineStyle: { color: isDark ? "#374151" : "#e5e7eb" } },
    },
    yAxis: {
      type: "value",
      name: yAxisLabel,
      axisLabel: { color: isDark ? "#9ca3af" : "#6b7280" },
      splitLine: { lineStyle: { color: isDark ? "#1f2937" : "#f3f4f6" } },
    },
    series: [
      {
        name: seriesLabel,
        type: "line",
        data: values,
        showSymbol: false,
        smooth: true,
        connectNulls: true,
      },
    ],
  }
}

/**
 * Build a model-by-day heatmap chart option.
 *
 * `valuesByModelAndDay` is treated as sparse; any missing cell values are rendered as 0.
 */
export function buildHeatmapOption(params: {
  dayKeys: string[]
  modelNames: string[]
  valuesByModelAndDay: Record<string, Record<string, number>>
  seriesLabel: string
  isDark?: boolean
}): EChartsOption {
  const {
    dayKeys,
    modelNames,
    valuesByModelAndDay,
    seriesLabel,
    isDark = false,
  } = params

  const data: Array<[number, number, number]> = []
  for (let y = 0; y < modelNames.length; y += 1) {
    const modelName = modelNames[y]
    const modelDaily = valuesByModelAndDay[modelName] ?? {}
    for (let x = 0; x < dayKeys.length; x += 1) {
      const dayKey = dayKeys[x]
      data.push([x, y, modelDaily[dayKey] ?? 0])
    }
  }

  const maxValue = data.reduce((max, item) => Math.max(max, item[2]), 0)

  return {
    backgroundColor: "transparent",
    tooltip: { position: "top" },
    grid: { left: 16, right: 24, top: 16, bottom: 24, containLabel: true },
    xAxis: {
      type: "category",
      data: dayKeys,
      axisLabel: { color: isDark ? "#9ca3af" : "#6b7280" },
      axisLine: { lineStyle: { color: isDark ? "#374151" : "#e5e7eb" } },
    },
    yAxis: {
      type: "category",
      data: modelNames,
      axisLabel: { color: isDark ? "#9ca3af" : "#6b7280" },
      axisLine: { lineStyle: { color: isDark ? "#374151" : "#e5e7eb" } },
    },
    visualMap: {
      min: 0,
      max: Math.max(1, maxValue),
      calculable: true,
      orient: "horizontal",
      left: "center",
      bottom: 0,
      textStyle: { color: isDark ? "#9ca3af" : "#6b7280" },
    },
    series: [
      {
        name: seriesLabel,
        type: "heatmap",
        data,
        emphasis: {
          itemStyle: {
            shadowBlur: 8,
            shadowColor: "rgba(0, 0, 0, 0.35)",
          },
        },
      },
    ],
  }
}

/**
 * Build a histogram option for latency bucket counts.
 *
 * Buckets are aligned with `getLatencyBucketLabels()`; missing bucket indices are treated as 0.
 */
export function buildLatencyHistogramOption(params: {
  latency: UsageHistoryLatencyAggregate
  seriesLabel: string
  isDark?: boolean
}): EChartsOption {
  const { latency, seriesLabel, isDark = false } = params
  const labels = getLatencyBucketLabels()
  const counts = labels.map((_, index) => latency.buckets[index] ?? 0)

  return {
    backgroundColor: "transparent",
    tooltip: { trigger: "axis" },
    grid: { left: 16, right: 16, top: 16, bottom: 24, containLabel: true },
    xAxis: {
      type: "category",
      data: labels,
      axisLabel: { color: isDark ? "#9ca3af" : "#6b7280", rotate: 30 },
      axisLine: { lineStyle: { color: isDark ? "#374151" : "#e5e7eb" } },
    },
    yAxis: {
      type: "value",
      axisLabel: { color: isDark ? "#9ca3af" : "#6b7280" },
      splitLine: { lineStyle: { color: isDark ? "#1f2937" : "#f3f4f6" } },
    },
    series: [
      {
        name: seriesLabel,
        type: "bar",
        data: counts,
      },
    ],
  }
}

/**
 * Build the latency trend chart option (avg/max seconds + slow count).
 *
 * `dailyLatency` is treated as sparse; missing days are rendered as 0.
 */
export function buildLatencyTrendOption(params: {
  dayKeys: string[]
  dailyLatency: Record<string, UsageHistoryLatencyAggregate>
  avgSeriesLabel: string
  maxSeriesLabel: string
  slowSeriesLabel: string
  secondsAxisLabel: string
  slowCountAxisLabel: string
  isDark?: boolean
}): EChartsOption {
  const {
    dayKeys,
    dailyLatency,
    avgSeriesLabel,
    maxSeriesLabel,
    slowSeriesLabel,
    secondsAxisLabel,
    slowCountAxisLabel,
    isDark = false,
  } = params

  const avg = dayKeys.map((dayKey) => {
    const item = dailyLatency[dayKey]
    if (!item || item.count <= 0) return 0
    return item.sum / Math.max(1, item.count)
  })

  const max = dayKeys.map((dayKey) => dailyLatency[dayKey]?.max ?? 0)
  const slow = dayKeys.map((dayKey) => dailyLatency[dayKey]?.slowCount ?? 0)

  return {
    backgroundColor: "transparent",
    tooltip: { trigger: "axis" },
    legend: { top: 0 },
    grid: { left: 16, right: 16, top: 44, bottom: 24, containLabel: true },
    xAxis: {
      type: "category",
      data: dayKeys,
      axisLabel: { color: isDark ? "#9ca3af" : "#6b7280" },
      axisLine: { lineStyle: { color: isDark ? "#374151" : "#e5e7eb" } },
    },
    yAxis: [
      {
        type: "value",
        name: secondsAxisLabel,
        axisLabel: { color: isDark ? "#9ca3af" : "#6b7280" },
        splitLine: { lineStyle: { color: isDark ? "#1f2937" : "#f3f4f6" } },
      },
      {
        type: "value",
        name: slowCountAxisLabel,
        axisLabel: { color: isDark ? "#9ca3af" : "#6b7280" },
        splitLine: { show: false },
      },
    ],
    series: [
      {
        name: avgSeriesLabel,
        type: "line",
        data: avg,
        showSymbol: false,
        smooth: true,
      },
      {
        name: maxSeriesLabel,
        type: "line",
        data: max,
        showSymbol: false,
        smooth: true,
      },
      { name: slowSeriesLabel, type: "bar", yAxisIndex: 1, data: slow },
    ],
  }
}
