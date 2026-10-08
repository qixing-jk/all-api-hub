import { useCallback, useEffect, useMemo, useState } from "react"
import { useTranslation } from "react-i18next"

import { BASIC_SETTINGS_TAB_IDS } from "~/constants/basicSettingsTabs"
import { MENU_ITEM_IDS } from "~/constants/optionsMenuIds"
import { SETTINGS_ANCHORS } from "~/constants/settingsAnchors"
import { useUserPreferencesContext } from "~/contexts/UserPreferencesContext"
import {
  BALANCE_HISTORY_BREAKDOWN_CHART_TYPES,
  BALANCE_HISTORY_TREND_SERIES_SCOPES,
  type BalanceHistoryBreakdownChartType,
  type BalanceHistoryTrendSeriesScope,
  type BalanceHistoryVisibleMetric,
} from "~/features/BalanceHistory/contracts"
import { useBalanceHistoryData } from "~/features/BalanceHistory/data/useBalanceHistoryData"
import { type BalanceHistoryTrendChartType } from "~/features/BalanceHistory/reporting/echartsOptions"
import { useBalanceHistoryReporting } from "~/features/BalanceHistory/reporting/useBalanceHistoryReporting"
import {
  buildAccountDisplayNameMap,
  compareAccountDisplayNames,
} from "~/services/accounts/utils/accountDisplayName"
import {
  computeRetentionCutoffDayKey,
  listDayKeysInRange,
} from "~/services/history/dailyBalanceHistory/dayKeys"
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
  return metric === "estimatedIncome" && !estimatedTodayIncomeEnabled
    ? "income"
    : metric
}

/**
 * Clamp a retention-days value coming from user preferences or input.
 */
function clampRetentionDays(value: unknown): number {
  return clampBalanceHistoryRetentionDays(value)
}

