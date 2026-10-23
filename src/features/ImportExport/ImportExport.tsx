import { ArrowLeftRight, HardDrive } from "lucide-react"
import { useTranslation } from "react-i18next"

import { PageHeader } from "~/components/PageHeader"
import { Heading3 } from "~/components/ui"
import { MENU_ITEM_IDS } from "~/constants/optionsMenuIds"
import ExportSection from "~/features/ImportExport/backup/ExportSection"
import ImportSection from "~/features/ImportExport/backup/ImportSection"
import { useImportExport } from "~/features/ImportExport/backup/useImportExport"
import CloudSyncSettings from "~/features/ImportExport/cloudSync/CloudSyncSettings"
import { useOptionsTargetNavigation } from "~/features/OptionsMenu/useOptionsTargetNavigation"

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

  useOptionsTargetNavigation({ pageId: MENU_ITEM_IDS.IMPORT_EXPORT })

  return (
    <div className="space-y-density-6 py-density-4 sm:py-density-6 px-4 sm:px-6">
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
