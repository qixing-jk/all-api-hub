import { useCallback } from "react"
import toast from "react-hot-toast"
import { useTranslation } from "react-i18next"

import { computeUsageHistoryExport } from "~/services/history/usageHistory/analytics"
import { startProductAnalyticsAction } from "~/services/productAnalytics/actions"
import {
  PRODUCT_ANALYTICS_ACTION_IDS,
  PRODUCT_ANALYTICS_ENTRYPOINTS,
  PRODUCT_ANALYTICS_ERROR_CATEGORIES,
  PRODUCT_ANALYTICS_FEATURE_IDS,
  PRODUCT_ANALYTICS_MODE_IDS,
  PRODUCT_ANALYTICS_RESULTS,
  PRODUCT_ANALYTICS_SURFACE_IDS,
} from "~/services/productAnalytics/events"
import type {
  UsageHistoryExport,
  UsageHistoryExportSelection,
  UsageHistoryStore,
} from "~/types/usageHistory"
import { getErrorMessage } from "~/utils/core/error"

const DAY_MS = 24 * 60 * 60 * 1000

/**
 * Parses a stored UTC day key into a timestamp for range math.
 */
function parseDayKey(dayKey: string) {
  const timestamp = Date.parse(`${dayKey}T00:00:00.000Z`)
  return Number.isFinite(timestamp) ? timestamp : undefined
}

/**
 * Counts the inclusive day span selected for export.
 */
function getInclusiveDayCount(selection: UsageHistoryExportSelection) {
  const start = parseDayKey(selection.startDay)
  const end = parseDayKey(selection.endDay)

  if (start === undefined || end === undefined || end < start) return 0

  return Math.floor((end - start) / DAY_MS) + 1
}

/**
 * Checks whether the prepared export contains any usage records.
 */
function hasExportedUsageData(exportData: UsageHistoryExport) {
  const fused = exportData.fused

  return (
    Object.keys(fused.daily ?? {}).length > 0 ||
    Object.keys(fused.hourly ?? {}).length > 0 ||
    Object.keys(fused.byModel ?? {}).length > 0 ||
    Object.keys(fused.byToken ?? {}).length > 0 ||
    Object.values(exportData.accounts).some(
      (account) =>
        Object.keys(account.daily ?? {}).length > 0 ||
        Object.keys(account.hourly ?? {}).length > 0 ||
        Object.keys(account.dailyByModel ?? {}).length > 0 ||
        Object.keys(account.dailyByToken ?? {}).length > 0,
    )
  )
}

export const useUsageAnalyticsExport = (params: {
  store: UsageHistoryStore | null
  exportSelection: UsageHistoryExportSelection | null
}) => {
  const { store, exportSelection } = params
  const { t } = useTranslation("usageAnalytics")

  const handleExport = useCallback(async () => {
    const tracker = startProductAnalyticsAction({
      featureId: PRODUCT_ANALYTICS_FEATURE_IDS.UsageAnalytics,
      actionId: PRODUCT_ANALYTICS_ACTION_IDS.ExportUsageAnalyticsData,
      surfaceId: PRODUCT_ANALYTICS_SURFACE_IDS.OptionsUsageAnalyticsHeader,
      entrypoint: PRODUCT_ANALYTICS_ENTRYPOINTS.Options,
    })

    if (!store || !exportSelection) {
      toast.error(t("messages.error.exportNoData"))
      await tracker.complete(PRODUCT_ANALYTICS_RESULTS.Skipped)
      return
    }

    try {
      const exportData = computeUsageHistoryExport({
        store,
        selection: exportSelection,
      })
      const selectedAccountCount =
        exportSelection.accountIds.length > 0
          ? exportSelection.accountIds.length
          : Object.keys(store.accounts).length
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
      await tracker.complete(PRODUCT_ANALYTICS_RESULTS.Success, {
        insights: {
          mode:
            exportSelection.accountIds.length > 0
              ? PRODUCT_ANALYTICS_MODE_IDS.Selected
              : PRODUCT_ANALYTICS_MODE_IDS.All,
          selectedCount: selectedAccountCount,
          itemCount: getInclusiveDayCount(exportSelection),
          usageDataPresent: hasExportedUsageData(exportData),
        },
      })
    } catch (error) {
      toast.error(
        t("messages.error.exportFailed", { error: getErrorMessage(error) }),
      )
      await tracker.complete(PRODUCT_ANALYTICS_RESULTS.Failure, {
        errorCategory: PRODUCT_ANALYTICS_ERROR_CATEGORIES.Unknown,
      })
    }
  }, [exportSelection, store, t])

  return { handleExport }
}
