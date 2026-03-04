import { useCallback } from "react"
import toast from "react-hot-toast"
import { useTranslation } from "react-i18next"

import { computeUsageHistoryExport } from "~/src/services/history/usageHistory/analytics"
import type {
  UsageHistoryExportSelection,
  UsageHistoryStore,
} from "~/src/types/usageHistory"
import { getErrorMessage } from "~/src/utils/core/error"

export const useUsageAnalyticsExport = (params: {
  store: UsageHistoryStore | null
  exportSelection: UsageHistoryExportSelection | null
}) => {
  const { store, exportSelection } = params
  const { t } = useTranslation("usageAnalytics")

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

  return { handleExport }
}
