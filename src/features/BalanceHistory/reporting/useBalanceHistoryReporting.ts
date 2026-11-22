import { useMemo } from "react"
import { useTranslation } from "react-i18next"

import { FINANCIAL_METRIC_KINDS } from "~/components/financialMetricKinds"
import {
  BALANCE_HISTORY_BREAKDOWN_CHART_TYPES,
  BALANCE_HISTORY_TREND_CHART_TYPES,
  BALANCE_HISTORY_TREND_SERIES_SCOPES,
  type BalanceHistoryBreakdownChartType,
  type BalanceHistoryTrendSeriesScope,
} from "~/features/BalanceHistory/contracts"
import {
  buildAccountBreakdownPieOption,
  buildMultiSeriesTrendOption,
  type BalanceHistoryTrendChartType,
} from "~/features/BalanceHistory/reporting/echartsOptions"
import { getFinancialHistoryPresentation } from "~/features/BalanceHistory/reporting/financialHistoryPresentation"
import {
  buildNativeHistoryEstimates,
  presentNativeHistoryActivity,
} from "~/features/BalanceHistory/reporting/nativeHistoryActivity"
import { getBalanceHistoryMetricLabel } from "~/features/BalanceHistory/reporting/presentation"
import { buildFinancialHistoryActivity } from "~/services/history/dailyBalanceHistory/activity"
import { DAILY_BALANCE_HISTORY_METRICS } from "~/services/history/dailyBalanceHistory/constants"
import {
  buildAccountRangeSummaries,
  buildFinancialHistorySeries,
  buildPerAccountDailyBalanceMoneySeries,
  type DailyBalanceHistoryMetric,
} from "~/services/history/dailyBalanceHistory/selectors"
import type { CurrencyType } from "~/types"
import type { DailyBalanceHistoryStore } from "~/types/dailyBalanceHistory"
import { subtractDaysFromDayKey } from "~/utils/core/dayKey"

import { buildNativeBalanceHistoryMetrics } from "./nativeBalanceHistoryMetrics"
import {
  buildHistoryAccountSummaryRows,
  buildHistoryOverviewTotals,
  buildHistoryTrendCoverage,
  buildHistoryTrendTotals,
} from "./reportingSelectors"

