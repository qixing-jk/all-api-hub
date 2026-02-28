import {
  ChevronDown,
  LineChart,
  RefreshCcw,
  Scissors,
  Settings,
} from "lucide-react"
import { useCallback, useEffect, useMemo, useState } from "react"
import toast from "react-hot-toast"
import { useTranslation } from "react-i18next"

import { EChart } from "~/components/charts/EChart"
import {
  Alert,
  Button,
  Card,
  Input,
  Label,
  TagFilter,
  ToggleButton,
} from "~/components/ui"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "~/components/ui/dropdown-menu"
import { ANIMATIONS, COLORS } from "~/constants/designTokens"
import { MENU_ITEM_IDS } from "~/constants/optionsMenuIds"
import { RuntimeActionIds } from "~/constants/runtimeActions"
import { useTheme } from "~/contexts/ThemeContext"
import { useUserPreferencesContext } from "~/contexts/UserPreferencesContext"
import { PageHeader } from "~/entrypoints/options/components/PageHeader"
import { accountStorage } from "~/services/accounts/accountStorage"
import {
  computeRetentionCutoffDayKey,
  getDayKeyFromUnixSeconds,
  listDayKeysInRange,
  subtractDaysFromDayKey,
} from "~/services/history/dailyBalanceHistory/dayKeys"
import {
  buildAccountRangeSummaries,
  buildPerAccountDailyBalanceMoneySeries,
  type DailyBalanceHistoryMetric,
} from "~/services/history/dailyBalanceHistory/selectors"
import { dailyBalanceHistoryStorage } from "~/services/history/dailyBalanceHistory/storage"
import { clampBalanceHistoryRetentionDays } from "~/services/history/dailyBalanceHistory/utils"
import { tagStorage } from "~/services/tags/tagStorage"
import { listTagsSorted } from "~/services/tags/tagStoreUtils"
import type { CurrencyType, SiteAccount, TagStore } from "~/types"
import { DEFAULT_BALANCE_HISTORY_PREFERENCES } from "~/types/dailyBalanceHistory"
import type { DailyBalanceHistoryStore } from "~/types/dailyBalanceHistory"
import { sendRuntimeMessage } from "~/utils/browserApi"
import { getErrorMessage } from "~/utils/error"
import { getCurrencySymbol } from "~/utils/formatters"
import { createLogger } from "~/utils/logger"
import { formatMoneyFixed } from "~/utils/money"
import { navigateWithinOptionsPage } from "~/utils/navigation"

import BalanceHistoryAccountSummaryTable, {
  type BalanceHistoryAccountSummaryRow,
} from "./components/BalanceHistoryAccountSummaryTable"
import {
  buildAccountBreakdownBarOption,
  buildAccountBreakdownPieOption,
  buildMultiSeriesTrendOption,
  type BalanceHistoryTrendChartType,
} from "./echartsOptions"

const logger = createLogger("BalanceHistoryPage")

const QUICK_RANGES = [
  { id: "7d", days: 7 },
  { id: "30d", days: 30 },
  { id: "90d", days: 90 },
  { id: "180d", days: 180 },
  { id: "365d", days: 365 },
] as const

type BalanceHistoryBreakdownChartType = "pie" | "bar"
type BalanceHistoryTrendSeriesScope = "accounts" | "total"

/**
 * Clamp a retention-days value coming from user preferences or input.
 */
function clampRetentionDays(value: unknown): number {
  return clampBalanceHistoryRetentionDays(value)
}

/**
 * Balance History options page that visualizes daily balance snapshots.
 */
