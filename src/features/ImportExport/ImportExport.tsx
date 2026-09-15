import { ArrowLeftRight, HardDrive } from "lucide-react"
import { useEffect } from "react"
import { useTranslation } from "react-i18next"

import { PageHeader } from "~/components/PageHeader"
import { Heading3 } from "~/components/ui"
import {
  clearHighlightSearchParam,
  highlightSearchTarget,
  OPTIONS_SEARCH_ANCHOR_PARAM,
  OPTIONS_SEARCH_HIGHLIGHT_PARAM,
} from "~/features/OptionsSearch/navigation"
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
    <div className="space-y-density-6 py-density-6 px-6">
      <PageHeader
        icon={ArrowLeftRight}
        title={t("title")}
        description={t("description")}
      />

      <section id="local-backup-migration" className="space-y-density-4">
        <div className="space-y-density-1">
          <Heading3
            as="h2"
            className="gap-y-density-2 flex items-center gap-x-2"
          >
            <HardDrive
              className="text-theme-600 dark:text-theme-400 size-5 shrink-0"
              aria-hidden="true"
            />
            {t("localBackup.title")}
          </Heading3>
          <p className="text-muted-foreground text-sm">
            {t("localBackup.description")}
          </p>
        </div>

        <div className="gap-y-density-4 grid grid-cols-1 gap-x-4 xl:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
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
