import { ArrowLeftRight } from "lucide-react"
import { useTranslation } from "react-i18next"

import { Alert } from "~/components/ui"
import { PageHeader } from "~/entrypoints/options/components/PageHeader"

import ExportSection from "./components/ExportSection"
import ImportSection from "./components/ImportSection"
import WebDAVAutoSyncSettings from "./components/WebDAVAutoSyncSettings"
import WebDAVSettings from "./components/WebDAVSettings"
import { useImportExport } from "./hooks/useImportExport"

export default function ImportExport() {
  const { t } = useTranslation("importExport")
  const {
    isExporting,
    setIsExporting,
    isImporting,
    importData,
    setImportData,
    handleFileImport,
    handleImport,
    validateImportData,
  } = useImportExport()

  const validation = validateImportData()

  return (
    <div className="space-y-6 p-6">
      <PageHeader
        icon={ArrowLeftRight}
        title={t("title")}
        description={t("description")}
      />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2 lg:items-stretch">
        <ExportSection
          isExporting={isExporting}
          setIsExporting={setIsExporting}
        />
        <ImportSection
          importData={importData}
          setImportData={setImportData}
          handleFileImport={handleFileImport}
          handleImport={handleImport}
          isImporting={isImporting}
          validation={validation}
        />
      </div>

      {/* WebDAV 备份/同步 */}
      <WebDAVSettings />

      {/* WebDAV 自动同步 */}
      <WebDAVAutoSyncSettings />

      {/* 重要提示 */}
      <Alert variant="warning">
        <div>
          <p className="mb-2 font-medium">{t("notice.importantNotice")}</p>
          <ul className="space-y-1 text-sm">
            <li>• {t("notice.importWarning1")}</li>
            <li>• {t("notice.importWarning2")}</li>
            <li>• {t("notice.importWarning3")}</li>
            <li>• {t("notice.importWarning4")}</li>
          </ul>
        </div>
      </Alert>
    </div>
  )
}
