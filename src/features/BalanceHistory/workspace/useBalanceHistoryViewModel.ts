import { useCallback, useEffect, useMemo, useState } from "react"
import { useTranslation } from "react-i18next"

import { FINANCIAL_METRIC_KINDS } from "~/components/financialMetricKinds"
import { BASIC_SETTINGS_TAB_IDS } from "~/constants/basicSettingsTabs"
import { DEFAULT_USD_TO_CNY_RATE } from "~/constants/money"
import { MENU_ITEM_IDS } from "~/constants/optionsMenuIds"
import { SETTINGS_ANCHORS } from "~/constants/settingsAnchors"
import { useUserPreferencesContext } from "~/contexts/UserPreferencesContext"
import { useBalanceAsOf } from "~/features/AccountManagement/data/useBalanceAsOf"
import {
  BALANCE_HISTORY_BREAKDOWN_CHART_TYPES,
  BALANCE_HISTORY_TREND_CHART_TYPES,
  BALANCE_HISTORY_TREND_SERIES_SCOPES,
  QUICK_RANGES,
  type BalanceHistoryBreakdownChartType,
  type BalanceHistoryTrendSeriesScope,
  type BalanceHistoryVisibleMetric,
} from "~/features/BalanceHistory/contracts"
import type { createBalanceHistoryPreview } from "~/features/BalanceHistory/data/createBalanceHistoryPreview"
import { useBalanceHistoryData } from "~/features/BalanceHistory/data/useBalanceHistoryData"
import { type BalanceHistoryTrendChartType } from "~/features/BalanceHistory/reporting/echartsOptions"
import { useBalanceHistoryReporting } from "~/features/BalanceHistory/reporting/useBalanceHistoryReporting"
import {
  buildAccountDisplayNameMap,
  compareAccountDisplayNames,
} from "~/services/accounts/utils/accountDisplayName"
import { buildFinancialHistoryActivity } from "~/services/history/dailyBalanceHistory/activity"
import { DAILY_BALANCE_HISTORY_METRICS } from "~/services/history/dailyBalanceHistory/constants"
import {
  computeRetentionCutoffDayKey,
  listDayKeysInRange,
} from "~/services/history/dailyBalanceHistory/dayKeys"
import { buildFinancialHistorySeries } from "~/services/history/dailyBalanceHistory/selectors"
import { clampBalanceHistoryRetentionDays } from "~/services/history/dailyBalanceHistory/utils"
import { listTagsSorted } from "~/services/tags/tagStoreUtils"
import type { CurrencyType } from "~/types"
import { DEFAULT_BALANCE_HISTORY_PREFERENCES } from "~/types/dailyBalanceHistory"
import {
  getDayKeyFromUnixSeconds,
  subtractDaysFromDayKey,
} from "~/utils/core/dayKey"
import { getCurrencySymbol } from "~/utils/core/formatters"
import { formatMoneyFixed } from "~/utils/core/money"
import { pushWithinOptionsPage } from "~/utils/navigation/optionsPage"

/**
 * Keeps a selected metric within the currently enabled Balance History surface.
 */
function resolveVisibleMetric(
  metric: BalanceHistoryVisibleMetric,
  estimatedTodayIncomeEnabled: boolean,
): BalanceHistoryVisibleMetric {
  return metric === DAILY_BALANCE_HISTORY_METRICS.EstimatedIncome &&
    !estimatedTodayIncomeEnabled
    ? DAILY_BALANCE_HISTORY_METRICS.Income
    : metric
}

/**
 * Clamp a retention-days value coming from user preferences or input.
 */
function clampRetentionDays(value: unknown): number {
  return clampBalanceHistoryRetentionDays(value)
}

const DEFAULT_RANGE_DAYS = 30

