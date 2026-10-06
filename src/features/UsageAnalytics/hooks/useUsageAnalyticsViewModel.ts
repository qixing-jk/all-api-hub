import { useCallback } from "react"

import { MENU_ITEM_IDS } from "~/constants/optionsMenuIds"
import { useUserPreferencesContext } from "~/contexts/UserPreferencesContext"
import { pushWithinOptionsPage } from "~/utils/navigation"

import { useUsageAnalyticsCharts } from "./useUsageAnalyticsCharts"
import { useUsageAnalyticsData } from "./useUsageAnalyticsData"
import { useUsageAnalyticsExport } from "./useUsageAnalyticsExport"
import { useUsageAnalyticsFilters } from "./useUsageAnalyticsFilters"

/** Composes usage data, filtering, export, and chart interaction owners. */
export function useUsageAnalyticsViewModel() {
  const { currencyType } = useUserPreferencesContext()
  const data = useUsageAnalyticsData()
  const filters = useUsageAnalyticsFilters(data)
  const { handleExport } = useUsageAnalyticsExport({
    store: data.store,
    exportSelection: filters.exportSelection,
  })
  const charts = useUsageAnalyticsCharts({
    enabledAccounts: data.enabledAccounts,
    currencyType,
    filters,
  })
  const showNoDataState =
    !data.isLoading && (!data.store || filters.availableDayKeys.length === 0)
  const handleOpenAccountUsageSettings = useCallback(() => {
    pushWithinOptionsPage(`#${MENU_ITEM_IDS.BASIC}`, {
      tab: "accountUsage",
      anchor: "usage-history-sync",
    })
  }, [])
  return {
    data,
    filters,
    charts,
    currencyType,
    handleExport,
    showNoDataState,
    handleOpenAccountUsageSettings,
  }
}
