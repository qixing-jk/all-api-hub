import { ArrowLeftRight } from "lucide-react"
import { useTranslation } from "react-i18next"

import {
  Card,
  CardContent,
  Heading3,
  InlineMessage,
  WorkflowTransitionButton,
} from "~/components/ui"
import { MENU_ITEM_IDS } from "~/constants/optionsMenuIds"
import CloudSyncSettings from "~/features/ImportExport/cloudSync/CloudSyncSettings"
import { pushWithinOptionsPage } from "~/utils/navigation/optionsPage"

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
          className="mb-density-2 flex items-center gap-x-2 gap-y-density-2 text-xl"
        >
          <ArrowLeftRight
            className="size-5 shrink-0 text-theme-600 dark:text-theme-400"
            aria-hidden="true"
          />
          {t("dataBackup.importExport.title")}
        </Heading3>
        <Card>
          <CardContent className="space-y-density-4">
            <p className="text-sm text-secondary-foreground">
              {t("dataBackup.importExport.description")}
            </p>
            <div className="flex flex-col gap-x-3 gap-y-density-3 sm:flex-row">
              <WorkflowTransitionButton
                onClick={handleNavigateToImportExport}
                variant="default"
                className="justify-center"
                leftIcon={<ArrowLeftRight className="h-5 w-5" />}
              >
                {t("dataBackup.importExport.openPage")}
              </WorkflowTransitionButton>
            </div>
            <InlineMessage tone="neutral" role="note">
              <p className="text-sm">{t("dataBackup.importExport.info")}</p>
            </InlineMessage>
          </CardContent>
        </Card>
      </section>

      {/* Cloud Sync Settings Section */}
      <CloudSyncSettings />
    </div>
  )
}
