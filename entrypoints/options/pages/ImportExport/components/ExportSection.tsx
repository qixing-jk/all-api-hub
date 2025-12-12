import { ArrowUpTrayIcon } from "@heroicons/react/24/outline"
import { useTranslation } from "react-i18next"

import {
  Button,
  Card,
  CardDescription,
  CardHeader,
  CardItem,
  CardList,
  CardTitle,
} from "~/components/ui"

import {
  handleExportAccounts,
  handleExportAll,
  handleExportCCSwitch,
  handleExportPreferences,
} from "../utils"

interface ExportSectionProps {
  isExporting: boolean
  setIsExporting: (isExporting: boolean) => void
}

/**
 * Export section offering controls for full backup, account data, and user settings.
 */
const ExportSection = ({ isExporting, setIsExporting }: ExportSectionProps) => {
  const { t } = useTranslation("importExport")
  return (
    <section id="export-section" className="flex h-full">
      <Card padding="none" className="flex flex-1 flex-col">
        <CardHeader>
          <div className="flex items-center gap-2">
            <ArrowUpTrayIcon className="h-5 w-5 text-green-600 dark:text-green-400" />
            <CardTitle className="mb-0">{t("export.title")}</CardTitle>
          </div>
          <CardDescription>{t("export.description")}</CardDescription>
        </CardHeader>

        <CardList className="flex flex-1 flex-col">
          {/* 导出所有数据 */}
          <CardItem
            className="flex flex-1 items-center"
            title={t("export.fullBackup")}
            description={t("export.fullBackupDescription")}
            rightContent={
              <Button
                onClick={() => handleExportAll(setIsExporting)}
                disabled={isExporting}
                variant="success"
                size="sm"
                loading={isExporting}
              >
                {isExporting
                  ? t("common:status.exporting")
                  : t("common:actions.export")}
              </Button>
            }
          />

          {/* 导出账号数据 */}
          <CardItem
            className="flex flex-1 items-center"
            title={t("export.accountData")}
            description={t("export.accountDataDescription")}
            rightContent={
              <Button
                onClick={() => handleExportAccounts(setIsExporting)}
                disabled={isExporting}
                variant="default"
                size="sm"
                loading={isExporting}
              >
                {isExporting
                  ? t("common:status.exporting")
                  : t("common:actions.export")}
              </Button>
            }
          />

          {/* 导出用户设置 */}
          <CardItem
            className="flex flex-1 items-center"
            title={t("export.userSettings")}
            description={t("export.userSettingsDescription")}
            rightContent={
              <Button
                onClick={() => handleExportPreferences(setIsExporting)}
                disabled={isExporting}
                variant="secondary"
                size="sm"
                loading={isExporting}
              >
                {isExporting
                  ? t("common:status.exporting")
                  : t("common:actions.export")}
              </Button>
            }
          />

          {/* 导出 CC Switch 配置 */}
          <CardItem
            className="flex flex-1 items-center"
            title={t("export.ccSwitch")}
            description={t("export.ccSwitchDescription")}
            rightContent={
              <Button
                onClick={() => handleExportCCSwitch(setIsExporting)}
                disabled={isExporting}
                variant="outline"
                size="sm"
                loading={isExporting}
              >
                {isExporting
                  ? t("common:status.exporting")
                  : t("common:actions.export")}
              </Button>
            }
          />
        </CardList>
      </Card>
    </section>
  )
}

export default ExportSection
