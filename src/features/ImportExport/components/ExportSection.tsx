import { ArrowUpTrayIcon } from "@heroicons/react/24/outline"
import { useState } from "react"
import { useTranslation } from "react-i18next"

import {
  Button,
  Card,
  CardDescription,
  CardHeader,
  CardItem,
  CardList,
  Checkbox,
  CardTitle,
  Label,
} from "~/components/ui"

interface ExportSectionProps {
  isExporting: boolean
  onExportAll: (options: { includeAccountKeys: boolean }) => void
  onExportAccounts: (options: { includeAccountKeys: boolean }) => void
  onExportPreferences: () => void
}

/**
 * Export section offering controls for full backup, account data, and user settings.
 */
const ExportSection = ({
  isExporting,
  onExportAll,
  onExportAccounts,
  onExportPreferences,
}: ExportSectionProps) => {
  const { t } = useTranslation("importExport")
  const [includeAccountKeys, setIncludeAccountKeys] = useState(false)

  const exportOptions = {
    includeAccountKeys,
  }

  return (
    <section id="export-section" className="flex h-full">
      <Card padding="none" className="flex flex-1 flex-col">
        <CardHeader>
          <div className="flex items-center gap-2">
            <ArrowUpTrayIcon className="h-5 w-5 text-green-600 dark:text-green-400" />
            <CardTitle className="mb-0">{t("export.title")}</CardTitle>
          </div>
          <CardDescription>{t("export.description")}</CardDescription>
          <div className="mt-3 flex items-start gap-2">
            <Checkbox
              id="include-account-keys"
              checked={includeAccountKeys}
              onCheckedChange={(checked) => setIncludeAccountKeys(checked === true)}
            />
            <div className="space-y-1">
              <Label htmlFor="include-account-keys">
                {t("export.includeAccountKeys")}
              </Label>
              <p className="text-muted-foreground text-sm">
                {t("export.includeAccountKeysDescription")}
              </p>
            </div>
          </div>
        </CardHeader>

        <CardList className="flex flex-1 flex-col">
          {/* 导出所有数据 */}
          <CardItem
            title={t("export.fullBackup")}
            description={t("export.fullBackupDescription")}
            rightContent={
              <Button
                onClick={() => onExportAll(exportOptions)}
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
            title={t("export.accountData")}
            description={t("export.accountDataDescription")}
            rightContent={
              <Button
                onClick={() => onExportAccounts(exportOptions)}
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
            title={t("export.userSettings")}
            description={t("export.userSettingsDescription")}
            rightContent={
              <Button
                onClick={onExportPreferences}
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
        </CardList>
      </Card>
    </section>
  )
}

export default ExportSection