/** Derive chart and account-summary projections through existing history selectors. */
export function useBalanceHistoryReporting({
  store,
  asOf,
  effectiveAccountIds,
  effectiveRange,
  currencyType,
  exchangeRateByAccountId,
  estimatedTodayIncomeEnabled,
  manualBalanceAccountIds,
  effectiveTrendMetric,
  trendScope,
  accountDisplayLabelById,
  trendChartType,
  currencySymbol,
  formatAxisMoneyValue,
  formatTooltipMoneyValue,
  effectiveBreakdownMetric,
  breakdownBalanceDayKey,
  breakdownChartType,
  trendBalanceKey,
  breakdownBalanceKey,
}: {
  store: DailyBalanceHistoryStore | null
  asOf: number
  effectiveAccountIds: string[]
  effectiveRange: { startDayKey: string; endDayKey: string }
  currencyType: CurrencyType
  exchangeRateByAccountId: Map<string, number>
  estimatedTodayIncomeEnabled: boolean
  manualBalanceAccountIds: Set<string>
  effectiveTrendMetric: DailyBalanceHistoryMetric
  trendScope: BalanceHistoryTrendSeriesScope
  accountDisplayLabelById: Map<string, string>
  trendChartType: BalanceHistoryTrendChartType
  currencySymbol: string
  formatAxisMoneyValue: (value: number | string, _index: number) => string
  formatTooltipMoneyValue: (
    value: number | string,
    _dataIndex: number,
  ) => string
  effectiveBreakdownMetric: DailyBalanceHistoryMetric
  breakdownBalanceDayKey: string
  breakdownChartType: BalanceHistoryBreakdownChartType
  trendBalanceKey?: string | null
  breakdownBalanceKey?: string | null
}) {
  const { t, i18n } = useTranslation("balanceHistory")
  const financialHistory = useMemo(
    () =>
      buildFinancialHistorySeries({
        store,
        asOf,
        accountIds: effectiveAccountIds,
        ...effectiveRange,
      }),
    [store, effectiveAccountIds, effectiveRange, asOf],
  )
  const perAccountSeries = useMemo(() => {
    return buildPerAccountDailyBalanceMoneySeries({
      store,
      accountIds: effectiveAccountIds,
      startDayKey: effectiveRange.startDayKey,
      endDayKey: effectiveRange.endDayKey,
      currencyType,
      exchangeRateByAccountId,
      estimatedTodayIncomeEnabled,
      manualBalanceAccountIds,
    })
  }, [
    currencyType,
    effectiveAccountIds,
    effectiveRange.endDayKey,
    effectiveRange.startDayKey,
    estimatedTodayIncomeEnabled,
    exchangeRateByAccountId,
    manualBalanceAccountIds,
    store,
  ])

  const historyPresentation = useMemo(
    () =>
      getFinancialHistoryPresentation(
        financialHistory.series,
        t,
        i18n.language,
      ),
    [financialHistory.series, i18n.language, t],
  )
  const nativeBalanceMetrics = useMemo(
    () =>
      buildNativeBalanceHistoryMetrics({
        financialHistory: {
          series: financialHistory.series,
          dayKeys: financialHistory.dayKeys,
        },
        historyPresentation,
        accountDisplayLabelById,
        t,
      }),
    [
      accountDisplayLabelById,
      financialHistory.dayKeys,
      financialHistory.series,
      historyPresentation,
      t,
    ],
  )
  const reportedActivity = useMemo(
    () =>
      presentNativeHistoryActivity({
        activity: [
          ...buildFinancialHistoryActivity({
            store,
            accountIds: effectiveAccountIds,
            dayKeys: financialHistory.dayKeys,
            asOf,
          }),
          ...(estimatedTodayIncomeEnabled
            ? buildNativeHistoryEstimates(
                financialHistory.series,
                financialHistory.dayKeys,
              )
            : []),
        ],
        presentation: historyPresentation,
        accountLabels: accountDisplayLabelById,
        t,
      }),
    [
      store,
      effectiveAccountIds,
      financialHistory.dayKeys,
      financialHistory.series,
      estimatedTodayIncomeEnabled,
      asOf,
      historyPresentation,
      accountDisplayLabelById,
      t,
    ],
  )
  const nativeMetrics = useMemo(
    () => [...nativeBalanceMetrics, ...reportedActivity.metrics],
    [nativeBalanceMetrics, reportedActivity.metrics],
  )
  const nativeTrendMetrics = useMemo(
    () =>
      nativeMetrics.filter(({ series }) =>
        series.some(({ values }) => values.some(Number.isFinite)),
      ),
    [nativeMetrics],
  )
  const hasReferenceBalance = perAccountSeries.coverageByDay.some(
    (day) => day.snapshotAccounts > 0,
  )
  const referenceMetrics = (
    [
      DAILY_BALANCE_HISTORY_METRICS.Balance,
      DAILY_BALANCE_HISTORY_METRICS.Income,
      DAILY_BALANCE_HISTORY_METRICS.Outcome,
      DAILY_BALANCE_HISTORY_METRICS.Net,
      DAILY_BALANCE_HISTORY_METRICS.EstimatedIncome,
    ] satisfies DailyBalanceHistoryMetric[]
  ).filter((metric) =>
    effectiveAccountIds.some((id) =>
      perAccountSeries.seriesByAccountId[id]?.[metric]?.some(Number.isFinite),
    ),
  )
  const selectedNativeMetric = (
    key: string | null | undefined,
    metric: DailyBalanceHistoryMetric,
    options = nativeMetrics,
  ) => {
    if (key?.startsWith("reference:"))
      return referenceMetrics.includes(metric) ? undefined : options[0]
    const explicit = options.find((item) => item.key === key)
    if (explicit) return explicit
    if (key) {
      const sameSource = options.find(
        (item) => "sourceKeys" in item && item.sourceKeys.includes(key),
      )
      if (sameSource) return sameSource
    }
    if (metric === DAILY_BALANCE_HISTORY_METRICS.Balance) {
      return key !== null
        ? (options.find(
            ({ kind, overviewEntries }) =>
              kind === FINANCIAL_METRIC_KINDS.Balance &&
              overviewEntries.some(({ amount }) => amount !== undefined),
          ) ?? (!hasReferenceBalance ? options[0] : undefined))
        : undefined
    }
    const matching = options.filter((option) => {
      const estimated = "estimated" in option && option.estimated
      return metric === DAILY_BALANCE_HISTORY_METRICS.EstimatedIncome
        ? estimated
        : metric === DAILY_BALANCE_HISTORY_METRICS.Net
          ? option.kind === FINANCIAL_METRIC_KINDS.Change && !estimated
          : option.kind ===
            (metric === DAILY_BALANCE_HISTORY_METRICS.Outcome
              ? FINANCIAL_METRIC_KINDS.Consumption
              : FINANCIAL_METRIC_KINDS.Income)
    })
    return (
      matching.find(({ currencyCode }) => currencyCode === currencyType) ??
      matching[0]
    )
  }
  const nativeTrend = selectedNativeMetric(
    trendBalanceKey,
    effectiveTrendMetric,
    nativeTrendMetrics,
  )
  const nativeBreakdown = selectedNativeMetric(
    breakdownBalanceKey,
    effectiveBreakdownMetric,
  )

  const totalTrendValues = useMemo(
    () =>
      buildHistoryTrendTotals(
        effectiveAccountIds,
        effectiveTrendMetric,
        perAccountSeries,
      ),
    [effectiveAccountIds, effectiveTrendMetric, perAccountSeries],
  )

  const totalTrendCoverageSummary = useMemo(
    () =>
      buildHistoryTrendCoverage(
        effectiveAccountIds.length,
        effectiveTrendMetric,
        perAccountSeries.coverageByDay,
      ),
    [
      effectiveAccountIds.length,
      effectiveTrendMetric,
      perAccountSeries.coverageByDay,
    ],
  )

  const rangeSummaries = useMemo(() => {
    return buildAccountRangeSummaries({
      store,
      accountIds: effectiveAccountIds,
      startDayKey: effectiveRange.startDayKey,
      endDayKey: effectiveRange.endDayKey,
      currencyType,
      exchangeRateByAccountId,
      estimatedTodayIncomeEnabled,
      manualBalanceAccountIds,
    })
  }, [
    currencyType,
    effectiveAccountIds,
    effectiveRange.endDayKey,
    effectiveRange.startDayKey,
    estimatedTodayIncomeEnabled,
    exchangeRateByAccountId,
    manualBalanceAccountIds,
    store,
  ])

  const trendSeries = useMemo(() => {
    const series: Array<{
      name: string
      values: Array<number | null>
      valueFormatter?: (value: number | string, day: number) => string
    }> = []

    if (trendScope === BALANCE_HISTORY_TREND_SERIES_SCOPES.Total) {
      const hasAnyData = totalTrendValues.some(
        (value) => typeof value === "number" && Number.isFinite(value),
      )

      return hasAnyData
        ? [
            {
              name: t("trend.scopes.total"),
              values: totalTrendValues,
            },
          ]
        : []
    }

    for (const accountId of effectiveAccountIds) {
      const values =
        perAccountSeries.seriesByAccountId[accountId]?.[effectiveTrendMetric] ??
        perAccountSeries.dayKeys.map(() => null)

      const hasAnyData = values.some(
        (value) => typeof value === "number" && Number.isFinite(value),
      )
      if (!hasAnyData) continue

      series.push({
        name: accountDisplayLabelById.get(accountId) ?? accountId,
        values,
        ...(effectiveTrendMetric ===
        DAILY_BALANCE_HISTORY_METRICS.EstimatedIncome
          ? {
              valueFormatter: (value: number | string, index: number) => {
                const text = formatTooltipMoneyValue(value, index)
                const day = perAccountSeries.dayKeys[index]
                const snapshots =
                  store?.referenceSnapshotsByAccountId[accountId]
                if (!day || !snapshots) return text
                const from =
                  snapshots[subtractDaysFromDayKey(day, 1)]?.capturedAt
                const to = snapshots[day]?.capturedAt
                if (!from || !to || from >= to) return text
                const start = new Date(from)
                const end = new Date(to)
                if (
                  !Number.isFinite(start.getTime()) ||
                  !Number.isFinite(end.getTime())
                )
                  return text
                const dates = new Intl.DateTimeFormat(i18n.language, {
                  dateStyle: "medium",
                  timeStyle: "short",
                }).formatRange(start, end)
                return `${text} · ${dates}`
              },
            }
          : {}),
      })
    }

    return series
  }, [
    accountDisplayLabelById,
    effectiveAccountIds,
    effectiveTrendMetric,
    formatTooltipMoneyValue,
    i18n.language,
    perAccountSeries.dayKeys,
    perAccountSeries.seriesByAccountId,
    store,
    t,
    totalTrendValues,
    trendScope,
  ])

  const nativeTotalSeries =
    nativeTrend && "totalSeries" in nativeTrend
      ? nativeTrend.totalSeries
      : undefined
  const nativeTrendCanSum = nativeTotalSeries !== undefined
  const nativeTrendWindow = useMemo(() => {
    if (!nativeTrend) return
    const trendSeries =
      trendScope === BALANCE_HISTORY_TREND_SERIES_SCOPES.Total &&
      nativeTotalSeries
        ? [nativeTotalSeries]
        : nativeTrend.series
    const dates = financialHistory.dayKeys
    const hasValueAt = (index: number) =>
      trendSeries.some(({ values }) => Number.isFinite(values[index]))
    const first = dates.findIndex((_, index) => hasValueAt(index))
    if (first < 0) return
    let last = dates.length - 1
    while (last > first && !hasValueAt(last)) last -= 1
    const dayKeys = dates.slice(first, last + 1)
    const series = trendSeries.map(({ name, values, valueFormatter }) => ({
      name,
      values: values.slice(first, last + 1),
      valueFormatter: (value: number | string, index: number) =>
        valueFormatter(value, index + first),
    }))
    const onlySeries = series.length === 1 ? series[0] : undefined
    const onlyValue = onlySeries?.values[0]
    return {
      dayKeys,
      series,
      presentation: {
        start: dates[first]!,
        end: dates[last]!,
        isCropped: first > 0 || last < dates.length - 1,
        hasGaps: series.some(({ values }) => values.includes(null)),
        singleObservation:
          first === last && onlySeries && onlyValue != null
            ? {
                account: onlySeries.name,
                amount: onlySeries.valueFormatter(onlyValue, 0),
              }
            : undefined,
      },
    }
  }, [financialHistory.dayKeys, nativeTotalSeries, nativeTrend, trendScope])

  const trendOption = useMemo(() => {
    if (nativeTrend && nativeTrendWindow) {
      return buildMultiSeriesTrendOption({
        dayKeys: nativeTrendWindow.dayKeys,
        series: nativeTrendWindow.series,
        chartType: trendChartType,
        bridgeGaps: false,
        missingValueLabel: t("trend.noRecordForDay"),
        scaleY: trendChartType === BALANCE_HISTORY_TREND_CHART_TYPES.Line,
        yAxisLabel: nativeTrend.unit,
      })
    }
    const metricLabel = getBalanceHistoryMetricLabel(t, effectiveTrendMetric)
    return buildMultiSeriesTrendOption({
      dayKeys: perAccountSeries.dayKeys,
      series: trendSeries,
      chartType: trendChartType,
      yAxisLabel: `${metricLabel} (${currencySymbol})`,
      axisLabelFormatter: formatAxisMoneyValue,
      missingValueLabel: t("trend.noRecordForDay"),
      valueFormatter: formatTooltipMoneyValue,
    })
  }, [
    currencySymbol,
    nativeTrend,
    nativeTrendWindow,
    formatAxisMoneyValue,
    formatTooltipMoneyValue,
    perAccountSeries.dayKeys,
    t,
    effectiveTrendMetric,
    trendChartType,
    trendSeries,
  ])

  const latestBalanceDayKey = useMemo(() => {
    const { coverageByDay, dayKeys } = perAccountSeries
    for (let index = coverageByDay.length - 1; index >= 0; index -= 1) {
      const hasBalance = nativeBreakdown
        ? nativeBreakdown.series.some(({ values }) => values[index] != null)
        : (coverageByDay[index]?.snapshotAccounts ?? 0) > 0
      if (hasBalance) return dayKeys[index]
    }
    return undefined
  }, [nativeBreakdown, perAccountSeries])
  const breakdownReferenceDayKey =
    breakdownBalanceDayKey || latestBalanceDayKey || effectiveRange.endDayKey
  const breakdownData = useMemo(() => {
    const entries: Array<{
      name: string
      value: number
      formattedValue: string
    }> = []

    if (nativeBreakdown) {
      const referenceIndex = financialHistory.dayKeys.indexOf(
        breakdownReferenceDayKey,
      )
      for (const entry of nativeBreakdown.series) {
        const rangeAmount =
          "rangeAmount" in entry ? entry.rangeAmount : undefined
        const value = rangeAmount
          ? rangeAmount.value
          : entry.values[referenceIndex]
        if (typeof value !== "number" || !Number.isFinite(value)) continue
        entries.push({
          name: entry.name,
          value,
          formattedValue:
            rangeAmount?.formatted ??
            entry.valueFormatter(value, referenceIndex),
        })
      }
    } else if (
      effectiveBreakdownMetric === DAILY_BALANCE_HISTORY_METRICS.Balance
    ) {
      const referenceIndex = perAccountSeries.dayKeys.indexOf(
        breakdownReferenceDayKey,
      )

      for (const accountId of effectiveAccountIds) {
        const value =
          referenceIndex >= 0
            ? perAccountSeries.seriesByAccountId[accountId]?.balance?.[
                referenceIndex
              ]
            : null

        if (typeof value !== "number" || !Number.isFinite(value)) continue

        entries.push({
          name: accountDisplayLabelById.get(accountId) ?? accountId,
          value,
          formattedValue: formatTooltipMoneyValue(value, referenceIndex),
        })
      }
    } else {
      for (const summary of rangeSummaries.summaries) {
        const value =
          effectiveBreakdownMetric === DAILY_BALANCE_HISTORY_METRICS.Income
            ? summary.incomeTotal
            : effectiveBreakdownMetric === DAILY_BALANCE_HISTORY_METRICS.Outcome
              ? summary.outcomeTotal
              : effectiveBreakdownMetric ===
                  DAILY_BALANCE_HISTORY_METRICS.EstimatedIncome
                ? summary.estimatedIncomeTotal
                : summary.netTotal

        if (typeof value !== "number" || !Number.isFinite(value)) continue

        entries.push({
          name:
            accountDisplayLabelById.get(summary.accountId) ?? summary.accountId,
          value,
          formattedValue: formatTooltipMoneyValue(value, 0),
        })
      }
    }

    entries.sort((a, b) => b.value - a.value)

    const values = entries.map((entry) => entry.value)
    return {
      entries,
      categories: entries.map((entry) => entry.name),
      values,
      coveredAccounts: entries.length,
      totalAccounts: effectiveAccountIds.length,
      hasNegativeValues: values.some((value) => value < 0),
      canUsePie:
        (!nativeBreakdown || nativeBreakdown.totalSeries !== undefined) &&
        values.length > 1 &&
        values.every((value) => Number.isFinite(value) && value >= 0) &&
        values.some((value) => value > 0),
    }
  }, [
    accountDisplayLabelById,
    breakdownReferenceDayKey,
    effectiveBreakdownMetric,
    effectiveAccountIds,
    financialHistory.dayKeys,
    formatTooltipMoneyValue,
    nativeBreakdown,
    perAccountSeries.dayKeys,
    perAccountSeries.seriesByAccountId,
    rangeSummaries.summaries,
  ])

  const breakdownOption = useMemo(() => {
    if (
      breakdownChartType !== BALANCE_HISTORY_BREAKDOWN_CHART_TYPES.Pie ||
      !breakdownData.canUsePie
    )
      return null

    const valueLabel =
      nativeBreakdown?.label ??
      `${getBalanceHistoryMetricLabel(t, effectiveBreakdownMetric)} (${currencySymbol})`
    return buildAccountBreakdownPieOption({
      categories: breakdownData.categories,
      values: breakdownData.values,
      valueLabel,
      valueFormatter: (value, index) =>
        breakdownData.entries[index]?.formattedValue ?? String(value),
    })
  }, [
    breakdownChartType,
    breakdownData.categories,
    breakdownData.entries,
    breakdownData.values,
    breakdownData.canUsePie,
    nativeBreakdown,
    currencySymbol,
    t,
    effectiveBreakdownMetric,
  ])

  const overviewTotals = useMemo(
    () =>
      buildHistoryOverviewTotals(
        effectiveAccountIds.length,
        rangeSummaries.summaries,
      ),
    [effectiveAccountIds.length, rangeSummaries.summaries],
  )

  const tableRows = useMemo(
    () =>
      buildHistoryAccountSummaryRows(
        financialHistory.series,
        perAccountSeries,
        rangeSummaries.summaries,
        accountDisplayLabelById,
        reportedActivity.accountEntries,
      ),
    [
      accountDisplayLabelById,
      financialHistory.series,
      perAccountSeries,
      rangeSummaries.summaries,
      reportedActivity.accountEntries,
    ],
  )

  return {
    financialHistory,
    perAccountSeries,
    totalTrendValues,
    totalTrendCoverageSummary,
    trendOption,
    nativeTrendPresentation: nativeTrendWindow?.presentation,
    nativeTrendCanSum,
    breakdownData,
    breakdownReferenceDayKey,
    breakdownOption,
    overviewTotals,
    tableRows,
    nativeMetrics,
    nativeBalanceMetrics,
    nativeTrendMetrics,
    nativeActivity: reportedActivity.entries,
    nativeTrend,
    nativeBreakdown,
    hasReferenceBalance,
    referenceMetrics,
  }
}