/** Compose history query state and report facts for the options view. */
export function useBalanceHistoryViewModel() {
  const { t } = useTranslation("balanceHistory")

  const { preferences, currencyType, updateCurrencyType } =
    useUserPreferencesContext()
  const estimatedTodayIncomeEnabled =
    preferences.balanceHistory?.estimatedTodayIncome?.enabled === true

  const [selectedTagIds, setSelectedTagIds] = useState<string[]>([])
  const [selectedAccountIds, setSelectedAccountIds] = useState<string[]>([])
  const {
    accounts,
    tagStore,
    store,
    isLoading,
    handleRefreshNow,
    handlePruneNow,
  } = useBalanceHistoryData(selectedAccountIds)

  const [trendMetric, setTrendMetric] =
    useState<BalanceHistoryVisibleMetric>("balance")
  const [trendChartType, setTrendChartType] =
    useState<BalanceHistoryTrendChartType>("line")
  const [trendScope, setTrendScope] = useState<BalanceHistoryTrendSeriesScope>(
    BALANCE_HISTORY_TREND_SERIES_SCOPES.Accounts,
  )

  const [breakdownMetric, setBreakdownMetric] =
    useState<BalanceHistoryVisibleMetric>("balance")
  const [breakdownChartType, setBreakdownChartType] =
    useState<BalanceHistoryBreakdownChartType>(
      BALANCE_HISTORY_BREAKDOWN_CHART_TYPES.Pie,
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
    if (!estimatedTodayIncomeEnabled && trendMetric === "estimatedIncome") {
      setTrendMetric("income")
    }
  }, [estimatedTodayIncomeEnabled, trendMetric])

  useEffect(() => {
    if (!estimatedTodayIncomeEnabled && breakdownMetric === "estimatedIncome") {
      setBreakdownMetric("income")
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

  // Initialize the date range once we know the retention window.
  useEffect(() => {
    if (startDayKey || endDayKey) {
      return
    }

    const defaultDays = Math.min(30, safeRetentionDays)
    setEndDayKey(maxDayKey)
    setStartDayKey(subtractDaysFromDayKey(maxDayKey, defaultDays - 1))
  }, [endDayKey, maxDayKey, safeRetentionDays, startDayKey])

  // Initialize the breakdown reference day once the range is ready.
  useEffect(() => {
    if (breakdownBalanceDayKey || !endDayKey) return
    setBreakdownBalanceDayKey(endDayKey)
  }, [breakdownBalanceDayKey, endDayKey])

  // Clamp the range when retention changes or when the user types an out-of-bounds date.
  useEffect(() => {
    if (!startDayKey || !endDayKey) return

    let nextStart = startDayKey
    let nextEnd = endDayKey

    if (nextStart < minDayKey) nextStart = minDayKey
    if (nextEnd > maxDayKey) nextEnd = maxDayKey
    if (nextStart > nextEnd) nextStart = nextEnd

    if (nextStart !== startDayKey) setStartDayKey(nextStart)
    if (nextEnd !== endDayKey) setEndDayKey(nextEnd)
  }, [endDayKey, maxDayKey, minDayKey, startDayKey])

  const exchangeRateByAccountId = useMemo(() => {
    return new Map(
      accounts.map((account) => [account.id, account.exchange_rate]),
    )
  }, [accounts])

  const currencySymbol = getCurrencySymbol(currencyType)

  const handleCurrencyChange = useCallback(
    (next: CurrencyType) => {
      if (next === currencyType) return
      void updateCurrencyType(next)
    },
    [currencyType, updateCurrencyType],
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
      const numeric = typeof value === "number" ? value : Number(value)
      if (!Number.isFinite(numeric)) return "-"
      return `${currencySymbol}${formatMoneyFixed(numeric)}`
    },
    [currencySymbol],
  )

  const effectiveRange = useMemo(() => {
    return {
      startDayKey: startDayKey || minDayKey,
      endDayKey: endDayKey || maxDayKey,
    }
  }, [endDayKey, maxDayKey, minDayKey, startDayKey])

  const accountOptions = useMemo(() => {
    const selected = new Set(selectedAccountIds)
    const hasStore = Boolean(store)

    const dayKeys = listDayKeysInRange({
      startDayKey: effectiveRange.startDayKey,
      endDayKey: effectiveRange.endDayKey,
    })

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
        const perDay = store?.snapshotsByAccountId?.[account.id]

        let snapshotDays = 0
        if (perDay) {
          for (const dayKey of dayKeys) {
            if (perDay[dayKey]) snapshotDays += 1
          }
        }

        const hasSnapshotData = snapshotDays > 0
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
    perAccountSeries,
    totalTrendValues,
    totalTrendCoverageSummary,
    trendOption,
    breakdownData,
    breakdownOption,
    overviewTotals,
    tableRows,
  } = useBalanceHistoryReporting({
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
  })

  useEffect(() => {
    if (breakdownChartType === "pie" && breakdownData.hasNegativeValues) {
      setBreakdownChartType("bar")
    }
  }, [breakdownChartType, breakdownData.hasNegativeValues])

  const enabled =
    preferences.balanceHistory?.enabled ??
    DEFAULT_BALANCE_HISTORY_PREFERENCES.enabled
  const endOfDayCaptureEnabled =
    preferences.balanceHistory?.endOfDayCapture?.enabled ?? false

  const shouldShowCashflowWarning =
    enabled &&
    (preferences.showTodayCashflow ?? true) === false &&
    !endOfDayCaptureEnabled

  const isStoreEmpty = (
    store?.snapshotsByAccountId
      ? Object.keys(store.snapshotsByAccountId).length === 0
      : true
  ) as boolean

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
    effectiveTrendMetric === "balance"
      ? snapshotAvailableDays > 0
      : effectiveTrendMetric === "estimatedIncome"
        ? estimatedIncomeAvailableDays > 0
        : effectiveTrendMetric === "income"
          ? incomeAvailableDays > 0
          : effectiveTrendMetric === "outcome"
            ? outcomeAvailableDays > 0
            : cashflowAvailableDays > 0

  const hasAnyTotalTrendMetricData = useMemo(() => {
    return totalTrendValues.some(
      (value) => typeof value === "number" && Number.isFinite(value),
    )
  }, [totalTrendValues])

  const hasAnyTrendMetricData =
    trendScope === "total"
      ? hasAnyTotalTrendMetricData
      : hasAnyPerAccountTrendMetricData

  const shouldShowIncompleteTotalHint =
    trendScope === "total" &&
    hasAnyTotalTrendMetricData &&
    totalTrendCoverageSummary.partialDays > 0 &&
    totalTrendCoverageSummary.totalAccounts > 1

  const isInitialLoading =
    isLoading && accounts.length === 0 && store === null && tagStore === null

  // When balance history capture is disabled and no snapshots exist yet,
  // show a clear CTA instead of rendering filters + an empty state.
  const shouldShowEnableBalanceHistoryHint = !enabled && !isInitialLoading

  return {
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
    breakdownBalanceDayKey,
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
    shouldShowIncompleteTotalHint,
    totalTrendCoverageSummary,
    tableRows,
    isLoading,
  }
}
