import { Info, Upload } from "lucide-react"
import type { ReactNode } from "react"
import { useTranslation } from "react-i18next"

import {
  Button,
  Card,
  CardDescription,
  CardHeader,
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
} from "~/services/productAnalytics/contracts"

import { IMPORT_EXPORT_TEST_IDS } from "../testIds"
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
      tracker.complete(PRODUCT_ANALYTICS_RESULTS.Success)
    })
    .catch(() => {
      tracker.complete(PRODUCT_ANALYTICS_RESULTS.Failure, {
        errorCategory: PRODUCT_ANALYTICS_ERROR_CATEGORIES.Unknown,
      })
    })
}

/** Keep each export action beside its description in the two-column workspace. */
function ExportActionRow({
  id,
  title,
  description,
  rightContent,
}: {
  id: string
  title: string
  description: string
  rightContent: ReactNode
}) {
  return (
    <div id={id} className="flex items-center gap-4 px-6 py-4">
      <div className="min-w-0 flex-1 space-y-1">
        <p className="text-sm font-medium">{title}</p>
        <p className="text-muted-foreground text-xs leading-5">{description}</p>
      </div>
      <div className="shrink-0">{rightContent}</div>
    </div>
  )
}

/**
 * Export section offering controls for full backup, account data, and user settings.
 */
const ExportSection = ({ isExporting, setIsExporting }: ExportSectionProps) => {
  const { t } = useTranslation("importExport")
  return (
    <section id="export-section" className="flex min-w-0 flex-col">
      <Card padding="none" className="flex flex-1 flex-col">
        <CardHeader>
          <div className="flex items-center gap-2">
            <Upload className="h-5 w-5 text-sky-600 dark:text-sky-400" />
            <CardTitle className="mb-0 text-base">
              {t("export.title")}
            </CardTitle>
          </div>
          <CardDescription>{t("export.description")}</CardDescription>
        </CardHeader>

        <CardList className="flex-1">
          {/* 导出所有数据 */}
          <ExportActionRow
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
                variant="default"
                size="sm"
                loading={isExporting}
                data-testid={IMPORT_EXPORT_TEST_IDS.exportFullBackupButton}
              >
                {isExporting
                  ? t("common:status.exporting")
                  : t("common:actions.export")}
              </Button>
            }
          />

          {/* 导出账号数据 */}
          <ExportActionRow
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
                variant="secondary"
                size="sm"
                loading={isExporting}
                data-testid={IMPORT_EXPORT_TEST_IDS.exportAccountDataButton}
              >
                {isExporting
                  ? t("common:status.exporting")
                  : t("common:actions.export")}
              </Button>
            }
          />

          {/* 导出用户设置 */}
          <ExportActionRow
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
                data-testid={IMPORT_EXPORT_TEST_IDS.exportUserSettingsButton}
              >
                {isExporting
                  ? t("common:status.exporting")
                  : t("common:actions.export")}
              </Button>
            }
          />
        </CardList>
        <p className="text-muted-foreground dark:border-dark-bg-tertiary flex items-start gap-2 border-t border-gray-200 px-6 py-4 text-xs leading-5">
          <Info className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          <span>{t("export.sensitiveDataNotice")}</span>
        </p>
      </Card>
    </section>
  )
}

export default ExportSection
