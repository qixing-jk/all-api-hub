import {
  ArrowsRightLeftIcon,
  ArrowTopRightOnSquareIcon
} from "@heroicons/react/24/outline"
import { useTranslation } from "react-i18next"

import { Alert, Button, Card, CardContent, Heading4 } from "~/components/ui"

import WebDAVAutoSyncSettings from "../../ImportExport/components/WebDAVAutoSyncSettings"
import WebDAVSettings from "../../ImportExport/components/WebDAVSettings"

export default function DataBackupTab() {
  const { t } = useTranslation("settings")

  const handleNavigateToImportExport = () => {
    const url = browser.runtime.getURL("options.html#importExport")
    window.location.href = url
  }

  const handleNavigateToSection = (section: "import" | "export") => {
    const hash = section === "import" ? "import-section" : "export-section"
    const url = browser.runtime.getURL(`options.html#importExport#${hash}`)
    window.location.href = url
  }

  return (
    <div className="space-y-6">
      {/* Import/Export Entry Section */}
      <section id="import-export-entry">
        <Heading4 className="mb-2">
          {t("dataBackup.importExport.title")}
        </Heading4>
        <Card>
          <CardContent className="space-y-4">
            <p className="text-sm text-gray-700 dark:text-gray-300">
              {t("dataBackup.importExport.description")}
            </p>
            <div className="flex flex-col gap-3 sm:flex-row">
              <Button
                onClick={handleNavigateToImportExport}
                variant="secondary"
                className="flex items-center justify-center gap-2">
                <ArrowsRightLeftIcon className="h-5 w-5" />
                <span>{t("dataBackup.importExport.openPage")}</span>
                <ArrowTopRightOnSquareIcon className="h-4 w-4" />
              </Button>
              <Button
                onClick={() => handleNavigateToSection("import")}
                variant="default"
                className="flex items-center justify-center gap-2">
                <span>{t("dataBackup.importExport.openImport")}</span>
                <ArrowTopRightOnSquareIcon className="h-4 w-4" />
              </Button>
              <Button
                onClick={() => handleNavigateToSection("export")}
                variant="default"
                className="flex items-center justify-center gap-2">
                <span>{t("dataBackup.importExport.openExport")}</span>
                <ArrowTopRightOnSquareIcon className="h-4 w-4" />
              </Button>
            </div>
            <Alert variant="info">
              <p className="text-sm">{t("dataBackup.importExport.info")}</p>
            </Alert>
          </CardContent>
        </Card>
      </section>

      {/* WebDAV Section */}
      <section id="webdav">
        <WebDAVSettings />
      </section>

      {/* WebDAV Auto-Sync Section */}
      <section id="webdav-auto-sync">
        <WebDAVAutoSyncSettings />
      </section>
    </div>
  )
}
