import { useCallback } from "react"

import { BASIC_SETTINGS_TAB_IDS } from "~/constants/basicSettingsTabs"
import { MENU_ITEM_IDS } from "~/constants/optionsMenuIds"
import { SETTINGS_ANCHORS } from "~/constants/settingsAnchors"
import { useUserPreferencesContext } from "~/contexts/UserPreferencesContext"
import { useUsageAnalyticsCharts } from "~/features/UsageAnalytics/charts/useUsageAnalyticsCharts"
import { useUsageAnalyticsData } from "~/features/UsageAnalytics/data/useUsageAnalyticsData"
import { useUsageAnalyticsExport } from "~/features/UsageAnalytics/export/useUsageAnalyticsExport"
import { useUsageAnalyticsFilters } from "~/features/UsageAnalytics/filtering/useUsageAnalyticsFilters"
import { pushWithinOptionsPage } from "~/utils/navigation/optionsPage"

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
      tab: BASIC_SETTINGS_TAB_IDS.AccountUsage,
      anchor: SETTINGS_ANCHORS.USAGE_HISTORY_SYNC,
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
