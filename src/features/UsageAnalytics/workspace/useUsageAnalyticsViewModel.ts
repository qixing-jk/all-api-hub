import { useCallback, useMemo } from "react"

import { BASIC_SETTINGS_TAB_IDS } from "~/constants/basicSettingsTabs"
import { CURRENCIES, DEFAULT_USD_TO_CNY_RATE } from "~/constants/money"
import { MENU_ITEM_IDS } from "~/constants/optionsMenuIds"
import { SETTINGS_ANCHORS } from "~/constants/settingsAnchors"
import { useUserPreferencesContext } from "~/contexts/UserPreferencesContext"
import { useUsageAnalyticsCharts } from "~/features/UsageAnalytics/charts/useUsageAnalyticsCharts"
import type { createUsageAnalyticsPreview } from "~/features/UsageAnalytics/data/createUsageAnalyticsPreview"
import { useUsageAnalyticsData } from "~/features/UsageAnalytics/data/useUsageAnalyticsData"
import { useUsageAnalyticsExport } from "~/features/UsageAnalytics/export/useUsageAnalyticsExport"
import { useUsageAnalyticsFilters } from "~/features/UsageAnalytics/filtering/useUsageAnalyticsFilters"
import { pushWithinOptionsPage } from "~/utils/navigation/optionsPage"

/** Composes usage data, filtering, export, and chart interaction owners. */
export function useUsageAnalyticsViewModel(
  preview?: ReturnType<typeof createUsageAnalyticsPreview>,
) {
  const { currencyType } = useUserPreferencesContext()
  const saved = useUsageAnalyticsData()
  const data = preview
    ? {
        ...saved,
        ...preview,
        enabledAccounts: preview.accounts,
        isLoading: false,
        loadError: null,
        hasLoadedData: true,
      }
    : saved
  const filters = useUsageAnalyticsFilters(data)
  const { handleExport } = useUsageAnalyticsExport({
    store: data.store,
    exportSelection: filters.exportSelection,
  })
  const charts = useUsageAnalyticsCharts({
    filters,
  })
  const referenceCost = useMemo(() => {
    const rates = new Map(
      data.enabledAccounts.map((account) => [
        account.id,
        account.exchange_rate,
      ]),
    )
    let amount: number | undefined
    for (const row of charts.accountTotalsFullRows) {
      if (row.referenceCostUsd === undefined) continue
      const rate =
        currencyType === CURRENCIES.USD
          ? 1
          : (rates.get(row.accountId) ?? DEFAULT_USD_TO_CNY_RATE)
      amount = (amount ?? 0) + row.referenceCostUsd * rate
    }
    return amount
  }, [charts.accountTotalsFullRows, currencyType, data.enabledAccounts])
  const showNoDataState =
    !data.isLoading &&
    (!data.loadError || data.hasLoadedData) &&
    (!data.store || filters.availableDayKeys.length === 0)
  const handleOpenAccountUsageSettings = useCallback(() => {
    pushWithinOptionsPage(`#${MENU_ITEM_IDS.BASIC}`, {
      tab: BASIC_SETTINGS_TAB_IDS.AccountUsage,
      anchor: SETTINGS_ANCHORS.USAGE_HISTORY_SYNC,
    })
  }, [])
  return {
    data,
    filters,
    charts,
    currencyType,
    referenceCost,
    handleExport,
    showNoDataState,
    handleOpenAccountUsageSettings,
  }
}
