import type { TFunction } from "i18next"

import { ManagedSiteIcon } from "~/components/icons/ManagedSiteIcon"
import { ActionGroup, Button } from "~/components/ui"
import type { ManagedSiteType } from "~/constants/siteType"
import { KEY_MANAGEMENT_TEST_IDS } from "~/features/KeyManagement/testIds"
import type {
  ManagedSiteTokenBatchExportExecutionResult,
  ManagedSiteTokenBatchExportPreview,
  ManagedSiteTokenBatchImportMode,
} from "~/types/managedSiteTokenBatchExport"

interface ManagedSiteTokenBatchExportFooterProps {
  t: TFunction
  siteType?: ManagedSiteType
  selectedItemCount: number
  preview: ManagedSiteTokenBatchExportPreview | null
  previewError: string | null
  executionResult: ManagedSiteTokenBatchExportExecutionResult | null
  isLoadingPreview: boolean
  isRunning: boolean
  selectedExecutableCount: number
  hasInvalidImportGroups?: boolean
  importMode?: ManagedSiteTokenBatchImportMode
  canRetry: boolean
  onClose: () => void
  onStart: () => void
  onRetry: () => void
  onViewChannels: () => void
}

/**
 * Renders the batch export dialog footer summary and primary actions.
 */
export function ManagedSiteTokenBatchExportFooter({
  t,
  siteType,
  selectedItemCount,
  preview,
  previewError,
  executionResult,
  isLoadingPreview,
  isRunning,
  selectedExecutableCount,
  hasInvalidImportGroups = false,
  importMode = "independent",
  canRetry,
  onClose,
  onStart,
  onRetry,
  onViewChannels,
}: ManagedSiteTokenBatchExportFooterProps) {
  const targetSiteType = preview?.siteType ?? siteType
  if (executionResult) {
    return (
      <div className="gap-y-density-3 flex flex-wrap items-center justify-between gap-x-3">
        <div className="text-muted-foreground min-w-0 flex-1 text-sm break-words">
          {t(
            importMode !== "independent"
              ? "keyManagement:batchManagedSiteExport.importMode.resultSummary"
              : "keyManagement:batchManagedSiteExport.results.summary",
            {
              created: executionResult.createdCount,
              failed: executionResult.failedCount,
              skipped: executionResult.skippedCount,
              total: executionResult.items.length,
              uncertain: executionResult.uncertainCount,
            },
          )}
        </div>
        <ActionGroup className="min-w-0">
          {canRetry ? (
            <Button
              type="button"
              variant="outline"
              className="h-auto min-h-(--density-control) whitespace-normal"
              onClick={onRetry}
              data-testid={
                KEY_MANAGEMENT_TEST_IDS.managedSiteBatchExportRetryButton
              }
            >
              {t("keyManagement:batchManagedSiteExport.actions.retry")}
            </Button>
          ) : null}
          {executionResult.createdCount > 0 ? (
            <Button
              type="button"
              variant="outline"
              className="h-auto min-h-(--density-control) whitespace-normal"
              onClick={onViewChannels}
            >
              {t("keyManagement:batchManagedSiteExport.actions.viewChannels")}
            </Button>
          ) : null}
          <Button
            type="button"
            className="h-auto min-h-(--density-control) whitespace-normal"
            onClick={onClose}
            data-testid={
              KEY_MANAGEMENT_TEST_IDS.managedSiteBatchExportCloseButton
            }
          >
            {t("common:actions.close")}
          </Button>
        </ActionGroup>
      </div>
    )
  }

  return (
    <div className="gap-y-density-3 flex flex-col items-stretch justify-between gap-x-3 sm:flex-row sm:items-center">
      <div className="text-muted-foreground min-w-0 text-sm break-words">
        {preview
          ? t("keyManagement:batchManagedSiteExport.preview.summary", {
              ready: preview.readyCount,
              warning: preview.warningCount,
              skipped: preview.skippedCount,
              blocked: preview.blockedCount,
              total: preview.totalCount,
            })
          : t("keyManagement:batchManagedSiteExport.preview.selected", {
              count: selectedItemCount,
            })}
      </div>
      <ActionGroup>
        <Button
          type="button"
          variant="outline"
          onClick={onClose}
          disabled={isRunning}
          data-testid={
            KEY_MANAGEMENT_TEST_IDS.managedSiteBatchExportCancelButton
          }
        >
          {t("common:actions.cancel")}
        </Button>
        <Button
          type="button"
          leftIcon={
            targetSiteType ? (
              <span aria-hidden="true">
                <ManagedSiteIcon siteType={targetSiteType} size="sm" />
              </span>
            ) : undefined
          }
          loading={isRunning}
          disabled={
            hasInvalidImportGroups ||
            isLoadingPreview ||
            !preview ||
            selectedExecutableCount === 0 ||
            Boolean(previewError)
          }
          onClick={onStart}
          data-testid={
            KEY_MANAGEMENT_TEST_IDS.managedSiteBatchExportStartButton
          }
        >
          {isRunning
            ? t("keyManagement:batchManagedSiteExport.actions.running")
            : t("keyManagement:batchManagedSiteExport.actions.start")}
        </Button>
      </ActionGroup>
    </div>
  )
}
