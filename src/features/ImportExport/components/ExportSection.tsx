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
import { startProductAnalyticsAction } from "~/services/productAnalytics/actions"
import {
  PRODUCT_ANALYTICS_ACTION_IDS,
  PRODUCT_ANALYTICS_ENTRYPOINTS,
  PRODUCT_ANALYTICS_ERROR_CATEGORIES,
  PRODUCT_ANALYTICS_FEATURE_IDS,
  PRODUCT_ANALYTICS_RESULTS,
  PRODUCT_ANALYTICS_SURFACE_IDS,
  type ProductAnalyticsActionId,
} from "~/services/productAnalytics/events"

import {
  handleExportAccounts,
  handleExportAll,
  handleExportPreferences,
} from "../utils"

interface ExportSectionProps {
  isExporting: boolean
  setIsExporting: (isExporting: boolean) => void
}

type ExportHandler = (
  setIsExporting: (isExporting: boolean) => void,
) => Promise<void>

/**
 * Tracks export intent and completion without inspecting exported data.
 */
function handleTrackedExport(
  exportHandler: ExportHandler,
  setIsExporting: (isExporting: boolean) => void,
  actionId: ProductAnalyticsActionId,
) {
  const tracker = startProductAnalyticsAction({
    featureId: PRODUCT_ANALYTICS_FEATURE_IDS.ImportExport,
    actionId,
    surfaceId: PRODUCT_ANALYTICS_SURFACE_IDS.OptionsImportExportExportSection,
    entrypoint: PRODUCT_ANALYTICS_ENTRYPOINTS.Options,
  })

  void exportHandler(setIsExporting)
    .then(() => {
      void tracker.complete(PRODUCT_ANALYTICS_RESULTS.Success)
    })
    .catch(() => {
      void tracker.complete(PRODUCT_ANALYTICS_RESULTS.Failure, {
        errorCategory: PRODUCT_ANALYTICS_ERROR_CATEGORIES.Unknown,
      })
    })
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
            id="export-full-backup"
            title={t("export.fullBackup")}
            description={t("export.fullBackupDescription")}
            rightContent={
              <Button
                onClick={() =>
                  handleTrackedExport(
                    handleExportAll,
                    setIsExporting,
                    PRODUCT_ANALYTICS_ACTION_IDS.ExportFullBackup,
                  )
                }
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
            id="export-account-data"
            title={t("export.accountData")}
            description={t("export.accountDataDescription")}
            rightContent={
              <Button
                onClick={() =>
                  handleTrackedExport(
                    handleExportAccounts,
                    setIsExporting,
                    PRODUCT_ANALYTICS_ACTION_IDS.ExportAccountData,
                  )
                }
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
            id="export-user-settings"
            title={t("export.userSettings")}
            description={t("export.userSettingsDescription")}
            rightContent={
              <Button
                onClick={() =>
                  handleTrackedExport(
                    handleExportPreferences,
                    setIsExporting,
                    PRODUCT_ANALYTICS_ACTION_IDS.ExportUserSettings,
                  )
                }
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
