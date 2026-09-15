import { ArrowRightLeft } from "lucide-react"
import { useTranslation } from "react-i18next"

import {
  Alert,
  Card,
  CardContent,
  Heading3,
  WorkflowTransitionButton,
} from "~/components/ui"
import { MENU_ITEM_IDS } from "~/constants/optionsMenuIds"
import CloudSyncSettings from "~/features/ImportExport/components/CloudSyncSettings"
import { pushWithinOptionsPage } from "~/utils/navigation"

/**
 * Basic Settings tab for data backup/import/export and cloud sync settings.
 */
export default function DataBackupTab() {
  const { t } = useTranslation("settings")

  const handleNavigateToImportExport = () => {
    pushWithinOptionsPage(`#${MENU_ITEM_IDS.IMPORT_EXPORT}`)
  }

  return (
    <div className="space-y-density-6">
      {/* Import/Export Entry Section */}
      <section id="import-export-entry">
        <Heading3
          as="h2"
          className="mb-density-2 gap-y-density-2 flex items-center gap-x-2 text-xl"
        >
          <ArrowRightLeft
            className="text-theme-600 dark:text-theme-400 size-5 shrink-0"
            aria-hidden="true"
          />
          {t("dataBackup.importExport.title")}
        </Heading3>
        <Card>
          <CardContent className="space-y-density-4">
            <p className="text-secondary-foreground text-sm">
              {t("dataBackup.importExport.description")}
            </p>
            <div className="gap-y-density-3 flex flex-col gap-x-3 sm:flex-row">
              <WorkflowTransitionButton
                onClick={handleNavigateToImportExport}
                variant="default"
                className="justify-center"
                leftIcon={<ArrowRightLeft className="h-5 w-5" />}
              >
                {t("dataBackup.importExport.openPage")}
              </WorkflowTransitionButton>
            </div>
            <Alert variant="default">
              <p className="text-sm">{t("dataBackup.importExport.info")}</p>
            </Alert>
          </CardContent>
        </Card>
      </section>

      <CloudSyncSettings />
    </div>
  )
}
