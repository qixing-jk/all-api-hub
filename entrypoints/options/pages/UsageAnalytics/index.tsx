import { BarChart3, RefreshCcw, Settings } from "lucide-react"
import { useCallback, useEffect, useMemo, useState } from "react"
import toast from "react-hot-toast"
import { useTranslation } from "react-i18next"

import { EChart } from "~/components/charts/EChart"
import {
  Button,
  Card,
  Input,
  Label,
  TagFilter,
  ToggleButton,
} from "~/components/ui"
import { MENU_ITEM_IDS } from "~/constants/optionsMenuIds"
import { UI_CONSTANTS } from "~/constants/ui"
import { useTheme } from "~/contexts/ThemeContext"
import { useUserPreferencesContext } from "~/contexts/UserPreferencesContext"
import { PageHeader } from "~/entrypoints/options/components/PageHeader"
import { accountStorage } from "~/services/accountStorage"
import { computeUsageHistoryExport } from "~/services/usageHistory/analytics"
import {
  parseDayKey,
  subtractDaysFromDayKey,
} from "~/services/usageHistory/core"
import { usageHistoryStorage } from "~/services/usageHistory/storage"
import type { SiteAccount } from "~/types"
import type {
  UsageHistoryAccountStore,
  UsageHistoryExportSelection,
  UsageHistoryStore,
} from "~/types/usageHistory"
import { getErrorMessage } from "~/utils/error"
import { formatTokenCount } from "~/utils/formatters"
import { createLogger } from "~/utils/logger"
import { formatPriceCompact } from "~/utils/modelPricing"
import { navigateWithinOptionsPage } from "~/utils/navigation"

import { listDayKeysInRange, type DayKey } from "./dayKeys"
import {
  buildDailyOverviewOption,
  buildHeatmapOption,
  buildHorizontalBarOption,
  buildLatencyHistogramOption,
  buildLatencyTrendOption,
  buildPieOption,
  getAccountTotalsRows,
  getModelTotalsRows,
  getSlowModelRows,
  getSlowTokenRows,
  resolveFusedDailyByModelForTokens,
  resolveFusedDailyForTokens,
  resolveFusedHourlyForTokens,
  resolveLatencyAggregateForSelection,
  resolveLatencyDailyForTokens,
  topNWithOther,
} from "./echartsOptions"

/**
 * Unified logger scoped to the Usage Analytics options page.
 */
const logger = createLogger("UsageAnalyticsPage")

type UsageAnalyticsChartDisplayType = "pie" | "bar"

type UsageAnalyticsBreakdownChartKey =
  | "slowModels"
  | "slowTokens"
  | "accountComparison"
  | "modelDistribution"
  | "modelCostDistribution"

/**
 * Compact chart-type segmented control used for distribution/leaderboard cards.
 *
 * Defaulting to pie makes it easy to read proportions, while still allowing
 * users to switch to a histogram-style bar view for precise comparisons.
 */
function UsageAnalyticsChartTypeToggle(props: {
  value: UsageAnalyticsChartDisplayType
  onChange: (value: UsageAnalyticsChartDisplayType) => void
  pieLabel: string
  barLabel: string
  ariaLabel: string
}) {
  const { value, onChange, pieLabel, barLabel, ariaLabel } = props

  return (
    <div
      className="dark:bg-dark-bg-secondary inline-flex items-center gap-1 rounded-lg bg-gray-100 p-1"
      role="group"
      aria-label={ariaLabel}
    >
      <ToggleButton
        type="button"
        size="sm"
        isActive={value === "pie"}
        onClick={() => onChange("pie")}
      >
        {pieLabel}
      </ToggleButton>
      <ToggleButton
        type="button"
        size="sm"
        isActive={value === "bar"}
        onClick={() => onChange("bar")}
      >
        {barLabel}
      </ToggleButton>
    </div>
  )
}

/**
 * Options page: usage-history charts and export.
 */
