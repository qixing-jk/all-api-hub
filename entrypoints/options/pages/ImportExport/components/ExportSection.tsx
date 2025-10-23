import { ArrowUpTrayIcon } from "@heroicons/react/24/outline"
import { useTranslation } from "react-i18next"

import {
  Button,
  Card,
  CardDescription,
  CardHeader,
  CardItem,
  CardList,
  CardTitle
} from "~/components/ui"

import {
  handleExportAccounts,
  handleExportAll,
  handleExportPreferences
} from "../utils"

interface ExportSectionProps {
  isExporting: boolean
  setIsExporting: (isExporting: boolean) => void
}

const ExportSection = ({ isExporting, setIsExporting }: ExportSectionProps) => {
  const { t } = useTranslation("importExport")
  return (
    <section className="flex h-full">
      <Card padding="none" className="flex flex-col flex-1">
        <CardHeader>
          <div className="flex items-center gap-2">
            <ArrowUpTrayIcon className="w-5 h-5 text-green-600 dark:text-green-400" />
            <CardTitle className="mb-0">{t("export.title")}</CardTitle>
          </div>
          <CardDescription>{t("export.description")}</CardDescription>
        </CardHeader>

        <CardList className="flex flex-col flex-1">
          {/* 导出所有数据 */}
          <CardItem
            className="flex-1 flex items-center"
            title={t("export.fullBackup")}
            description={t("export.fullBackupDescription")}
            rightContent={
              <Button
                onClick={() => handleExportAll(setIsExporting)}
                disabled={isExporting}
                variant="success"
                size="sm"
                loading={isExporting}>
                {isExporting
                  ? t("common:status.exporting")
                  : t("common:actions.export")}
              </Button>
            }
          />

          {/* 导出账号数据 */}
          <CardItem
            className="flex-1 flex items-center"
            title={t("export.accountData")}
            description={t("export.accountDataDescription")}
            rightContent={
              <Button
                onClick={() => handleExportAccounts(setIsExporting)}
                disabled={isExporting}
                variant="default"
                size="sm"
                loading={isExporting}>
                {isExporting
                  ? t("common:status.exporting")
                  : t("common:actions.export")}
              </Button>
            }
          />

          {/* 导出用户设置 */}
          <CardItem
            className="flex-1 flex items-center"
            title={t("export.userSettings")}
            description={t("export.userSettingsDescription")}
            rightContent={
              <Button
                onClick={() => handleExportPreferences(setIsExporting)}
                disabled={isExporting}
                variant="secondary"
                size="sm"
                loading={isExporting}
                className="bg-purple-600 hover:bg-purple-700 dark:bg-purple-600 dark:hover:bg-purple-700 text-white">
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
