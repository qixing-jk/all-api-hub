import { useState } from "react"
import toast from "react-hot-toast"
import { useTranslation } from "react-i18next"

import { useUserPreferencesContext } from "~/contexts/UserPreferencesContext"
import { userPreferences } from "~/services/preferences/userPreferences"
import { startProductAnalyticsAction } from "~/services/productAnalytics/actions"
import {
  PRODUCT_ANALYTICS_ACTION_IDS,
  PRODUCT_ANALYTICS_ENTRYPOINTS,
  PRODUCT_ANALYTICS_ERROR_CATEGORIES,
  PRODUCT_ANALYTICS_FEATURE_IDS,
  PRODUCT_ANALYTICS_RESULTS,
  PRODUCT_ANALYTICS_SURFACE_IDS,
} from "~/services/productAnalytics/events"
import { getErrorMessage } from "~/utils/core/error"
import { createLogger } from "~/utils/core/logger"
import { applyPreferenceLanguage } from "~/utils/i18n/applyPreferenceLanguage"

import { importFromBackupObject, parseBackupSummary } from "../utils"

/**
 * Unified logger scoped to the Import/Export options page hook.
 */
const logger = createLogger("ImportExportHook")

export const useImportExport = () => {
  const { t } = useTranslation()
  const { loadPreferences } = useUserPreferencesContext()
  const [isExporting, setIsExporting] = useState(false)
  const [isImporting, setIsImporting] = useState(false)
  const [importData, setImportData] = useState("")

  // 处理文件导入
  const handleFileImport = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return

    const reader = new FileReader()
    reader.onload = (e) => {
      const content = e.target?.result as string
      setImportData(content)
    }
    reader.readAsText(file)
  }

  // 导入数据
  const handleImport = async () => {
    const tracker = startProductAnalyticsAction({
      featureId: PRODUCT_ANALYTICS_FEATURE_IDS.ImportExport,
      actionId: PRODUCT_ANALYTICS_ACTION_IDS.ImportBackupData,
      surfaceId: PRODUCT_ANALYTICS_SURFACE_IDS.OptionsImportExportImportSection,
      entrypoint: PRODUCT_ANALYTICS_ENTRYPOINTS.Options,
    })

    if (!importData.trim()) {
      toast.error(t("importExport:import.selectFileImport"))
      tracker.complete(PRODUCT_ANALYTICS_RESULTS.Skipped)
      return
    }

    try {
      setIsImporting(true)

      const data = JSON.parse(importData)
      const result = await importFromBackupObject(data)
      const hasImportedSection = Object.values(result.sections ?? {}).some(
        Boolean,
      )
      if (result.allImported || result.sections?.preferences) {
        await loadPreferences()
        await applyPreferenceLanguage(await userPreferences.getLanguage())
      }
      if (result.allImported) {
        toast.success(t("importExport:import.importSuccess"))
      }
      if (result.allImported || hasImportedSection) {
        tracker.complete(PRODUCT_ANALYTICS_RESULTS.Success)
      } else {
        tracker.complete(PRODUCT_ANALYTICS_RESULTS.Skipped)
      }
    } catch (error) {
      logger.error("Import failed", error)
      if (error instanceof SyntaxError) {
        toast.error(t("importExport:import.formatError"))
        tracker.complete(PRODUCT_ANALYTICS_RESULTS.Failure, {
          errorCategory: PRODUCT_ANALYTICS_ERROR_CATEGORIES.Validation,
        })
      } else {
        toast.error(
          t("importExport:import.importFailed", {
            error: getErrorMessage(error),
          }),
        )
        tracker.complete(PRODUCT_ANALYTICS_RESULTS.Failure, {
          errorCategory: PRODUCT_ANALYTICS_ERROR_CATEGORIES.Unknown,
        })
      }
    } finally {
      setIsImporting(false)
    }
  }

  // 验证导入数据
  const validateImportData = () => {
    if (!importData.trim()) return null

    try {
      const summary = parseBackupSummary(importData, t("common:labels.unknown"))
      if (!summary || !("valid" in summary) || !summary.valid) {
        return { valid: false }
      }
      return summary
    } catch {
      return { valid: false }
    }
  }

  return {
    isExporting,
    setIsExporting,
    isImporting,
    importData,
    setImportData,
    handleFileImport,
    handleImport,
    validateImportData,
  }
}