export default function BalanceHistory() {
  const { t } = useTranslation("balanceHistory")
  const { resolvedTheme } = useTheme()
  const isDark = resolvedTheme === "dark"

  const { preferences, currencyType, updateCurrencyType } =
    useUserPreferencesContext()

  const [accounts, setAccounts] = useState<SiteAccount[]>([])
  const [tagStore, setTagStore] = useState<TagStore | null>(null)
  const [store, setStore] = useState<DailyBalanceHistoryStore | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  const [selectedTagIds, setSelectedTagIds] = useState<string[]>([])
  const [selectedAccountIds, setSelectedAccountIds] = useState<string[]>([])

  const [trendMetric, setTrendMetric] =
    useState<DailyBalanceHistoryMetric>("balance")
  const [trendChartType, setTrendChartType] =
    useState<BalanceHistoryTrendChartType>("line")
  const [trendScope, setTrendScope] =
    useState<BalanceHistoryTrendSeriesScope>("accounts")

  const [breakdownMetric, setBreakdownMetric] =
    useState<DailyBalanceHistoryMetric>("balance")
  const [breakdownChartType, setBreakdownChartType] =
    useState<BalanceHistoryBreakdownChartType>("pie")
  const [breakdownBalanceDayKey, setBreakdownBalanceDayKey] =
    useState<string>("")

  const loadData = useCallback(async () => {
    try {
      setIsLoading(true)
      const [nextAccounts, nextStore, nextTagStore] = await Promise.all([
        accountStorage.getEnabledAccounts(),
        dailyBalanceHistoryStorage.getStore(),
        tagStorage.getTagStore(),
      ])
      setAccounts(nextAccounts)
      setStore(nextStore)
      setTagStore(nextTagStore)
    } catch (error) {
      logger.error("Failed to load data", error)
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadData()
  }, [loadData])

  const handleRefreshNow = useCallback(async () => {
    let toastId: string | undefined
    try {
      toastId = toast.loading(t("messages.loading.refreshing"))
      const response = await sendRuntimeMessage({
        action: RuntimeActionIds.BalanceHistoryRefreshNow,
        ...(selectedAccountIds.length
          ? { accountIds: selectedAccountIds }
          : {}),
      })

      if (!response?.success) {
        throw new Error(response?.error || "Unknown error")
      }

      toast.success(t("messages.success.refreshCompleted"), { id: toastId })
      await loadData()
    } catch (error) {
      toast.error(
        t("messages.error.refreshFailed", { error: getErrorMessage(error) }),
        { id: toastId },
      )
    }
  }, [loadData, selectedAccountIds, t])

  const handlePruneNow = useCallback(async () => {
    let toastId: string | undefined
    try {
      toastId = toast.loading(t("messages.loading.pruning"))
      const response = await sendRuntimeMessage({
        action: RuntimeActionIds.BalanceHistoryPrune,
      })

      if (!response?.success) {
        throw new Error(response?.error || "Unknown error")
      }

      toast.success(t("messages.success.pruneCompleted"), { id: toastId })
      await loadData()
    } catch (error) {
      toast.error(
        t("messages.error.pruneFailed", { error: getErrorMessage(error) }),
        { id: toastId },
      )
    }
  }, [loadData, t])

  const openBalanceHistorySettings = useCallback(() => {
    navigateWithinOptionsPage(`#${MENU_ITEM_IDS.BASIC}`, {
      tab: "balanceHistory",
      anchor: "balance-history",
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

  const accountDisplayLabelById = useMemo(() => {
    const getSiteHost = (value: string) => {
      try {
        return new URL(value).host
      } catch {
        return value
      }
    }

    const shortenUsername = (value: string) => {
      const trimmed = value.trim()
      if (!trimmed) return trimmed

      const atIndex = trimmed.indexOf("@")
      const base = atIndex > 0 ? trimmed.slice(0, atIndex) : trimmed
      const maxLength = 18
      return base.length <= maxLength
        ? base
        : `${base.slice(0, maxLength - 1)}…`
    }

    const siteKeyCounts = new Map<string, number>()
    for (const account of accountsForSelectedTags) {
      const siteKey = account.site_url
      siteKeyCounts.set(siteKey, (siteKeyCounts.get(siteKey) ?? 0) + 1)
    }

    const labelById = new Map<string, string>()
    for (const account of accountsForSelectedTags) {
      const needsAccountName = (siteKeyCounts.get(account.site_url) ?? 0) > 1
      const label = needsAccountName
        ? `${account.site_name} (${shortenUsername(account.account_info.username)})`
        : account.site_name
      labelById.set(account.id, label)
    }

    const labelCounts = new Map<string, number>()
    for (const label of labelById.values()) {
      labelCounts.set(label, (labelCounts.get(label) ?? 0) + 1)
    }

    for (const account of accountsForSelectedTags) {
      const label = labelById.get(account.id)
      if (!label) continue
      if ((labelCounts.get(label) ?? 0) <= 1) continue
      labelById.set(account.id, `${label} · ${getSiteHost(account.site_url)}`)
    }

    const disambiguationCounts = new Map<string, number>()
    for (const label of labelById.values()) {
      disambiguationCounts.set(
        label,
        (disambiguationCounts.get(label) ?? 0) + 1,
      )
    }

    if (Array.from(disambiguationCounts.values()).some((count) => count > 1)) {
      const duplicatesByLabel = new Map<string, string[]>()
      for (const [accountId, label] of labelById.entries()) {
        if ((disambiguationCounts.get(label) ?? 0) <= 1) continue
        const list = duplicatesByLabel.get(label) ?? []
        list.push(accountId)
        duplicatesByLabel.set(label, list)
      }

      for (const [label, accountIds] of duplicatesByLabel.entries()) {
        const sorted = [...accountIds].sort()
        for (let index = 0; index < sorted.length; index += 1) {
          const accountId = sorted[index]
          if (!accountId) continue
          labelById.set(accountId, `${label} #${index + 1}`)
        }
      }
    }

    return labelById
  }, [accountsForSelectedTags])

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
          isSelected,
          hasData: !hasStore || hasSnapshotData,
        }
      },
    )

    sortable.sort((a, b) => {
      if (a.isSelected !== b.isSelected) return a.isSelected ? -1 : 1
      if (a.hasData !== b.hasData) return a.hasData ? -1 : 1
      return a.option.label.localeCompare(b.option.label)
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

  const perAccountSeries = useMemo(() => {
    return buildPerAccountDailyBalanceMoneySeries({
      store,
      accountIds: effectiveAccountIds,
      startDayKey: effectiveRange.startDayKey,
      endDayKey: effectiveRange.endDayKey,
      currencyType,
      exchangeRateByAccountId,
    })
  }, [
    currencyType,
    effectiveAccountIds,
    effectiveRange.endDayKey,
    effectiveRange.startDayKey,
    exchangeRateByAccountId,
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
          perAccountSeries.seriesByAccountId[accountId]?.[trendMetric]?.[index]

        if (typeof value !== "number" || !Number.isFinite(value)) continue
        covered += 1
        sum += value
      }

      totals[index] = covered > 0 ? sum : null
    }

    return totals
  }, [
    effectiveAccountIds,
    perAccountSeries.dayKeys,
    perAccountSeries.seriesByAccountId,
    trendMetric,
  ])

  const totalTrendCoverageSummary = useMemo(() => {
    const totalAccounts = effectiveAccountIds.length

    const coverageCounts = perAccountSeries.coverageByDay.map((coverage) => {
      return trendMetric === "balance"
        ? coverage.snapshotAccounts
        : coverage.cashflowAccounts
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
  }, [effectiveAccountIds.length, perAccountSeries.coverageByDay, trendMetric])

  const rangeSummaries = useMemo(() => {
    return buildAccountRangeSummaries({
      store,
      accountIds: effectiveAccountIds,
      startDayKey: effectiveRange.startDayKey,
      endDayKey: effectiveRange.endDayKey,
      currencyType,
      exchangeRateByAccountId,
    })
  }, [
    currencyType,
    effectiveAccountIds,
    effectiveRange.endDayKey,
    effectiveRange.startDayKey,
    exchangeRateByAccountId,
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
        perAccountSeries.seriesByAccountId[accountId]?.[trendMetric] ??
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
    perAccountSeries.dayKeys,
    perAccountSeries.seriesByAccountId,
    t,
    totalTrendValues,
    trendMetric,
    trendScope,
  ])

  const trendOption = useMemo(() => {
    const metricLabel = t(`metrics.${trendMetric}`)
    return buildMultiSeriesTrendOption({
      dayKeys: perAccountSeries.dayKeys,
      series: trendSeries,
      chartType: trendChartType,
      yAxisLabel: `${metricLabel} (${currencySymbol})`,
      isDark,
      axisLabelFormatter: formatAxisMoneyValue,
      valueFormatter: formatTooltipMoneyValue,
    })
  }, [
    currencySymbol,
    formatAxisMoneyValue,
    formatTooltipMoneyValue,
    isDark,
    perAccountSeries.dayKeys,
    t,
    trendChartType,
    trendMetric,
    trendSeries,
  ])

  const breakdownData = useMemo(() => {
    const entries: Array<{ name: string; value: number }> = []

    if (breakdownMetric === "balance") {
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
          breakdownMetric === "income"
            ? summary.incomeTotal
            : breakdownMetric === "outcome"
              ? summary.outcomeTotal
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
    breakdownMetric,
    effectiveAccountIds,
    effectiveRange.endDayKey,
    perAccountSeries.dayKeys,
    perAccountSeries.seriesByAccountId,
    rangeSummaries.summaries,
  ])

  useEffect(() => {
    if (breakdownChartType === "pie" && breakdownData.hasNegativeValues) {
      setBreakdownChartType("bar")
    }
  }, [breakdownChartType, breakdownData.hasNegativeValues])

  const breakdownOption = useMemo(() => {
    if (!breakdownData.values.length) return null

    const valueLabel = `${t(`metrics.${breakdownMetric}`)} (${currencySymbol})`

    return breakdownChartType === "pie"
      ? buildAccountBreakdownPieOption({
          categories: breakdownData.categories,
          values: breakdownData.values,
          valueLabel,
          isDark,
          valueFormatter: formatTooltipMoneyValue,
        })
      : buildAccountBreakdownBarOption({
          categories: breakdownData.categories,
          values: breakdownData.values,
          valueLabel,
          isDark,
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
    isDark,
    t,
    breakdownMetric,
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
      outcomeTotal: summary.outcomeTotal,
      snapshotDays: summary.snapshotDays,
      cashflowDays: summary.cashflowDays,
      totalDays: summary.totalDays,
    }))
  }, [accountDisplayLabelById, rangeSummaries.summaries])

  const enabled = preferences.balanceHistory?.enabled ?? false
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

  const hasAnyPerAccountTrendMetricData =
    trendMetric === "balance"
      ? snapshotAvailableDays > 0
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

  // When balance history capture is disabled and no snapshots exist yet,
  // show a clear CTA instead of rendering filters + an empty state.
  const shouldShowEnableBalanceHistoryHint = !enabled && !isLoading

  return (
    <div className="space-y-6 p-6">
      <PageHeader
        icon={LineChart}
        title={t("title")}
        description={t("description")}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Button
              size="sm"
              variant="secondary"
              onClick={() => void handleRefreshNow()}
              leftIcon={<RefreshCcw className="h-4 w-4" />}
            >
              {t("actions.refreshNow")}
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => void handlePruneNow()}
              leftIcon={<Scissors className="h-4 w-4" />}
            >
              {t("actions.prune")}
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={openBalanceHistorySettings}
              leftIcon={<Settings className="h-4 w-4" />}
            >
              {t("common:labels.settings")}
            </Button>
          </div>
        }
      />

      {shouldShowCashflowWarning && (
        <Alert
          variant="warning"
          title={t("warnings.cashflowDisabled.title")}
          description={t("warnings.cashflowDisabled.description")}
        />
      )}

      {shouldShowEnableBalanceHistoryHint ? (
        <Alert
          variant="info"
          title={t("hints.disabled.title")}
          description={t("hints.disabled.description")}
        >
          <div className="mt-3 flex flex-wrap gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={openBalanceHistorySettings}
              leftIcon={<Settings className="h-4 w-4" />}
            >
              {t("hints.disabled.actions.openSettings")}
            </Button>
          </div>
        </Alert>
      ) : (
        <>
          <Card padding="md">
            <div className="space-y-4">
              <div>
                <Label className="text-sm font-medium">
                  {t("filters.tags")}
                </Label>
                <div className="dark:text-dark-text-tertiary text-xs text-gray-500">
                  {t("filters.tagsHint")}
                </div>
              </div>
              <TagFilter
                options={tagOptions}
                value={selectedTagIds}
                onChange={setSelectedTagIds}
                includeAllOption
                allLabel={t("filters.allTags")}
                maxVisibleLines={2}
                disabled={tagOptions.length === 0}
              />

              <div>
                <Label className="text-sm font-medium">
                  {t("filters.accounts")}
                </Label>
                <div className="dark:text-dark-text-tertiary text-xs text-gray-500">
                  {t("filters.accountsHint")}
                </div>
              </div>
              <TagFilter
                options={accountOptions}
                value={selectedAccountIds}
                onChange={setSelectedAccountIds}
                includeAllOption
                allLabel={t("filters.allAccounts")}
                maxVisibleLines={3}
                disabled={accountOptions.length === 0}
              />

              <div>
                <Label className="text-sm font-medium">
                  {t("settings:display.currencyUnit")}
                </Label>
                <div className="dark:text-dark-text-tertiary text-xs text-gray-500">
                  {t("settings:display.currencyDesc")}
                </div>
              </div>

              <div
                className={`inline-flex ${COLORS.background.tertiary} rounded-lg p-1 shadow-sm ${ANIMATIONS.transition.base}`}
              >
                <ToggleButton
                  onClick={() => handleCurrencyChange("USD")}
                  isActive={currencyType === "USD"}
                  size="default"
                  aria-label={t("settings:display.usd")}
                >
                  {t("settings:display.usd")}
                </ToggleButton>
                <ToggleButton
                  onClick={() => handleCurrencyChange("CNY")}
                  isActive={currencyType === "CNY"}
                  size="default"
                  aria-label={t("settings:display.cny")}
                >
                  {t("settings:display.cny")}
                </ToggleButton>
              </div>

              <div>
                <Label className="text-sm font-medium">
                  {t("filters.range")}
                </Label>
                <div className="dark:text-dark-text-tertiary text-xs text-gray-500">
                  {t("filters.rangeHint", { days: safeRetentionDays })}
                </div>
              </div>

              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                <div className="space-y-2">
                  <Label className="text-sm font-medium">
                    {t("filters.startDay")}
                  </Label>
                  <Input
                    type="date"
                    value={startDayKey}
                    min={minDayKey || undefined}
                    max={maxDayKey || undefined}
                    aria-label={t("filters.startDay")}
                    onChange={(event) => setStartDayKey(event.target.value)}
                    disabled={!minDayKey}
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-sm font-medium">
                    {t("filters.endDay")}
                  </Label>
                  <Input
                    type="date"
                    value={endDayKey}
                    min={minDayKey || undefined}
                    max={maxDayKey || undefined}
                    aria-label={t("filters.endDay")}
                    onChange={(event) => setEndDayKey(event.target.value)}
                    disabled={!maxDayKey}
                  />
                </div>
              </div>

              <div className="flex flex-wrap gap-2">
                {QUICK_RANGES.map((preset) => {
                  const label = t(`filters.quickRanges.${preset.id}`)
                  return (
                    <Button
                      key={preset.id}
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        const desired = Math.min(preset.days, safeRetentionDays)
                        setEndDayKey(maxDayKey)
                        setStartDayKey(
                          subtractDaysFromDayKey(maxDayKey, desired - 1),
                        )
                      }}
                    >
                      {label}
                    </Button>
                  )
                })}
              </div>

              <div className="dark:text-dark-text-tertiary text-xs text-gray-500">
                {t("summary.coverage", {
                  snapshotAvailableDays,
                  snapshotCompleteDays: snapshotCompleteDays.snapshotComplete,
                  cashflowAvailableDays,
                  cashflowCompleteDays: snapshotCompleteDays.cashflowComplete,
                  totalDays: perAccountSeries.dayKeys.length,
                })}
              </div>
            </div>
          </Card>

          {isLoading ? (
            <div className="dark:text-dark-text-secondary text-sm text-gray-600">
              {t("messages.loading.loadingData")}
            </div>
          ) : isStoreEmpty ? (
            <Card padding="md">
              <div className="space-y-1">
                <div className="text-sm font-medium">{t("empty.title")}</div>
                <div className="dark:text-dark-text-tertiary text-sm text-gray-600">
                  {t("empty.description")}
                </div>
              </div>
            </Card>
          ) : snapshotAvailableDays === 0 ? (
            <Card padding="md">
              <div className="space-y-1">
                <div className="text-sm font-medium">
                  {t("emptyRange.title")}
                </div>
                <div className="dark:text-dark-text-tertiary text-sm text-gray-600">
                  {t("emptyRange.description")}
                </div>
              </div>
            </Card>
          ) : (
            <div className="space-y-6">
              <Card padding="md">
                <div className="space-y-4">
                  <div className="text-sm font-medium">
                    {t("overview.title")}
                  </div>
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
                    <div className="dark:bg-dark-bg-secondary rounded-lg bg-gray-50 p-3">
                      <div className="dark:text-dark-text-tertiary text-xs text-gray-500">
                        {t("overview.kpis.endBalance.label")}
                      </div>
                      <div className="text-lg font-semibold">
                        {overviewTotals.endBalance === null
                          ? "-"
                          : `${currencySymbol}${formatMoneyFixed(overviewTotals.endBalance)}`}
                      </div>
                      <div className="dark:text-dark-text-tertiary text-xs text-gray-500">
                        {t("overview.kpis.coverageAccounts", {
                          covered: overviewTotals.endBalanceCovered,
                          total: overviewTotals.totalAccounts,
                        })}
                      </div>
                    </div>

                    <div className="dark:bg-dark-bg-secondary rounded-lg bg-gray-50 p-3">
                      <div className="dark:text-dark-text-tertiary text-xs text-gray-500">
                        {t("overview.kpis.rangeNet.label")}
                      </div>
                      <div className="text-lg font-semibold">
                        {overviewTotals.rangeNet === null
                          ? "-"
                          : `${currencySymbol}${formatMoneyFixed(overviewTotals.rangeNet)}`}
                      </div>
                      <div className="dark:text-dark-text-tertiary text-xs text-gray-500">
                        {t("overview.kpis.coverageAccounts", {
                          covered: overviewTotals.rangeNetCovered,
                          total: overviewTotals.totalAccounts,
                        })}
                      </div>
                    </div>

                    <div className="dark:bg-dark-bg-secondary rounded-lg bg-gray-50 p-3">
                      <div className="dark:text-dark-text-tertiary text-xs text-gray-500">
                        {t("overview.kpis.incomeTotal.label")}
                      </div>
                      <div className="text-lg font-semibold">
                        {overviewTotals.incomeTotal === null
                          ? "-"
                          : `${currencySymbol}${formatMoneyFixed(overviewTotals.incomeTotal)}`}
                      </div>
                      <div className="dark:text-dark-text-tertiary text-xs text-gray-500">
                        {t("overview.kpis.coverageAccounts", {
                          covered: overviewTotals.incomeCovered,
                          total: overviewTotals.totalAccounts,
                        })}
                      </div>
                    </div>

                    <div className="dark:bg-dark-bg-secondary rounded-lg bg-gray-50 p-3">
                      <div className="dark:text-dark-text-tertiary text-xs text-gray-500">
                        {t("overview.kpis.outcomeTotal.label")}
                      </div>
                      <div className="text-lg font-semibold">
                        {overviewTotals.outcomeTotal === null
                          ? "-"
                          : `${currencySymbol}${formatMoneyFixed(overviewTotals.outcomeTotal)}`}
                      </div>
                      <div className="dark:text-dark-text-tertiary text-xs text-gray-500">
                        {t("overview.kpis.coverageAccounts", {
                          covered: overviewTotals.outcomeCovered,
                          total: overviewTotals.totalAccounts,
                        })}
                      </div>
                    </div>
                  </div>
                </div>
              </Card>

              <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
                <Card padding="md">
                  <div className="space-y-3">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0 space-y-1">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <button
                              type="button"
                              className={`${ANIMATIONS.transition.base} dark:hover:bg-dark-bg-tertiary inline-flex min-w-0 items-center gap-1 rounded-md px-1 py-0.5 text-sm font-medium hover:bg-gray-100 focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:outline-none`}
                            >
                              <span className="min-w-0 truncate">
                                {t("breakdown.title")}:{" "}
                                {t(`metrics.${breakdownMetric}`)}
                              </span>
                              <ChevronDown className="h-4 w-4 shrink-0 opacity-70" />
                            </button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="start" className="w-44">
                            <DropdownMenuRadioGroup
                              value={breakdownMetric}
                              onValueChange={(value) =>
                                setBreakdownMetric(
                                  value as DailyBalanceHistoryMetric,
                                )
                              }
                            >
                              <DropdownMenuRadioItem value="balance">
                                {t("metrics.balance")}
                              </DropdownMenuRadioItem>
                              <DropdownMenuRadioItem value="income">
                                {t("metrics.income")}
                              </DropdownMenuRadioItem>
                              <DropdownMenuRadioItem value="outcome">
                                {t("metrics.outcome")}
                              </DropdownMenuRadioItem>
                              <DropdownMenuRadioItem value="net">
                                {t("metrics.net")}
                              </DropdownMenuRadioItem>
                            </DropdownMenuRadioGroup>
                          </DropdownMenuContent>
                        </DropdownMenu>
                        <div className="dark:text-dark-text-tertiary text-xs text-gray-500">
                          {t("breakdown.coverage", {
                            covered: breakdownData.coveredAccounts,
                            total: breakdownData.totalAccounts,
                          })}
                        </div>
                      </div>

                      <div
                        className={`inline-flex ${COLORS.background.tertiary} rounded-lg p-1 shadow-sm ${ANIMATIONS.transition.base}`}
                        role="group"
                        aria-label={t("breakdown.controls.chartType")}
                      >
                        <ToggleButton
                          type="button"
                          size="sm"
                          isActive={breakdownChartType === "pie"}
                          onClick={() => setBreakdownChartType("pie")}
                          disabled={breakdownData.hasNegativeValues}
                          aria-label={t("breakdown.chartTypes.pie")}
                        >
                          {t("breakdown.chartTypes.pie")}
                        </ToggleButton>
                        <ToggleButton
                          type="button"
                          size="sm"
                          isActive={breakdownChartType === "bar"}
                          onClick={() => setBreakdownChartType("bar")}
                          aria-label={t("breakdown.chartTypes.histogram")}
                        >
                          {t("breakdown.chartTypes.histogram")}
                        </ToggleButton>
                      </div>
                    </div>

                    {breakdownMetric === "balance" && (
                      <div className="flex flex-wrap items-center gap-2">
                        <Label className="dark:text-dark-text-tertiary text-xs text-gray-500">
                          {t("breakdown.controls.reference")}
                        </Label>
                        <Input
                          type="date"
                          size="sm"
                          containerClassName="w-40"
                          value={
                            breakdownBalanceDayKey || effectiveRange.endDayKey
                          }
                          min={effectiveRange.startDayKey}
                          max={effectiveRange.endDayKey}
                          aria-label={t("breakdown.controls.reference")}
                          onChange={(event) =>
                            setBreakdownBalanceDayKey(event.target.value)
                          }
                        />
                      </div>
                    )}

                    {breakdownData.hasNegativeValues && (
                      <div className="dark:text-dark-text-tertiary text-xs text-gray-500">
                        {t("breakdown.hints.pieDisabledForNegative")}
                      </div>
                    )}

                    {breakdownOption ? (
                      <div className="h-80 w-full">
                        <EChart option={breakdownOption} />
                      </div>
                    ) : (
                      <div className="dark:text-dark-text-secondary text-sm text-gray-600">
                        {t("breakdown.empty")}
                      </div>
                    )}
                  </div>
                </Card>

                <Card padding="md">
                  <div className="space-y-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 space-y-1">
                        <div className="flex min-w-0 items-center gap-2">
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <button
                                type="button"
                                className={`${ANIMATIONS.transition.base} dark:hover:bg-dark-bg-tertiary inline-flex min-w-0 items-center gap-1 rounded-md px-1 py-0.5 text-sm font-medium hover:bg-gray-100 focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:outline-none`}
                              >
                                <span className="min-w-0 truncate">
                                  {t("trend.title")}:{" "}
                                  {t(`metrics.${trendMetric}`)}
                                </span>
                                <ChevronDown className="h-4 w-4 shrink-0 opacity-70" />
                              </button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="start" className="w-44">
                              <DropdownMenuRadioGroup
                                value={trendMetric}
                                onValueChange={(value) =>
                                  setTrendMetric(
                                    value as DailyBalanceHistoryMetric,
                                  )
                                }
                              >
                                <DropdownMenuRadioItem value="balance">
                                  {t("metrics.balance")}
                                </DropdownMenuRadioItem>
                                <DropdownMenuRadioItem value="income">
                                  {t("metrics.income")}
                                </DropdownMenuRadioItem>
                                <DropdownMenuRadioItem value="outcome">
                                  {t("metrics.outcome")}
                                </DropdownMenuRadioItem>
                                <DropdownMenuRadioItem value="net">
                                  {t("metrics.net")}
                                </DropdownMenuRadioItem>
                              </DropdownMenuRadioGroup>
                            </DropdownMenuContent>
                          </DropdownMenu>

                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <button
                                type="button"
                                className={`${ANIMATIONS.transition.base} dark:hover:bg-dark-bg-tertiary inline-flex min-w-0 items-center gap-1 rounded-md px-1 py-0.5 text-sm font-medium hover:bg-gray-100 focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:outline-none`}
                              >
                                <span className="min-w-0 truncate">
                                  {t("trend.controls.scope")}:{" "}
                                  {t(`trend.scopes.${trendScope}`)}
                                </span>
                                <ChevronDown className="h-4 w-4 shrink-0 opacity-70" />
                              </button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="start" className="w-40">
                              <DropdownMenuRadioGroup
                                value={trendScope}
                                onValueChange={(value) =>
                                  setTrendScope(
                                    value as BalanceHistoryTrendSeriesScope,
                                  )
                                }
                              >
                                <DropdownMenuRadioItem value="accounts">
                                  {t("trend.scopes.accounts")}
                                </DropdownMenuRadioItem>
                                <DropdownMenuRadioItem value="total">
                                  {t("trend.scopes.total")}
                                </DropdownMenuRadioItem>
                              </DropdownMenuRadioGroup>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                        <div className="dark:text-dark-text-tertiary text-xs text-gray-500">
                          {trendScope === "total"
                            ? t("trend.subtitleTotal")
                            : t("trend.subtitle")}
                        </div>
                      </div>
                      <div
                        className={`inline-flex ${COLORS.background.tertiary} rounded-lg p-1 shadow-sm ${ANIMATIONS.transition.base}`}
                        role="group"
                        aria-label={t("trend.controls.chartType")}
                      >
                        <ToggleButton
                          type="button"
                          size="sm"
                          isActive={trendChartType === "line"}
                          onClick={() => setTrendChartType("line")}
                          aria-label={t("trend.chartTypes.line")}
                        >
                          {t("trend.chartTypes.line")}
                        </ToggleButton>
                        <ToggleButton
                          type="button"
                          size="sm"
                          isActive={trendChartType === "bar"}
                          onClick={() => setTrendChartType("bar")}
                          aria-label={t("trend.chartTypes.bar")}
                        >
                          {t("trend.chartTypes.bar")}
                        </ToggleButton>
                      </div>
                    </div>

                    {hasAnyTrendMetricData ? (
                      <div className="space-y-3">
                        <div className="h-80 w-full">
                          <EChart option={trendOption} />
                        </div>
                        {shouldShowIncompleteTotalHint && (
                          <Alert
                            variant="info"
                            title={t("hints.incompleteSelection.title")}
                            description={t(
                              "hints.incompleteSelection.description",
                              {
                                minCovered:
                                  totalTrendCoverageSummary.minCovered,
                                maxCovered:
                                  totalTrendCoverageSummary.maxCovered,
                                totalAccounts:
                                  totalTrendCoverageSummary.totalAccounts,
                              },
                            )}
                          />
                        )}
                      </div>
                    ) : (
                      <div className="dark:text-dark-text-secondary text-sm text-gray-600">
                        {t("trend.emptyMetric", {
                          metric: t(`metrics.${trendMetric}`),
                        })}
                      </div>
                    )}
                  </div>
                </Card>
              </div>

              <Card padding="md">
                <div className="space-y-3">
                  <div className="text-sm font-medium">{t("table.title")}</div>
                  <BalanceHistoryAccountSummaryTable
                    rows={tableRows}
                    isLoading={isLoading}
                    currencySymbol={currencySymbol}
                  />
                </div>
              </Card>
            </div>
          )}
        </>
      )}
    </div>
  )
}