export default function UsageAnalytics() {
  const { t } = useTranslation("usageAnalytics")
  const { resolvedTheme } = useTheme()
  const isDark = resolvedTheme === "dark"
  const { currencyType } = useUserPreferencesContext()

  const [accounts, setAccounts] = useState<SiteAccount[]>([])
  const [store, setStore] = useState<UsageHistoryStore | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  const [selectedSiteNames, setSelectedSiteNames] = useState<string[]>([])
  const [selectedAccountIds, setSelectedAccountIds] = useState<string[]>([])
  const [selectedTokenIds, setSelectedTokenIds] = useState<string[]>([])
  const [startDay, setStartDay] = useState<DayKey>("")
  const [endDay, setEndDay] = useState<DayKey>("")
  // Cross-chart selection derived from in-chart interactions (click/zoom/legend).
  const [focusModelName, setFocusModelName] = useState<string | null>(null)
  const [dailyLegendSelected, setDailyLegendSelected] = useState<
    Record<string, boolean> | undefined
  >(undefined)

  const [breakdownChartTypeByKey, setBreakdownChartTypeByKey] = useState<
    Record<UsageAnalyticsBreakdownChartKey, UsageAnalyticsChartDisplayType>
  >({
    slowModels: "pie",
    slowTokens: "pie",
    accountComparison: "pie",
    modelDistribution: "pie",
    modelCostDistribution: "pie",
  })

  /**
   * Update a single breakdown card's chart type (pie vs histogram-style bar).
   *
   * Stored as a keyed map to keep state updates localized and explicit.
   */
  const setBreakdownChartType = useCallback(
    (
      key: UsageAnalyticsBreakdownChartKey,
      value: UsageAnalyticsChartDisplayType,
    ) => {
      setBreakdownChartTypeByKey((current) => {
        if (current[key] === value) return current
        return { ...current, [key]: value }
      })
    },
    [],
  )

  /**
   * Load accounts and usage-history store data.
   */
  const loadData = useCallback(async () => {
    try {
      setIsLoading(true)
      const [nextAccounts, nextStore] = await Promise.all([
        accountStorage.getAllAccounts(),
        usageHistoryStorage.getStore(),
      ])
      setAccounts(nextAccounts)
      setStore(nextStore)
    } catch (error) {
      logger.error("Failed to load data", error)
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadData()
  }, [loadData])

  // Site/account filter options and labels.
  const siteTitleByName = useMemo(() => {
    const metaBySite = new Map<
      string,
      {
        urls: Set<string>
        types: Set<string>
        accountCount: number
      }
    >()

    for (const account of accounts) {
      const entry = metaBySite.get(account.site_name) ?? {
        urls: new Set<string>(),
        types: new Set<string>(),
        accountCount: 0,
      }

      entry.urls.add(account.site_url)
      entry.types.add(account.site_type)
      entry.accountCount += 1
      metaBySite.set(account.site_name, entry)
    }

    const out = new Map<string, string>()
    for (const [siteName, meta] of metaBySite.entries()) {
      const urls = Array.from(meta.urls).filter(Boolean).sort()
      const types = Array.from(meta.types).filter(Boolean).sort()

      const parts: string[] = [`${t("hover.site")}: ${siteName}`]
      for (const url of urls) {
        parts.push(`${t("hover.url")}: ${url}`)
      }
      if (types.length > 0) {
        parts.push(`${t("hover.type")}: ${types.join(" / ")}`)
      }
      parts.push(`${t("hover.accountsCount")}: ${meta.accountCount}`)
      out.set(siteName, parts.join("\n"))
    }

    return out
  }, [accounts, t])

  const siteAccountCountByName = useMemo(() => {
    const out = new Map<string, number>()
    for (const account of accounts) {
      out.set(account.site_name, (out.get(account.site_name) ?? 0) + 1)
    }
    return out
  }, [accounts])

  const tokenCountByAccountId = useMemo(() => {
    const out = new Map<string, number>()
    if (!store || !startDay || !endDay) {
      return out
    }

    const hasUsageInRange = (perTokenDaily: Record<string, unknown>) => {
      for (const dayKey of Object.keys(perTokenDaily)) {
        if (dayKey >= startDay && dayKey <= endDay) {
          return true
        }
      }
      return false
    }

    for (const [accountId, accountStore] of Object.entries(store.accounts)) {
      const resolved = accountStore as UsageHistoryAccountStore
      const tokenIds = new Set<string>()

      for (const [tokenId, perTokenDaily] of Object.entries(
        resolved.dailyByToken ?? {},
      )) {
        if (hasUsageInRange(perTokenDaily as Record<string, unknown>)) {
          tokenIds.add(tokenId)
        }
      }

      out.set(accountId, tokenIds.size)
    }

    return out
  }, [endDay, startDay, store])

  const siteOptions = useMemo(() => {
    const siteNames = new Set(accounts.map((account) => account.site_name))
    const options = Array.from(siteNames).map((siteName) => ({
      value: siteName,
      label: siteName,
      title: siteTitleByName.get(siteName),
      count: siteAccountCountByName.get(siteName) ?? 0,
    }))

    options.sort((a, b) => a.label.localeCompare(b.label))
    return options
  }, [accounts, siteAccountCountByName, siteTitleByName])

  // Filtered accounts for the selected sites.
  const accountsForSelectedSites = useMemo(() => {
    if (selectedSiteNames.length === 0) {
      return accounts
    }

    const selected = new Set(selectedSiteNames)
    return accounts.filter((account) => selected.has(account.site_name))
  }, [accounts, selectedSiteNames])

  const usernameCounts = useMemo(() => {
    const counts = new Map<string, number>()
    for (const account of accounts) {
      const username = account.account_info.username
      counts.set(username, (counts.get(username) ?? 0) + 1)
    }
    return counts
  }, [accounts])

  const accountLabelById = useMemo(() => {
    const out = new Map<string, string>()
    for (const account of accounts) {
      const username = account.account_info.username
      const disambiguate = (usernameCounts.get(username) ?? 0) > 1
      const label = disambiguate
        ? `${username} (${account.site_name})`
        : username
      out.set(account.id, label)
    }
    return out
  }, [accounts, usernameCounts])

  const accountOptions = useMemo(() => {
    return accountsForSelectedSites.map((account) => ({
      value: account.id,
      label: accountLabelById.get(account.id) ?? account.id,
      count: tokenCountByAccountId.get(account.id) ?? 0,
      title: [
        `${t("hover.account")}: ${accountLabelById.get(account.id) ?? account.id}`,
        `${t("hover.site")}: ${account.site_name}`,
        account.notes ? `${t("hover.notes")}: ${String(account.notes)}` : "",
      ]
        .filter(Boolean)
        .join("\n"),
    }))
  }, [accountLabelById, accountsForSelectedSites, t, tokenCountByAccountId])

  const accountLabels = useMemo(() => {
    return Object.fromEntries(
      accounts.map((account) => [
        account.id,
        accountLabelById.get(account.id) ?? account.id,
      ]),
    ) as Record<string, string>
  }, [accountLabelById, accounts])

  useEffect(() => {
    if (selectedAccountIds.length === 0) {
      return
    }

    const available = new Set(
      accountsForSelectedSites.map((account) => account.id),
    )
    setSelectedAccountIds((current) =>
      current.filter((id) => available.has(id)),
    )
  }, [accountsForSelectedSites, selectedAccountIds.length])

  const resolvedAccountIds = useMemo(() => {
    if (selectedAccountIds.length > 0) {
      return selectedAccountIds
    }

    if (selectedSiteNames.length > 0) {
      return accountsForSelectedSites.map((account) => account.id)
    }

    if (store) {
      return Object.keys(store.accounts)
    }

    return accounts.map((account) => account.id)
  }, [
    accounts,
    accountsForSelectedSites,
    selectedAccountIds,
    selectedSiteNames.length,
    store,
  ])

  const availableDayKeys = useMemo(() => {
    if (!store) return []
    const keys = new Set<string>()
    for (const accountId of resolvedAccountIds) {
      const accountStore = store.accounts[accountId]
      if (!accountStore) continue
      for (const dayKey of Object.keys(accountStore.daily)) {
        keys.add(dayKey)
      }
    }
    return Array.from(keys).sort()
  }, [resolvedAccountIds, store])

  const minDay = availableDayKeys[0] ?? ""
  const maxDay = availableDayKeys[availableDayKeys.length - 1] ?? ""

  useEffect(() => {
    if (!minDay || !maxDay) {
      return
    }

    setEndDay((current) =>
      current && current >= minDay && current <= maxDay ? current : maxDay,
    )
    setStartDay((current) => {
      if (current && current >= minDay && current <= maxDay) {
        return current
      }

      const suggested = subtractDaysFromDayKey(maxDay, 6)
      return suggested < minDay ? minDay : suggested
    })
  }, [maxDay, minDay])

  useEffect(() => {
    if (!startDay || !endDay) {
      return
    }

    if (startDay > endDay) {
      setEndDay(startDay)
    }
  }, [endDay, startDay])

  const exportSelection: UsageHistoryExportSelection | null = useMemo(() => {
    if (
      !startDay ||
      !endDay ||
      !parseDayKey(startDay) ||
      !parseDayKey(endDay)
    ) {
      return null
    }

    const hasScopedAccountFilter =
      selectedSiteNames.length > 0 || selectedAccountIds.length > 0

    const scopedAccountIds =
      selectedAccountIds.length > 0
        ? selectedAccountIds
        : accountsForSelectedSites.map((account) => account.id)

    return {
      accountIds: hasScopedAccountFilter
        ? scopedAccountIds.length > 0
          ? scopedAccountIds
          : ["__none__"]
        : [],
      startDay,
      endDay,
    }
  }, [
    accountsForSelectedSites,
    endDay,
    selectedAccountIds,
    selectedSiteNames.length,
    startDay,
  ])

  const exportPreview = useMemo(() => {
    if (!store || !exportSelection) {
      return null
    }

    try {
      return computeUsageHistoryExport({ store, selection: exportSelection })
    } catch {
      return null
    }
  }, [exportSelection, store])

  const tokenOptions = useMemo(() => {
    const tokenNamesById = exportPreview?.fused.tokenNamesById ?? {}
    const tokenIds = new Set<string>([
      ...Object.keys(exportPreview?.fused.dailyByToken ?? {}),
      ...Object.keys(tokenNamesById),
    ])

    const accountIdentityById = new Map(
      accounts.map((account) => [
        account.id,
        `${account.site_name} - ${account.account_info.username}`,
      ]),
    )

    const tokenOwnersById = new Map<string, string[]>()
    for (const [accountId, accountData] of Object.entries(
      exportPreview?.accounts ?? {},
    )) {
      const label =
        accountIdentityById.get(accountId) ??
        accountLabels[accountId] ??
        accountId

      for (const tokenId of Object.keys(accountData.dailyByToken ?? {})) {
        const owners = tokenOwnersById.get(tokenId) ?? []
        owners.push(label)
        tokenOwnersById.set(tokenId, owners)
      }

      for (const tokenId of Object.keys(accountData.tokenNamesById ?? {})) {
        const owners = tokenOwnersById.get(tokenId) ?? []
        if (!owners.includes(label)) {
          owners.push(label)
          tokenOwnersById.set(tokenId, owners)
        }
      }
    }

    const options = Array.from(tokenIds).map((tokenId) => {
      const tokenName = tokenNamesById[tokenId]
      const label =
        tokenId === "unknown"
          ? t("filters.unknownToken")
          : tokenName
            ? `${tokenName} (#${tokenId})`
            : `#${tokenId}`

      const owners = (tokenOwnersById.get(tokenId) ?? []).slice().sort()
      return {
        value: tokenId,
        label,
        title: [
          `${t("hover.token")}: ${label}`,
          owners.length > 0 ? `${t("hover.owners")}: ${owners.join(", ")}` : "",
        ]
          .filter(Boolean)
          .join("\n"),
      }
    })

    options.sort((a, b) => a.label.localeCompare(b.label))
    return options
  }, [accountLabels, accounts, exportPreview, t])

  useEffect(() => {
    if (selectedTokenIds.length === 0) {
      return
    }

    const available = new Set(tokenOptions.map((option) => option.value))
    setSelectedTokenIds((current) => current.filter((id) => available.has(id)))
  }, [tokenOptions, selectedTokenIds.length])

  const dayKeysInRange = useMemo(() => {
    if (!startDay || !endDay) return []
    return listDayKeysInRange(startDay, endDay)
  }, [endDay, startDay])

  const fusedDailyForTokens = useMemo(() => {
    if (!exportPreview) return {}
    return resolveFusedDailyForTokens(exportPreview, selectedTokenIds)
  }, [exportPreview, selectedTokenIds])

  const fusedHourlyForTokens = useMemo(() => {
    if (!exportPreview) return {}
    return resolveFusedHourlyForTokens(exportPreview, selectedTokenIds)
  }, [exportPreview, selectedTokenIds])

  const fusedDailyByModelForTokens = useMemo(() => {
    if (!exportPreview) return {}
    return resolveFusedDailyByModelForTokens(exportPreview, selectedTokenIds)
  }, [exportPreview, selectedTokenIds])

  const modelTotalsRows = useMemo(() => {
    if (!exportPreview) return []
    return getModelTotalsRows({
      exportData: exportPreview,
      tokenIds: selectedTokenIds,
      topN: 12,
      otherLabel: t("charts.other"),
    })
  }, [exportPreview, selectedTokenIds, t])

  const accountTotalsFullRows = useMemo(() => {
    if (!exportPreview) return []
    return getAccountTotalsRows({
      exportData: exportPreview,
      tokenIds: selectedTokenIds,
      accountLabels,
    })
  }, [accountLabels, exportPreview, selectedTokenIds])

  const accountTotalsRows = useMemo(() => {
    return topNWithOther(
      accountTotalsFullRows.map((row) => ({
        key: row.accountLabel,
        value: row.totalTokens,
      })),
      12,
      t("charts.other"),
    )
  }, [accountTotalsFullRows, t])

  const slowModelRows = useMemo(() => {
    if (!exportPreview) return []
    return getSlowModelRows({
      exportData: exportPreview,
      tokenIds: selectedTokenIds,
      topN: 12,
      otherLabel: t("charts.other"),
    })
  }, [exportPreview, selectedTokenIds, t])

  const slowTokenRows = useMemo(() => {
    if (!exportPreview) return []
    return getSlowTokenRows({
      exportData: exportPreview,
      tokenIds: selectedTokenIds,
      topN: 12,
      otherLabel: t("charts.other"),
      unknownLabel: t("filters.unknownToken"),
    })
  }, [exportPreview, selectedTokenIds, t])

  const selectionTotals = useMemo(() => {
    return Object.values(fusedDailyForTokens).reduce(
      (totals, aggregate) => {
        totals.requests += aggregate.requests
        totals.promptTokens += aggregate.promptTokens
        totals.completionTokens += aggregate.completionTokens
        totals.totalTokens += aggregate.totalTokens
        totals.quotaConsumed += aggregate.quotaConsumed
        return totals
      },
      {
        requests: 0,
        promptTokens: 0,
        completionTokens: 0,
        totalTokens: 0,
        quotaConsumed: 0,
      },
    )
  }, [fusedDailyForTokens])

  const selectionCost = useMemo(() => {
    const conversionFactor = UI_CONSTANTS.EXCHANGE_RATE.CONVERSION_FACTOR
    const totalQuotaConsumed = accountTotalsFullRows.reduce(
      (sum, row) => sum + row.quotaConsumed,
      0,
    )

    const usd = totalQuotaConsumed / conversionFactor

    if (currencyType === "USD") {
      return usd
    }

    const exchangeRateByAccountId = new Map(
      accounts.map((account) => [account.id, account.exchange_rate] as const),
    )

    return accountTotalsFullRows.reduce((sum, row) => {
      const exchangeRate =
        exchangeRateByAccountId.get(row.accountId) ??
        UI_CONSTANTS.EXCHANGE_RATE.DEFAULT
      return sum + (row.quotaConsumed / conversionFactor) * exchangeRate
    }, 0)
  }, [accountTotalsFullRows, accounts, currencyType])

  const selectedLatencyAggregate = useMemo(() => {
    if (!exportPreview) {
      return null
    }

    return resolveLatencyAggregateForSelection({
      exportData: exportPreview,
      tokenIds: selectedTokenIds,
      modelName: focusModelName,
    })
  }, [exportPreview, focusModelName, selectedTokenIds])

  const latencyDailyForTokens = useMemo(() => {
    if (!exportPreview) return {}
    return resolveLatencyDailyForTokens(exportPreview, selectedTokenIds)
  }, [exportPreview, selectedTokenIds])

  const dailyLegendLabels = useMemo(() => {
    return {
      requestsAxisLabel: t("charts.dailyOverview.axes.requests"),
      tokensAxisLabel: t("charts.dailyOverview.axes.tokens"),
      requestsSeriesLabel: t("charts.dailyOverview.series.requests"),
      promptTokensSeriesLabel: t("charts.dailyOverview.series.promptTokens"),
      completionTokensSeriesLabel: t(
        "charts.dailyOverview.series.completionTokens",
      ),
      totalTokensSeriesLabel: t("charts.dailyOverview.series.totalTokens"),
      quotaSeriesLabel: t("charts.dailyOverview.series.quota"),
    }
  }, [t])

  const dailyOverviewOption = useMemo(() => {
    return buildDailyOverviewOption({
      dayKeys: dayKeysInRange,
      daily: fusedDailyForTokens,
      ...dailyLegendLabels,
      legendSelected: dailyLegendSelected,
      isDark,
    })
  }, [
    dailyLegendLabels,
    dailyLegendSelected,
    dayKeysInRange,
    fusedDailyForTokens,
    isDark,
  ])

  const modelDistributionOption = useMemo(() => {
    const categories = modelTotalsRows.map((row) => row.modelName)
    const values = modelTotalsRows.map((row) => row.totalTokens)
    const valueLabel = t("charts.modelDistribution.series.tokens")

    return breakdownChartTypeByKey.modelDistribution === "pie"
      ? buildPieOption({ categories, values, valueLabel, isDark })
      : buildHorizontalBarOption({ categories, values, valueLabel, isDark })
  }, [breakdownChartTypeByKey.modelDistribution, isDark, modelTotalsRows, t])

  const modelCostDistributionOption = useMemo(() => {
    const conversionFactor = UI_CONSTANTS.EXCHANGE_RATE.CONVERSION_FACTOR
    const categories = modelTotalsRows.map((row) => row.modelName)
    const values = modelTotalsRows.map(
      (row) => row.quotaConsumed / conversionFactor,
    )
    const valueLabel = t("charts.modelCostDistribution.series.usd")

    return breakdownChartTypeByKey.modelCostDistribution === "pie"
      ? buildPieOption({ categories, values, valueLabel, isDark })
      : buildHorizontalBarOption({ categories, values, valueLabel, isDark })
  }, [
    breakdownChartTypeByKey.modelCostDistribution,
    isDark,
    modelTotalsRows,
    t,
  ])

  const accountComparisonOption = useMemo(() => {
    const categories = accountTotalsRows.map((row) => row.key)
    const values = accountTotalsRows.map((row) => row.value)
    const valueLabel = t("charts.accountComparison.series.tokens")

    return breakdownChartTypeByKey.accountComparison === "pie"
      ? buildPieOption({ categories, values, valueLabel, isDark })
      : buildHorizontalBarOption({ categories, values, valueLabel, isDark })
  }, [accountTotalsRows, breakdownChartTypeByKey.accountComparison, isDark, t])

  const heatmapOption = useMemo(() => {
    const modelsForHeatmap =
      focusModelName && focusModelName !== t("charts.other")
        ? [focusModelName]
        : modelTotalsRows
            .map((row) => row.modelName)
            .filter((name) => name !== t("charts.other"))
            .slice(0, 10)

    const valuesByModelAndDay: Record<string, Record<string, number>> = {}
    for (const modelName of modelsForHeatmap) {
      const modelDaily = fusedDailyByModelForTokens[modelName] ?? {}
      valuesByModelAndDay[modelName] = Object.fromEntries(
        dayKeysInRange.map((dayKey) => [
          dayKey,
          modelDaily[dayKey]?.totalTokens ?? 0,
        ]),
      )
    }

    return buildHeatmapOption({
      dayKeys: dayKeysInRange,
      modelNames: modelsForHeatmap,
      valuesByModelAndDay,
      seriesLabel: t("charts.modelHeatmap.series.tokens"),
      isDark,
    })
  }, [
    dayKeysInRange,
    focusModelName,
    fusedDailyByModelForTokens,
    isDark,
    modelTotalsRows,
    t,
  ])

  const usageTimeHeatmapOption = useMemo(() => {
    const hours = Array.from({ length: 24 }, (_, index) =>
      String(index).padStart(2, "0"),
    )

    const weekdayLabels = [
      t("weekdays.mon"),
      t("weekdays.tue"),
      t("weekdays.wed"),
      t("weekdays.thu"),
      t("weekdays.fri"),
      t("weekdays.sat"),
      t("weekdays.sun"),
    ]

    const valuesByModelAndDay: Record<
      string,
      Record<string, number>
    > = Object.fromEntries(
      weekdayLabels.map((label) => [
        label,
        Object.fromEntries(hours.map((hour) => [hour, 0])),
      ]),
    )

    for (const [dayKey, hourly] of Object.entries(fusedHourlyForTokens)) {
      const parsed = parseDayKey(dayKey)
      if (!parsed) continue

      const weekday = new Date(
        Date.UTC(parsed.year, parsed.month - 1, parsed.day),
      ).getUTCDay()
      const weekdayIndex = (weekday + 6) % 7
      const weekdayLabel = weekdayLabels[weekdayIndex] ?? weekdayLabels[0]

      for (const [hourKey, aggregate] of Object.entries(hourly)) {
        valuesByModelAndDay[weekdayLabel][hourKey] =
          (valuesByModelAndDay[weekdayLabel][hourKey] ?? 0) +
          (aggregate.totalTokens ?? 0)
      }
    }

    return buildHeatmapOption({
      dayKeys: hours,
      modelNames: weekdayLabels,
      valuesByModelAndDay,
      seriesLabel: t("charts.usageTimeHeatmap.series.tokens"),
      isDark,
    })
  }, [fusedHourlyForTokens, isDark, t])

  const latencyHistogramOption = useMemo(() => {
    if (!selectedLatencyAggregate) {
      return null
    }

    return buildLatencyHistogramOption({
      latency: selectedLatencyAggregate,
      seriesLabel: t("charts.latencyHistogram.series.count"),
      isDark,
    })
  }, [isDark, selectedLatencyAggregate, t])

  const latencyTrendOption = useMemo(() => {
    return buildLatencyTrendOption({
      dayKeys: dayKeysInRange,
      dailyLatency: latencyDailyForTokens,
      avgSeriesLabel: t("charts.latencyTrend.series.avg"),
      maxSeriesLabel: t("charts.latencyTrend.series.max"),
      slowSeriesLabel: t("charts.latencyTrend.series.slow"),
      secondsAxisLabel: t("charts.latencyTrend.axes.seconds"),
      slowCountAxisLabel: t("charts.latencyTrend.axes.slowCount"),
      isDark,
    })
  }, [dayKeysInRange, isDark, latencyDailyForTokens, t])

  const slowModelsOption = useMemo(() => {
    const categories = slowModelRows.map((row) => row.label)
    const values = slowModelRows.map((row) => row.slowCount)
    const valueLabel = t("charts.slowModels.series.slowCount")

    return breakdownChartTypeByKey.slowModels === "pie"
      ? buildPieOption({ categories, values, valueLabel, isDark })
      : buildHorizontalBarOption({ categories, values, valueLabel, isDark })
  }, [breakdownChartTypeByKey.slowModels, isDark, slowModelRows, t])

  const slowTokensOption = useMemo(() => {
    const categories = slowTokenRows.map((row) => row.label)
    const values = slowTokenRows.map((row) => row.slowCount)
    const valueLabel = t("charts.slowTokens.series.slowCount")

    return breakdownChartTypeByKey.slowTokens === "pie"
      ? buildPieOption({ categories, values, valueLabel, isDark })
      : buildHorizontalBarOption({ categories, values, valueLabel, isDark })
  }, [breakdownChartTypeByKey.slowTokens, isDark, slowTokenRows, t])

  const handleExport = useCallback(async () => {
    if (!store || !exportSelection) {
      toast.error(t("messages.error.exportNoData"))
      return
    }

    try {
      const exportData = computeUsageHistoryExport({
        store,
        selection: exportSelection,
      })
      const blob = new Blob([JSON.stringify(exportData, null, 2)], {
        type: "application/json",
      })
      const url = URL.createObjectURL(blob)
      const link = document.createElement("a")
      link.href = url
      link.download = `all-api-hub-usage-history-${
        new Date().toISOString().split("T")[0]
      }.json`
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      URL.revokeObjectURL(url)
      toast.success(t("messages.success.exported"))
    } catch (error) {
      toast.error(
        t("messages.error.exportFailed", { error: getErrorMessage(error) }),
      )
    }
  }, [exportSelection, store, t])
  const showNoDataState =
    !isLoading && (!store || availableDayKeys.length === 0)

  useEffect(() => {
    if (!focusModelName || focusModelName === t("charts.other")) {
      return
    }

    if (
      !Object.prototype.hasOwnProperty.call(
        fusedDailyByModelForTokens,
        focusModelName,
      )
    ) {
      setFocusModelName(null)
    }
  }, [focusModelName, fusedDailyByModelForTokens, t])

  const handleDailyDataZoom = useCallback(
    (event: unknown) => {
      // ECharts dataZoom events may carry category indices or axis values depending
      // on configuration; normalize to `YYYY-MM-DD` day keys and update the filter.
      const payload = Array.isArray((event as any)?.batch)
        ? (event as any).batch[0]
        : (event as any)

      const startValue = payload?.startValue
      const endValue = payload?.endValue

      const resolveDayKey = (value: unknown) => {
        if (typeof value === "string") return value
        if (typeof value === "number") {
          if (dayKeysInRange.length === 0) {
            return null
          }
          return dayKeysInRange[
            Math.max(0, Math.min(dayKeysInRange.length - 1, value))
          ]
        }
        return null
      }

      const nextStart = resolveDayKey(startValue)
      const nextEnd = resolveDayKey(endValue)

      if (!nextStart || !nextEnd) {
        return
      }

      const clampedStart =
        nextStart < minDay ? minDay : nextStart > maxDay ? maxDay : nextStart
      const clampedEnd =
        nextEnd < minDay ? minDay : nextEnd > maxDay ? maxDay : nextEnd

      const normalizedStart =
        clampedStart <= clampedEnd ? clampedStart : clampedEnd
      const normalizedEnd =
        clampedStart <= clampedEnd ? clampedEnd : clampedStart

      if (normalizedStart === startDay && normalizedEnd === endDay) {
        return
      }

      setStartDay(normalizedStart)
      setEndDay(normalizedEnd)
    },
    [dayKeysInRange, endDay, maxDay, minDay, startDay],
  )

  const handleDailyLegendSelectChanged = useCallback((event: unknown) => {
    const selected = (event as any)?.selected
    if (selected && typeof selected === "object") {
      setDailyLegendSelected(selected as Record<string, boolean>)
    }
  }, [])

  const dailyChartEvents = useMemo(() => {
    return {
      datazoom: handleDailyDataZoom,
      legendselectchanged: handleDailyLegendSelectChanged,
    }
  }, [handleDailyDataZoom, handleDailyLegendSelectChanged])

  const handleModelDistributionClick = useCallback((event: unknown) => {
    // Click-to-focus a model name for related charts (e.g., heatmap + latency histogram).
    const modelName =
      typeof (event as any)?.name === "string"
        ? String((event as any).name)
        : null
    if (!modelName) return

    setFocusModelName((current) => (current === modelName ? null : modelName))
  }, [])

  const modelDistributionEvents = useMemo(() => {
    return {
      click: handleModelDistributionClick,
    }
  }, [handleModelDistributionClick])

  /**
   * Navigate to the account usage settings tab (usage-history sync controls).
   */
  const handleOpenAccountUsageSettings = useCallback(() => {
    navigateWithinOptionsPage(`#${MENU_ITEM_IDS.BASIC}`, {
      tab: "accountUsage",
      anchor: "usage-history-sync",
    })
  }, [])

  return (
    <div className="space-y-6 p-6">
      <PageHeader
        icon={BarChart3}
        title={t("title")}
        description={t("description")}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={handleOpenAccountUsageSettings}
              leftIcon={<Settings className="h-4 w-4" />}
            >
              {t("actions.openAccountUsageSettings")}
            </Button>
            <Button
              size="sm"
              variant="secondary"
              onClick={() => void loadData()}
              leftIcon={<RefreshCcw className="h-4 w-4" />}
            >
              {t("actions.refresh")}
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => void handleExport()}
            >
              {t("actions.export")}
            </Button>
          </div>
        }
      />

      <Card padding="md">
        <div className="space-y-3">
          {/*site filter*/}
          <div>
            <Label className="text-sm font-medium">{t("filters.sites")}</Label>
            <div className="dark:text-dark-text-tertiary text-xs text-gray-500">
              {t("filters.sitesHint")}
            </div>
          </div>
          <TagFilter
            options={siteOptions}
            value={selectedSiteNames}
            onChange={setSelectedSiteNames}
            includeAllOption
            allLabel={t("filters.allSites")}
            maxVisibleLines={6}
            disabled={siteOptions.length === 0}
          />

          {/*account filter*/}
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
            maxVisibleLines={2}
            disabled={accountsForSelectedSites.length === 0}
          />

          {/*API token filter*/}
          <div>
            <Label className="text-sm font-medium">{t("filters.tokens")}</Label>
            <div className="dark:text-dark-text-tertiary text-xs text-gray-500">
              {t("filters.tokensHint")}
            </div>
          </div>
          <TagFilter
            options={tokenOptions}
            value={selectedTokenIds}
            onChange={setSelectedTokenIds}
            includeAllOption
            allLabel={t("filters.allTokens")}
            maxVisibleLines={2}
            disabled={tokenOptions.length === 0}
          />

          {/*Date range filter*/}
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <div className="space-y-2">
              <Label className="text-sm font-medium">
                {t("filters.startDay")}
              </Label>
              <Input
                type="date"
                value={startDay}
                min={minDay || undefined}
                max={maxDay || undefined}
                onChange={(event) => setStartDay(event.target.value)}
                disabled={!minDay}
              />
            </div>
            <div className="space-y-2">
              <Label className="text-sm font-medium">
                {t("filters.endDay")}
              </Label>
              <Input
                type="date"
                value={endDay}
                min={minDay || undefined}
                max={maxDay || undefined}
                onChange={(event) => setEndDay(event.target.value)}
                disabled={!maxDay}
              />
            </div>
          </div>
        </div>
      </Card>

      {/* summary card*/}
      {exportPreview ? (
        <Card padding="md">
          <div className="grid grid-cols-2 gap-4 md:grid-cols-5">
            <div className="space-y-1">
              <div className="dark:text-dark-text-tertiary text-xs text-gray-500">
                {t("summary.promptTokens")}
              </div>
              <div className="text-lg font-semibold">
                {formatTokenCount(selectionTotals.promptTokens)}
              </div>
            </div>
            <div className="space-y-1">
              <div className="dark:text-dark-text-tertiary text-xs text-gray-500">
                {t("summary.completionTokens")}
              </div>
              <div className="text-lg font-semibold">
                {formatTokenCount(selectionTotals.completionTokens)}
              </div>
            </div>
            <div className="space-y-1">
              <div className="dark:text-dark-text-tertiary text-xs text-gray-500">
                {t("summary.totalTokens")}
              </div>
              <div className="text-lg font-semibold">
                {formatTokenCount(selectionTotals.totalTokens)}
              </div>
            </div>
            <div className="space-y-1">
              <div className="dark:text-dark-text-tertiary text-xs text-gray-500">
                {t("summary.requests")}
              </div>
              <div className="text-lg font-semibold">
                {formatTokenCount(selectionTotals.requests)}
              </div>
            </div>
            <div className="space-y-1">
              <div className="dark:text-dark-text-tertiary text-xs text-gray-500">
                {t("summary.cost")}
              </div>
              <div className="text-lg font-semibold">
                {formatPriceCompact(selectionCost, currencyType)}
              </div>
            </div>
          </div>
        </Card>
      ) : null}

      {showNoDataState ? (
        <Card padding="md">
          <div className="space-y-2">
            <div className="text-sm font-medium">{t("empty.title")}</div>
            <div className="dark:text-dark-text-tertiary text-sm text-gray-600">
              {t("empty.description")}
            </div>
            {/* Quick navigation so users can enable sync immediately. */}
            <div className="pt-1">
              <Button
                size="sm"
                variant="outline"
                onClick={handleOpenAccountUsageSettings}
                leftIcon={<Settings className="h-4 w-4" />}
              >
                {t("actions.openAccountUsageSettings")}
              </Button>
            </div>
          </div>
        </Card>
      ) : (
        <>
          {/*Daily Overview*/}
          <Card padding="md">
            <div className="mb-4 space-y-1">
              <div className="text-sm font-medium">
                {t("charts.dailyOverview.title")}
              </div>
              <div className="dark:text-dark-text-tertiary text-xs text-gray-500">
                {t("charts.dailyOverview.description")}
              </div>
            </div>

            <div className="h-80 w-full">
              <EChart
                option={dailyOverviewOption}
                onEvents={dailyChartEvents}
              />
            </div>
          </Card>

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <Card padding="md">
              <div className="mb-4 flex items-start justify-between gap-3">
                <div className="min-w-0 space-y-1">
                  <div className="text-sm font-medium">
                    {t("charts.modelDistribution.title")}
                  </div>
                  <div className="dark:text-dark-text-tertiary text-xs text-gray-500">
                    {t("charts.modelDistribution.description")}
                  </div>
                </div>
                <UsageAnalyticsChartTypeToggle
                  value={breakdownChartTypeByKey.modelDistribution}
                  onChange={(value) =>
                    setBreakdownChartType("modelDistribution", value)
                  }
                  pieLabel={t("charts.common.chartType.pie")}
                  barLabel={t("charts.common.chartType.histogram")}
                  ariaLabel={t("charts.common.chartType.ariaLabel")}
                />
              </div>

              <div className="h-80 w-full">
                <EChart
                  option={modelDistributionOption}
                  onEvents={modelDistributionEvents}
                />
              </div>
            </Card>

            <Card padding="md">
              <div className="mb-4 flex items-start justify-between gap-3">
                <div className="min-w-0 space-y-1">
                  <div className="text-sm font-medium">
                    {t("charts.modelCostDistribution.title")}
                  </div>
                  <div className="dark:text-dark-text-tertiary text-xs text-gray-500">
                    {t("charts.modelCostDistribution.description")}
                  </div>
                </div>
                <UsageAnalyticsChartTypeToggle
                  value={breakdownChartTypeByKey.modelCostDistribution}
                  onChange={(value) =>
                    setBreakdownChartType("modelCostDistribution", value)
                  }
                  pieLabel={t("charts.common.chartType.pie")}
                  barLabel={t("charts.common.chartType.histogram")}
                  ariaLabel={t("charts.common.chartType.ariaLabel")}
                />
              </div>

              <div className="h-80 w-full">
                <EChart
                  option={modelCostDistributionOption}
                  onEvents={modelDistributionEvents}
                />
              </div>
            </Card>

            <Card padding="md">
              <div className="mb-4 flex items-start justify-between gap-3">
                <div className="min-w-0 space-y-1">
                  <div className="text-sm font-medium">
                    {t("charts.accountComparison.title")}
                  </div>
                  <div className="dark:text-dark-text-tertiary text-xs text-gray-500">
                    {t("charts.accountComparison.description")}
                  </div>
                </div>
                <UsageAnalyticsChartTypeToggle
                  value={breakdownChartTypeByKey.accountComparison}
                  onChange={(value) =>
                    setBreakdownChartType("accountComparison", value)
                  }
                  pieLabel={t("charts.common.chartType.pie")}
                  barLabel={t("charts.common.chartType.histogram")}
                  ariaLabel={t("charts.common.chartType.ariaLabel")}
                />
              </div>

              <div className="h-80 w-full">
                <EChart option={accountComparisonOption} />
              </div>
            </Card>
          </div>

          <Card padding="md">
            <div className="mb-4 space-y-1">
              <div className="text-sm font-medium">
                {t("charts.usageTimeHeatmap.title")}
              </div>
              <div className="dark:text-dark-text-tertiary text-xs text-gray-500">
                {t("charts.usageTimeHeatmap.description")}
              </div>
            </div>

            <div className="h-[360px] w-full">
              <EChart option={usageTimeHeatmapOption} />
            </div>
          </Card>

          <Card padding="md">
            <div className="mb-4 space-y-1">
              <div className="text-sm font-medium">
                {t("charts.modelHeatmap.title")}
              </div>
              <div className="dark:text-dark-text-tertiary text-xs text-gray-500">
                {t("charts.modelHeatmap.description")}
              </div>
            </div>

            <div className="h-[420px] w-full">
              <EChart option={heatmapOption} />
            </div>
          </Card>

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <Card padding="md">
              <div className="mb-4 space-y-1">
                <div className="text-sm font-medium">
                  {t("charts.latencyHistogram.title")}
                  {focusModelName && focusModelName !== t("charts.other")
                    ? ` · ${focusModelName}`
                    : ""}
                </div>
                <div className="dark:text-dark-text-tertiary text-xs text-gray-500">
                  {t("charts.latencyHistogram.description")}
                </div>
              </div>

              <div className="h-80 w-full">
                {latencyHistogramOption ? (
                  <EChart option={latencyHistogramOption} />
                ) : null}
              </div>
            </Card>

            <Card padding="md">
              <div className="mb-4 space-y-1">
                <div className="text-sm font-medium">
                  {t("charts.latencyTrend.title")}
                </div>
                <div className="dark:text-dark-text-tertiary text-xs text-gray-500">
                  {t("charts.latencyTrend.description")}
                </div>
              </div>

              <div className="h-80 w-full">
                <EChart option={latencyTrendOption} />
              </div>
            </Card>
          </div>

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <Card padding="md">
              <div className="mb-4 flex items-start justify-between gap-3">
                <div className="min-w-0 space-y-1">
                  <div className="text-sm font-medium">
                    {t("charts.slowModels.title")}
                  </div>
                  <div className="dark:text-dark-text-tertiary text-xs text-gray-500">
                    {t("charts.slowModels.description")}
                  </div>
                </div>
                <UsageAnalyticsChartTypeToggle
                  value={breakdownChartTypeByKey.slowModels}
                  onChange={(value) =>
                    setBreakdownChartType("slowModels", value)
                  }
                  pieLabel={t("charts.common.chartType.pie")}
                  barLabel={t("charts.common.chartType.histogram")}
                  ariaLabel={t("charts.common.chartType.ariaLabel")}
                />
              </div>

              <div className="h-80 w-full">
                <EChart option={slowModelsOption} />
              </div>
            </Card>

            <Card padding="md">
              <div className="mb-4 flex items-start justify-between gap-3">
                <div className="min-w-0 space-y-1">
                  <div className="text-sm font-medium">
                    {t("charts.slowTokens.title")}
                  </div>
                  <div className="dark:text-dark-text-tertiary text-xs text-gray-500">
                    {t("charts.slowTokens.description")}
                  </div>
                </div>
                <UsageAnalyticsChartTypeToggle
                  value={breakdownChartTypeByKey.slowTokens}
                  onChange={(value) =>
                    setBreakdownChartType("slowTokens", value)
                  }
                  pieLabel={t("charts.common.chartType.pie")}
                  barLabel={t("charts.common.chartType.histogram")}
                  ariaLabel={t("charts.common.chartType.ariaLabel")}
                />
              </div>

              <div className="h-80 w-full">
                <EChart option={slowTokensOption} />
              </div>
            </Card>
          </div>
        </>
      )}
    </div>
  )
}
