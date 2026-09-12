import { ArrowLeftRight } from "lucide-react"
import { useEffect } from "react"
import { useTranslation } from "react-i18next"

import { PageHeader } from "~/components/PageHeader"
import {
  clearHighlightSearchParam,
  highlightSearchTarget,
  OPTIONS_SEARCH_ANCHOR_PARAM,
  OPTIONS_SEARCH_HIGHLIGHT_PARAM,
} from "~/entrypoints/options/search/navigation"
import { navigateToAnchor } from "~/utils/core/url"

import CloudSyncSettings from "./components/CloudSyncSettings"
import ExportSection from "./components/ExportSection"
import ImportSection from "./components/ImportSection"
import { useImportExport } from "./hooks/useImportExport"

/**
 * Import/Export page combining local migration and cloud sync.
 */
export default function ImportExport() {
  const { t } = useTranslation("importExport")
  const {
    isExporting,
    setIsExporting,
    isImporting,
    importPlan,
    setImportPlan,
    importData,
    setImportData,
    handleFileImport,
    handleImport,
    validation,
  } = useImportExport()

  useEffect(() => {
    let anchorTimer: number | undefined
    let highlightTimer: number | undefined
    const applyUrlState = () => {
      window.clearTimeout(anchorTimer)
      window.clearTimeout(highlightTimer)
      const searchParams = new URLSearchParams(window.location.search)
      const pendingAnchor = searchParams.get(OPTIONS_SEARCH_ANCHOR_PARAM)
      const pendingHighlight = searchParams.get(OPTIONS_SEARCH_HIGHLIGHT_PARAM)

      if (pendingAnchor) {
        anchorTimer = window.setTimeout(() => {
          navigateToAnchor(pendingAnchor)
        }, 120)
      }

      if (pendingHighlight) {
        highlightTimer = window.setTimeout(() => {
          if (!highlightSearchTarget(pendingHighlight)) {
            clearHighlightSearchParam()
            return
          }

          clearHighlightSearchParam()
        }, 220)
      }
    }
    applyUrlState()
    window.addEventListener("popstate", applyUrlState)
    window.addEventListener("hashchange", applyUrlState)

    return () => {
      window.removeEventListener("popstate", applyUrlState)
      window.removeEventListener("hashchange", applyUrlState)
      if (anchorTimer !== undefined) {
        window.clearTimeout(anchorTimer)
      }
      if (highlightTimer !== undefined) {
        window.clearTimeout(highlightTimer)
      }
    }
  }, [])

  return (
    <div className="space-y-6 p-6">
      <PageHeader
        icon={ArrowLeftRight}
        title={t("title")}
        description={t("description")}
      />

      <section
        id="local-backup-migration"
        className="space-y-4 rounded-xl border border-gray-200 bg-gray-50/60 p-4 sm:p-5 dark:border-gray-700 dark:bg-gray-900/20"
      >
        <div className="space-y-1">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
            {t("localBackup.title")}
          </h2>
          <p className="text-sm text-gray-600 dark:text-gray-400">
            {t("localBackup.description")}
          </p>
        </div>

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 lg:items-stretch">
          <ExportSection
            isExporting={isExporting}
            setIsExporting={setIsExporting}
          />
          <ImportSection
            importData={importData}
            setImportData={setImportData}
            importPlan={importPlan}
            setImportPlan={setImportPlan}
            handleFileImport={handleFileImport}
            handleImport={handleImport}
            isImporting={isImporting}
            validation={validation}
          />
        </div>
      </section>

      <CloudSyncSettings />
    </div>
  )
}