/** Compose history query state and report facts for the options view. */
export function useBalanceHistoryViewModel(
  preview?: ReturnType<typeof createBalanceHistoryPreview>,
) {
  const { t } = useTranslation("balanceHistory")

  const {
    preferences,
    currencyType: savedCurrency,
    updateCurrencyType,
  } = useUserPreferencesContext()
  const [previewCurrency, setPreviewCurrency] = useState<CurrencyType>()
  const currencyType = preview
    ? (previewCurrency ?? savedCurrency)
    : savedCurrency
  const estimatedTodayIncomeEnabled =
    Boolean(preview) ||
    preferences.balanceHistory?.estimatedTodayIncome?.enabled === true

  const [selectedTagIds, setSelectedTagIds] = useState<string[]>([])
  const [selectedAccountIds, setSelectedAccountIds] = useState<string[]>([])
  const {
    accounts: savedAccounts,
    tagStore: savedTags,
    store: savedStore,
    isLoading: loadingSaved,
    loadError: savedError,
    retryLoad,
    hasLoadedData: hasLoadedSaved,
    handleRefreshNow,
    handlePruneNow,
  } = useBalanceHistoryData(selectedAccountIds)
  const accounts = preview?.accounts ?? savedAccounts
  const store = preview?.store ?? savedStore
  const tagStore = preview ? null : savedTags
  const isLoading = !preview && loadingSaved
  const loadError = preview ? null : savedError
  const hasLoadedData = Boolean(preview) || hasLoadedSaved
  const historyTimeSources = useMemo(
    () =>
      Object.values(store?.financialSnapshotsByAccountId ?? {}).flatMap(
        (snapshots) =>
          snapshots.map((snapshot) => ({
            balanceSnapshot: snapshot.balance,
            allowances: snapshot.allowances,
          })),
      ),
    [store],
  )
  const asOf = useBalanceAsOf(historyTimeSources)

  const [trendMetric, setTrendMetric] = useState<BalanceHistoryVisibleMetric>(
    DAILY_BALANCE_HISTORY_METRICS.Balance,
  )
  const [trendChartType, setTrendChartType] =
    useState<BalanceHistoryTrendChartType>(
      BALANCE_HISTORY_TREND_CHART_TYPES.Line,
    )
  const [trendScope, setTrendScope] = useState<BalanceHistoryTrendSeriesScope>(
    BALANCE_HISTORY_TREND_SERIES_SCOPES.Accounts,
  )

  const [breakdownMetric, setBreakdownMetric] =
    useState<BalanceHistoryVisibleMetric>(DAILY_BALANCE_HISTORY_METRICS.Balance)
  const [trendBalanceKey, setTrendBalanceKey] = useState<string | null>()
  const [breakdownBalanceKey, setBreakdownBalanceKey] = useState<
    string | null
  >()
  const [breakdownChartType, setBreakdownChartType] =
    useState<BalanceHistoryBreakdownChartType>(
      BALANCE_HISTORY_BREAKDOWN_CHART_TYPES.Bar,
    )
  const [breakdownBalanceDayKey, setBreakdownBalanceDayKey] =
    useState<string>("")

  const openBalanceHistorySettings = useCallback(() => {
    pushWithinOptionsPage(`#${MENU_ITEM_IDS.BASIC}`, {
      tab: BASIC_SETTINGS_TAB_IDS.BalanceHistory,
      anchor: SETTINGS_ANCHORS.BALANCE_HISTORY,
    })
  }, [])

  const tagOptions = useMemo(() => {
    if (!tagStore) return []
    const tags = listTagsSorted(tagStore)
    const counts = new Map<string, number>()
    for (const account of accounts) {
      for (const id of account.tagIds ?? []) {
        counts.set(id, (counts.get(id) ?? 0) + 1)
      }
    }

    return tags.map((tag) => ({
      value: tag.id,
      label: tag.name,
      count: counts.get(tag.id) ?? 0,
      variant: "outline" as const,
    }))
  }, [accounts, tagStore])

  const accountsForSelectedTags = useMemo(() => {
    if (selectedTagIds.length === 0) {
      return accounts
    }

    const selected = new Set(selectedTagIds)
    return accounts.filter((account) =>
      (account.tagIds ?? []).some((id) => selected.has(id)),
    )
  }, [accounts, selectedTagIds])

  const accountDisplayLabelById = useMemo(
    () => buildAccountDisplayNameMap(accounts),
    [accounts],
  )

  const manualBalanceAccountIds = useMemo(
    () =>
      new Set(
        accounts
          .filter(
            (account) =>
              typeof account.manualBalanceUsd === "string" &&
              account.manualBalanceUsd.trim().length > 0,
          )
          .map((account) => account.id),
      ),
    [accounts],
  )

  useEffect(() => {
    if (
      !estimatedTodayIncomeEnabled &&
      trendMetric === DAILY_BALANCE_HISTORY_METRICS.EstimatedIncome
    ) {
      setTrendMetric(DAILY_BALANCE_HISTORY_METRICS.Income)
    }
  }, [estimatedTodayIncomeEnabled, trendMetric])

  useEffect(() => {
    if (
      !estimatedTodayIncomeEnabled &&
      breakdownMetric === DAILY_BALANCE_HISTORY_METRICS.EstimatedIncome
    ) {
      setBreakdownMetric(DAILY_BALANCE_HISTORY_METRICS.Income)
    }
  }, [breakdownMetric, estimatedTodayIncomeEnabled])

  const effectiveTrendMetric = resolveVisibleMetric(
    trendMetric,
    estimatedTodayIncomeEnabled,
  )
  const effectiveBreakdownMetric = resolveVisibleMetric(
    breakdownMetric,
    estimatedTodayIncomeEnabled,
  )

  const effectiveAccountIds = useMemo(() => {
    const available = new Set(
      accountsForSelectedTags.map((account) => account.id),
    )

    if (selectedAccountIds.length === 0) {
      return Array.from(available)
    }

    return selectedAccountIds.filter((id) => available.has(id))
  }, [accountsForSelectedTags, selectedAccountIds])

  const nowUnixSeconds = Math.floor(Date.now() / 1000)
  const maxDayKey = getDayKeyFromUnixSeconds(nowUnixSeconds)
  const retentionDays =
    preferences.balanceHistory?.retentionDays ??
    DEFAULT_BALANCE_HISTORY_PREFERENCES.retentionDays
  const safeRetentionDays = clampRetentionDays(retentionDays)
  const minDayKey = computeRetentionCutoffDayKey({
    retentionDays: safeRetentionDays,
    nowUnixSeconds,
  })

  const [startDayKey, setStartDayKey] = useState<string>("")
  const [endDayKey, setEndDayKey] = useState<string>("")

  const defaultStartDayKey = subtractDaysFromDayKey(
    maxDayKey,
    Math.min(DEFAULT_RANGE_DAYS, safeRetentionDays) - 1,
  )
  const effectiveRange = useMemo(() => {
    const clamp = (day: string) =>
      day < minDayKey ? minDayKey : day > maxDayKey ? maxDayKey : day
    const end = clamp(endDayKey || maxDayKey)
    const start = clamp(
      startDayKey || (endDayKey ? minDayKey : defaultStartDayKey),
    )
    return { startDayKey: start > end ? end : start, endDayKey: end }
  }, [defaultStartDayKey, endDayKey, maxDayKey, minDayKey, startDayKey])

  const hasActiveFilters =
    selectedTagIds.length > 0 ||
    selectedAccountIds.length > 0 ||
    effectiveRange.startDayKey !== defaultStartDayKey ||
    effectiveRange.endDayKey !== maxDayKey

  const activeQuickRangeId =
    endDayKey === maxDayKey
      ? QUICK_RANGES.find(
          ({ days }) =>
            days <= safeRetentionDays &&
            startDayKey === subtractDaysFromDayKey(maxDayKey, days - 1),
        )?.id
      : undefined

  const applyQuickRange = (days: number) => {
    setEndDayKey(maxDayKey)
    setStartDayKey(
      subtractDaysFromDayKey(maxDayKey, Math.min(days, safeRetentionDays) - 1),
    )
  }

  const resetFilters = () => {
    setSelectedTagIds([])
    setSelectedAccountIds([])
    applyQuickRange(DEFAULT_RANGE_DAYS)
  }

  // Initialize the date range once we know the retention window.
  useEffect(() => {
    if (startDayKey || endDayKey) {
      return
    }

    setEndDayKey(maxDayKey)
    setStartDayKey(defaultStartDayKey)
  }, [defaultStartDayKey, endDayKey, maxDayKey, startDayKey])

  // Keep manually entered dates in sync with the bounded range used by reports.
  useEffect(() => {
    if (startDayKey && startDayKey !== effectiveRange.startDayKey)
      setStartDayKey(effectiveRange.startDayKey)
    if (endDayKey && endDayKey !== effectiveRange.endDayKey)
      setEndDayKey(effectiveRange.endDayKey)
  }, [effectiveRange, endDayKey, startDayKey])

  const exchangeRateByAccountId = useMemo(() => {
    return new Map(
      accounts.map((account) => [account.id, account.exchange_rate]),
    )
  }, [accounts])

  const currencySymbol = getCurrencySymbol(currencyType)
  const legacyReferenceRates = effectiveAccountIds.map((accountId) => {
    const storedRate = exchangeRateByAccountId.get(accountId)
    return {
      accountId,
      label: accountDisplayLabelById.get(accountId) ?? accountId,
      rate:
        typeof storedRate === "number" &&
        Number.isFinite(storedRate) &&
        storedRate > 0
          ? storedRate
          : DEFAULT_USD_TO_CNY_RATE,
    }
  })

  const handleCurrencyChange = useCallback(
    (next: CurrencyType) => {
      if (next === currencyType) return
      if (preview) {
        setPreviewCurrency(next)
        return
      }
      void updateCurrencyType(next)
    },
    [currencyType, preview, updateCurrencyType],
  )

  const formatAxisMoneyValue = useCallback(
    (value: number | string, _index: number): string => {
      void _index
      const numeric = typeof value === "number" ? value : Number(value)
      if (!Number.isFinite(numeric)) return ""
      return formatMoneyFixed(numeric)
    },
    [],
  )

  const formatTooltipMoneyValue = useCallback(
    (value: number | string, _dataIndex: number): string => {
      void _dataIndex
      if (typeof value === "string" && value.trim() === "") return "—"
      const numeric = typeof value === "number" ? value : Number(value)
      if (!Number.isFinite(numeric)) return "-"
      return `${currencySymbol}${formatMoneyFixed(numeric)}`
    },
    [currencySymbol],
  )

  const accountOptions = useMemo(() => {
    const selected = new Set(selectedAccountIds)
    const hasStore = Boolean(store)

    const dayKeys = listDayKeysInRange({
      startDayKey: effectiveRange.startDayKey,
      endDayKey: effectiveRange.endDayKey,
    })
    const accountIds = accountsForSelectedTags.map((account) => account.id)
    const financialAccountIds = new Set([
      ...buildFinancialHistorySeries({
        store,
        asOf,
        accountIds,
        startDayKey: effectiveRange.startDayKey,
        endDayKey: effectiveRange.endDayKey,
      }).series.map((series) => series.accountId),
      ...buildFinancialHistoryActivity({
        store,
        asOf,
        accountIds,
        dayKeys,
      }).map((activity) => activity.accountId),
    ])

    type SortableOption = {
      option: {
        value: string
        label: string
        title: string
        disabled?: boolean
      }
      baseName: string
      username: string
      isSelected: boolean
      hasData: boolean
    }

    const sortable: SortableOption[] = accountsForSelectedTags.map(
      (account) => {
        const label = accountDisplayLabelById.get(account.id) ?? account.id
        const perDay = store?.referenceSnapshotsByAccountId?.[account.id]

        let snapshotDays = 0
        if (perDay) {
          for (const dayKey of dayKeys) {
            if (perDay[dayKey]) snapshotDays += 1
          }
        }

        const hasFinancialData = financialAccountIds.has(account.id)
        const hasSnapshotData = snapshotDays > 0 || hasFinancialData
        const isSelected = selected.has(account.id)
        const noDataInRange = hasStore && !hasSnapshotData

        const titleLines = [
          ...(noDataInRange ? [t("filters.noDataInRange")] : []),
          account.site_name,
          account.account_info.username,
          account.site_url,
          account.site_type,
        ]

        return {
          option: {
            value: account.id,
            label,
            title: titleLines.join("\n"),
            disabled: noDataInRange && !isSelected,
          },
          baseName: account.site_name,
          username: account.account_info.username,
          isSelected,
          hasData: !hasStore || hasSnapshotData,
        }
      },
    )

    sortable.sort((a, b) => {
      if (a.isSelected !== b.isSelected) return a.isSelected ? -1 : 1
      if (a.hasData !== b.hasData) return a.hasData ? -1 : 1
      return compareAccountDisplayNames(
        {
          id: a.option.value,
          name: a.option.label,
          baseName: a.baseName,
          username: a.username,
        },
        {
          id: b.option.value,
          name: b.option.label,
          baseName: b.baseName,
          username: b.username,
        },
      )
    })

    return sortable.map((item) => item.option)
  }, [
    asOf,
    accountDisplayLabelById,
    accountsForSelectedTags,
    effectiveRange.endDayKey,
    effectiveRange.startDayKey,
    selectedAccountIds,
    store,
    t,
  ])

  // Keep the breakdown reference day within the currently selected range.
  useEffect(() => {
    if (!breakdownBalanceDayKey) return

    let next = breakdownBalanceDayKey
    if (next < effectiveRange.startDayKey) next = effectiveRange.startDayKey
    if (next > effectiveRange.endDayKey) next = effectiveRange.endDayKey

    if (next !== breakdownBalanceDayKey) setBreakdownBalanceDayKey(next)
  }, [
    breakdownBalanceDayKey,
    effectiveRange.endDayKey,
    effectiveRange.startDayKey,
  ])

  const {
    financialHistory,
    perAccountSeries,
    totalTrendValues,
    totalTrendCoverageSummary,
    trendOption,
    nativeTrendPresentation,
    nativeTrendCanSum,
    breakdownData,
    breakdownReferenceDayKey,
    breakdownOption,
    overviewTotals,
    tableRows,
    nativeMetrics,
    nativeBalanceMetrics,
    nativeTrendMetrics,
    nativeActivity,
    nativeTrend,
    nativeBreakdown,
    hasReferenceBalance,
    referenceMetrics,
  } = useBalanceHistoryReporting({
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
  })

  const visibleNativeMetric = (value: string): BalanceHistoryVisibleMetric => {
    const option = nativeMetrics.find(({ key }) => key === value)
    if (option && "estimated" in option && option.estimated)
      return DAILY_BALANCE_HISTORY_METRICS.EstimatedIncome
    if (option?.kind === FINANCIAL_METRIC_KINDS.Income)
      return DAILY_BALANCE_HISTORY_METRICS.Income
    if (option?.kind === FINANCIAL_METRIC_KINDS.Consumption)
      return DAILY_BALANCE_HISTORY_METRICS.Outcome
    if (option?.kind === FINANCIAL_METRIC_KINDS.Change)
      return DAILY_BALANCE_HISTORY_METRICS.Net
    return DAILY_BALANCE_HISTORY_METRICS.Balance
  }
  const selectTrendMetric = (value: string) => {
    if (value.startsWith("native:")) {
      setTrendBalanceKey(value)
      setTrendMetric(visibleNativeMetric(value))
    } else {
      setTrendBalanceKey(value.startsWith("reference:") ? value : null)
      setTrendMetric(
        value.replace(/^reference:/, "") as BalanceHistoryVisibleMetric,
      )
    }
  }
  const selectBreakdownMetric = (value: string) => {
    if (value.startsWith("native:")) {
      setBreakdownBalanceKey(value)
      setBreakdownMetric(visibleNativeMetric(value))
    } else {
      setBreakdownBalanceKey(value.startsWith("reference:") ? value : null)
      setBreakdownMetric(
        value.replace(/^reference:/, "") as BalanceHistoryVisibleMetric,
      )
    }
  }

  useEffect(() => {
    if (
      breakdownChartType === BALANCE_HISTORY_BREAKDOWN_CHART_TYPES.Pie &&
      breakdownData.entries.length > 1 &&
      !breakdownData.canUsePie
    ) {
      setBreakdownChartType(BALANCE_HISTORY_TREND_CHART_TYPES.Bar)
    }
  }, [
    breakdownChartType,
    breakdownData.entries.length,
    breakdownData.canUsePie,
  ])

  const enabled =
    Boolean(preview) ||
    (preferences.balanceHistory?.enabled ??
      DEFAULT_BALANCE_HISTORY_PREFERENCES.enabled)
  const endOfDayCaptureEnabled =
    preferences.balanceHistory?.endOfDayCapture?.enabled ?? false

  const shouldShowCashflowWarning =
    !preview &&
    enabled &&
    (preferences.showTodayCashflow ?? true) === false &&
    !endOfDayCaptureEnabled

  const hasStoredFinancialHistory = Object.values(
    store?.financialSnapshotsByAccountId ?? {},
  ).some((snapshots) => snapshots.length > 0)
  const isStoreEmpty =
    !hasStoredFinancialHistory &&
    ((store?.referenceSnapshotsByAccountId
      ? Object.keys(store.referenceSnapshotsByAccountId).length === 0
      : true) as boolean)
  const hasFinancialHistory = financialHistory.series.length > 0

  const snapshotCompleteDays = useMemo(() => {
    const totals = perAccountSeries.coverageByDay.reduce(
      (acc, item) => {
        if (item.snapshotAccounts === item.totalAccounts)
          acc.snapshotComplete += 1
        if (item.cashflowAccounts === item.totalAccounts)
          acc.cashflowComplete += 1
        return acc
      },
      { snapshotComplete: 0, cashflowComplete: 0 },
    )
    return totals
  }, [perAccountSeries.coverageByDay])

  const snapshotAvailableDays = useMemo(() => {
    return perAccountSeries.coverageByDay.reduce(
      (acc, item) => acc + (item.snapshotAccounts > 0 ? 1 : 0),
      0,
    )
  }, [perAccountSeries.coverageByDay])

  const cashflowAvailableDays = useMemo(() => {
    return perAccountSeries.coverageByDay.reduce(
      (acc, item) => acc + (item.cashflowAccounts > 0 ? 1 : 0),
      0,
    )
  }, [perAccountSeries.coverageByDay])

  const incomeAvailableDays = useMemo(() => {
    return perAccountSeries.coverageByDay.reduce(
      (acc, item) => acc + (item.incomeAccounts > 0 ? 1 : 0),
      0,
    )
  }, [perAccountSeries.coverageByDay])

  const outcomeAvailableDays = useMemo(() => {
    return perAccountSeries.coverageByDay.reduce(
      (acc, item) => acc + (item.outcomeAccounts > 0 ? 1 : 0),
      0,
    )
  }, [perAccountSeries.coverageByDay])

  const estimatedIncomeAvailableDays = useMemo(() => {
    return perAccountSeries.coverageByDay.reduce(
      (acc, item) => acc + (item.estimatedIncomeAccounts > 0 ? 1 : 0),
      0,
    )
  }, [perAccountSeries.coverageByDay])

  const hasAnyPerAccountTrendMetricData =
    effectiveTrendMetric === DAILY_BALANCE_HISTORY_METRICS.Balance
      ? snapshotAvailableDays > 0
      : effectiveTrendMetric === DAILY_BALANCE_HISTORY_METRICS.EstimatedIncome
        ? estimatedIncomeAvailableDays > 0
        : effectiveTrendMetric === DAILY_BALANCE_HISTORY_METRICS.Income
          ? incomeAvailableDays > 0
          : effectiveTrendMetric === DAILY_BALANCE_HISTORY_METRICS.Outcome
            ? outcomeAvailableDays > 0
            : cashflowAvailableDays > 0

  const hasAnyTotalTrendMetricData = useMemo(() => {
    return totalTrendValues.some(
      (value) => typeof value === "number" && Number.isFinite(value),
    )
  }, [totalTrendValues])

  const hasAnyTrendMetricData = nativeTrend
    ? true
    : trendScope === BALANCE_HISTORY_TREND_SERIES_SCOPES.Total
      ? hasAnyTotalTrendMetricData
      : hasAnyPerAccountTrendMetricData

  const shouldShowIncompleteTotalHint =
    !nativeTrend &&
    trendScope === BALANCE_HISTORY_TREND_SERIES_SCOPES.Total &&
    hasAnyTotalTrendMetricData &&
    totalTrendCoverageSummary.partialDays > 0 &&
    totalTrendCoverageSummary.totalAccounts > 1

  const isInitialLoading =
    isLoading && accounts.length === 0 && store === null && tagStore === null

  // When balance history capture is disabled and no snapshots exist yet,
  // show a clear CTA instead of rendering filters + an empty state.
  const shouldShowEnableBalanceHistoryHint = !enabled && !isInitialLoading

  return {
    loadError,
    retryLoad,
    hasLoadedData,
    financialHistory,
    hasFinancialHistory,
    accountDisplayLabelById,
    legacyReferenceRates,
    isInitialLoading,
    handleRefreshNow,
    handlePruneNow,
    shouldShowCashflowWarning,
    shouldShowEnableBalanceHistoryHint,
    openBalanceHistorySettings,
    tagOptions,
    selectedTagIds,
    setSelectedTagIds,
    accountOptions,
    selectedAccountIds,
    setSelectedAccountIds,
    currencyType,
    handleCurrencyChange,
    safeRetentionDays,
    activeQuickRangeId,
    applyQuickRange,
    hasActiveFilters,
    resetFilters,
    effectiveAccountCount: effectiveAccountIds.length,
    startDayKey,
    minDayKey,
    maxDayKey,
    setStartDayKey,
    endDayKey,
    setEndDayKey,
    snapshotAvailableDays,
    snapshotCompleteDays,
    cashflowAvailableDays,
    perAccountSeries,
    isStoreEmpty,
    overviewTotals,
    currencySymbol,
    effectiveBreakdownMetric,
    setBreakdownMetric,
    estimatedTodayIncomeEnabled,
    breakdownData,
    breakdownChartType,
    setBreakdownChartType,
    breakdownBalanceDayKey: breakdownReferenceDayKey,
    effectiveRange,
    setBreakdownBalanceDayKey,
    breakdownOption,
    effectiveTrendMetric,
    setTrendMetric,
    trendScope,
    setTrendScope,
    trendChartType,
    setTrendChartType,
    hasAnyTrendMetricData,
    trendOption,
    nativeTrendPresentation,
    nativeTrendCanSum,
    shouldShowIncompleteTotalHint,
    totalTrendCoverageSummary,
    tableRows,
    nativeMetrics,
    nativeBalanceMetrics,
    nativeTrendMetrics,
    nativeActivity,
    nativeTrend,
    nativeBreakdown,
    hasReferenceBalance,
    referenceMetrics,
    selectTrendMetric,
    selectBreakdownMetric,
    isLoading,
  }
}
