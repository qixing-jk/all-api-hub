import { useMemo } from "react"
import { useTranslation } from "react-i18next"

import {
  buildAccountRangeSummaries,
  buildPerAccountDailyBalanceMoneySeries,
  type DailyBalanceHistoryMetric,
} from "~/services/history/dailyBalanceHistory/selectors"
import type { DailyBalanceHistoryStore } from "~/types/dailyBalanceHistory"

import { type BalanceHistoryAccountSummaryRow } from "../components/BalanceHistoryAccountSummaryTable"
import {
  type BalanceHistoryBreakdownChartType,
  type BalanceHistoryTrendSeriesScope,
} from "../contracts"
import {
  buildAccountBreakdownBarOption,
  buildAccountBreakdownPieOption,
  buildMultiSeriesTrendOption,
  type BalanceHistoryTrendChartType,
} from "../echartsOptions"
import { getBalanceHistoryMetricLabel } from "../presentation"

/** Derive chart and account-summary projections through existing history selectors. */
export function useBalanceHistoryReporting({
  store,
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
}: {
  store: DailyBalanceHistoryStore | null
  effectiveAccountIds: string[]
  effectiveRange: { startDayKey: string; endDayKey: string }
  currencyType: "USD" | "CNY"
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
}) {
  const { t } = useTranslation("balanceHistory")
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

  const totalTrendValues = useMemo((): Array<number | null> => {
    // Best-effort aggregation: sum accounts that have data for each day.
    // Keep gaps only when no selected accounts have a value for that day.
    const totals: Array<number | null> = perAccountSeries.dayKeys.map(
      () => null,
    )

    for (let index = 0; index < perAccountSeries.dayKeys.length; index += 1) {
      let sum = 0
      let covered = 0

      for (const accountId of effectiveAccountIds) {
        const value =
          perAccountSeries.seriesByAccountId[accountId]?.[
            effectiveTrendMetric
          ]?.[index]

        if (typeof value !== "number" || !Number.isFinite(value)) continue
        covered += 1
        sum += value
      }

      totals[index] = covered > 0 ? sum : null
    }

    return totals
  }, [
    effectiveAccountIds,
    effectiveTrendMetric,
    perAccountSeries.dayKeys,
    perAccountSeries.seriesByAccountId,
  ])

  const totalTrendCoverageSummary = useMemo(() => {
    const totalAccounts = effectiveAccountIds.length

    const coverageCounts = perAccountSeries.coverageByDay.map((coverage) => {
      if (effectiveTrendMetric === "balance") return coverage.snapshotAccounts
      if (effectiveTrendMetric === "estimatedIncome")
        return coverage.estimatedIncomeAccounts
      if (effectiveTrendMetric === "income") return coverage.incomeAccounts
      if (effectiveTrendMetric === "outcome") return coverage.outcomeAccounts
      return coverage.cashflowAccounts
    })

    const availableCoverage = coverageCounts.filter((count) => count > 0)
    const availableDays = availableCoverage.length

    const minCovered = availableDays > 0 ? Math.min(...availableCoverage) : 0
    const maxCovered = availableDays > 0 ? Math.max(...availableCoverage) : 0

    const partialDays = availableCoverage.filter(
      (count) => count < totalAccounts,
    ).length

    return {
      totalAccounts,
      minCovered,
      maxCovered,
      partialDays,
    }
  }, [
    effectiveAccountIds.length,
    effectiveTrendMetric,
    perAccountSeries.coverageByDay,
  ])

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
    const series: Array<{ name: string; values: Array<number | null> }> = []

    if (trendScope === "total") {
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
      })
    }

    return series
  }, [
    accountDisplayLabelById,
    effectiveAccountIds,
    effectiveTrendMetric,
    perAccountSeries.dayKeys,
    perAccountSeries.seriesByAccountId,
    t,
    totalTrendValues,
    trendScope,
  ])

  const trendOption = useMemo(() => {
    const metricLabel = getBalanceHistoryMetricLabel(t, effectiveTrendMetric)
    return buildMultiSeriesTrendOption({
      dayKeys: perAccountSeries.dayKeys,
      series: trendSeries,
      chartType: trendChartType,
      yAxisLabel: `${metricLabel} (${currencySymbol})`,
      axisLabelFormatter: formatAxisMoneyValue,
      valueFormatter: formatTooltipMoneyValue,
    })
  }, [
    currencySymbol,
    formatAxisMoneyValue,
    formatTooltipMoneyValue,
    perAccountSeries.dayKeys,
    t,
    effectiveTrendMetric,
    trendChartType,
    trendSeries,
  ])

  const breakdownData = useMemo(() => {
    const entries: Array<{ name: string; value: number }> = []

    if (effectiveBreakdownMetric === "balance") {
      const referenceDayKey = breakdownBalanceDayKey || effectiveRange.endDayKey
      const referenceIndex = perAccountSeries.dayKeys.indexOf(referenceDayKey)

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
        })
      }
    } else {
      for (const summary of rangeSummaries.summaries) {
        const value =
          effectiveBreakdownMetric === "income"
            ? summary.incomeTotal
            : effectiveBreakdownMetric === "outcome"
              ? summary.outcomeTotal
              : effectiveBreakdownMetric === "estimatedIncome"
                ? summary.estimatedIncomeTotal
                : summary.netTotal

        if (typeof value !== "number" || !Number.isFinite(value)) continue

        entries.push({
          name:
            accountDisplayLabelById.get(summary.accountId) ?? summary.accountId,
          value,
        })
      }
    }

    entries.sort((a, b) => b.value - a.value)

    const values = entries.map((entry) => entry.value)
    return {
      categories: entries.map((entry) => entry.name),
      values,
      coveredAccounts: entries.length,
      totalAccounts: effectiveAccountIds.length,
      hasNegativeValues: values.some((value) => value < 0),
    }
  }, [
    accountDisplayLabelById,
    breakdownBalanceDayKey,
    effectiveBreakdownMetric,
    effectiveAccountIds,
    effectiveRange.endDayKey,
    perAccountSeries.dayKeys,
    perAccountSeries.seriesByAccountId,
    rangeSummaries.summaries,
  ])

  const breakdownOption = useMemo(() => {
    if (!breakdownData.values.length) return null

    const valueLabel = `${getBalanceHistoryMetricLabel(t, effectiveBreakdownMetric)} (${currencySymbol})`

    return breakdownChartType === "pie"
      ? buildAccountBreakdownPieOption({
          categories: breakdownData.categories,
          values: breakdownData.values,
          valueLabel,
          valueFormatter: formatTooltipMoneyValue,
        })
      : buildAccountBreakdownBarOption({
          categories: breakdownData.categories,
          values: breakdownData.values,
          valueLabel,
          axisLabelFormatter: formatAxisMoneyValue,
          valueFormatter: formatTooltipMoneyValue,
        })
  }, [
    breakdownChartType,
    breakdownData.categories,
    breakdownData.values,
    currencySymbol,
    formatAxisMoneyValue,
    formatTooltipMoneyValue,
    t,
    effectiveBreakdownMetric,
  ])

  const overviewTotals = useMemo(() => {
    let endBalanceCovered = 0
    let endBalanceSum = 0
    let netCovered = 0
    let netSum = 0
    let incomeCovered = 0
    let incomeSum = 0
    let outcomeCovered = 0
    let outcomeSum = 0

    for (const summary of rangeSummaries.summaries) {
      if (typeof summary.endBalance === "number") {
        endBalanceCovered += 1
        endBalanceSum += summary.endBalance
      }

      if (typeof summary.netTotal === "number") {
        netCovered += 1
        netSum += summary.netTotal
      }

      if (typeof summary.incomeTotal === "number") {
        incomeCovered += 1
        incomeSum += summary.incomeTotal
      }

      if (typeof summary.outcomeTotal === "number") {
        outcomeCovered += 1
        outcomeSum += summary.outcomeTotal
      }
    }

    return {
      totalAccounts: effectiveAccountIds.length,
      endBalance: endBalanceCovered ? endBalanceSum : null,
      endBalanceCovered,
      rangeNet: netCovered ? netSum : null,
      rangeNetCovered: netCovered,
      incomeTotal: incomeCovered ? incomeSum : null,
      incomeCovered,
      outcomeTotal: outcomeCovered ? outcomeSum : null,
      outcomeCovered,
    }
  }, [effectiveAccountIds.length, rangeSummaries.summaries])

  const tableRows = useMemo<BalanceHistoryAccountSummaryRow[]>(() => {
    return rangeSummaries.summaries.map((summary) => ({
      id: summary.accountId,
      label:
        accountDisplayLabelById.get(summary.accountId) ?? summary.accountId,
      startBalance: summary.startBalance,
      endBalance: summary.endBalance,
      netTotal: summary.netTotal,
      incomeTotal: summary.incomeTotal,
      estimatedIncomeTotal: summary.estimatedIncomeTotal,
      outcomeTotal: summary.outcomeTotal,
      snapshotDays: summary.snapshotDays,
      cashflowDays: summary.cashflowDays,
      estimatedIncomeDays: summary.estimatedIncomeDays,
      totalDays: summary.totalDays,
    }))
  }, [accountDisplayLabelById, rangeSummaries.summaries])

  return {
    perAccountSeries,
    totalTrendValues,
    totalTrendCoverageSummary,
    trendOption,
    breakdownData,
    breakdownOption,
    overviewTotals,
    tableRows,
  }
}
