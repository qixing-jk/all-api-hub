import { useMemo, useState } from "react"
import toast from "react-hot-toast"
import { useTranslation } from "react-i18next"

import { useUserPreferencesContext } from "~/contexts/UserPreferencesContext"
import {
  IMPORT_SECTION_STRATEGIES,
  type ImportPlan,
} from "~/services/importExport/importExportService"
import { userPreferences } from "~/services/preferences/userPreferences"
import { startProductAnalyticsAction } from "~/services/productAnalytics/actions"
import {
  PRODUCT_ANALYTICS_ACTION_IDS,
  PRODUCT_ANALYTICS_ENTRYPOINTS,
  PRODUCT_ANALYTICS_ERROR_CATEGORIES,
  PRODUCT_ANALYTICS_FEATURE_IDS,
  PRODUCT_ANALYTICS_RESULTS,
  PRODUCT_ANALYTICS_SURFACE_IDS,
} from "~/services/productAnalytics/contracts"
import { getErrorMessage } from "~/utils/core/error"
import { createLogger } from "~/utils/core/logger"
import { applyPreferenceLanguage } from "~/utils/i18n/applyPreferenceLanguage"

import { importFromBackupObject, parseBackupSummary } from "../utils"

/**
 * Unified logger scoped to the Import/Export options page hook.
 */
const logger = createLogger("ImportExportHook")

export type ManualImportPlan = Required<ImportPlan>

const DEFAULT_IMPORT_PLAN: ManualImportPlan = {
  accounts: IMPORT_SECTION_STRATEGIES.Skip,
  apiCredentialProfiles: IMPORT_SECTION_STRATEGIES.Skip,
  channelConfigs: IMPORT_SECTION_STRATEGIES.Skip,
  preferences: IMPORT_SECTION_STRATEGIES.Skip,
}

/**
 * Builds the safest initial choices for the data types present in a backup.
 */
function createDefaultImportPlan(summary: {
  hasAccounts?: boolean
  hasPreferences?: boolean
  hasChannelConfigs?: boolean
  hasApiCredentialProfiles?: boolean
}): ManualImportPlan {
  return {
    accounts: summary.hasAccounts
      ? IMPORT_SECTION_STRATEGIES.Merge
      : IMPORT_SECTION_STRATEGIES.Skip,
    apiCredentialProfiles: summary.hasApiCredentialProfiles
      ? IMPORT_SECTION_STRATEGIES.Merge
      : IMPORT_SECTION_STRATEGIES.Skip,
    channelConfigs: summary.hasChannelConfigs
      ? IMPORT_SECTION_STRATEGIES.Merge
      : IMPORT_SECTION_STRATEGIES.Skip,
    preferences: IMPORT_SECTION_STRATEGIES.Skip,
  }
}

/**
 * Parses import text into the UI validation shape, collapsing invalid or broken
 * summaries into the same non-throwing result.
 */
function parseValidBackupSummary(importData: string, unknownLabel: string) {
  if (!importData.trim()) return null

  try {
    const summary = parseBackupSummary(importData, unknownLabel)
    if (!summary || !("valid" in summary) || !summary.valid) {
      return { valid: false } as const
    }
    return summary
  } catch {
    return { valid: false } as const
  }
}

export const useImportExport = () => {
  const { t } = useTranslation()
  const { loadPreferences } = useUserPreferencesContext()
  const [isExporting, setIsExporting] = useState(false)
  const [isImporting, setIsImporting] = useState(false)
  const [importPlan, setImportPlan] =
    useState<ManualImportPlan>(DEFAULT_IMPORT_PLAN)
  const [importData, setImportData] = useState("")

  const validation = useMemo(() => {
    return parseValidBackupSummary(importData, t("common:labels.unknown"))
  }, [importData, t])

  const updateImportData = (data: string) => {
    setImportData(data)
    const summary = parseValidBackupSummary(data, t("common:labels.unknown"))
    setImportPlan(
      summary?.valid ? createDefaultImportPlan(summary) : DEFAULT_IMPORT_PLAN,
    )
  }

  // 处理文件导入
  const handleFileImport = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return

    const reader = new FileReader()
    reader.onload = (e) => {
      const content = e.target?.result as string
      updateImportData(content)
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
      const result = await importFromBackupObject(data, { plan: importPlan })
      const hasImportedSection = Object.values(result.sections ?? {}).some(
        Boolean,
      )
      if (result.sections?.preferences) {
        await loadPreferences()
        await applyPreferenceLanguage(await userPreferences.getLanguage())
      }
      if (result.allImported) {
        toast.success(t("importExport:import.importSuccess"))
      } else if (hasImportedSection) {
        toast.success(t("importExport:import.importSelectedSuccess"))
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

  return {
    isExporting,
    setIsExporting,
    isImporting,
    importPlan,
    setImportPlan,
    importData,
    setImportData: updateImportData,
    handleFileImport,
    handleImport,
    validation,
  }
}
