import type { TFunction } from "i18next"
import { SendToBack } from "lucide-react"

import { Button } from "~/components/ui"
import { KEY_MANAGEMENT_TEST_IDS } from "~/features/KeyManagement/testIds"
import type {
  ManagedSiteTokenBatchExportExecutionResult,
  ManagedSiteTokenBatchExportPreview,
} from "~/types/managedSiteTokenBatchExport"

interface ManagedSiteTokenBatchExportFooterProps {
  t: TFunction
  selectedItemCount: number
  preview: ManagedSiteTokenBatchExportPreview | null
  previewError: string | null
  executionResult: ManagedSiteTokenBatchExportExecutionResult | null
  isLoadingPreview: boolean
  isRunning: boolean
  selectedExecutableCount: number
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
  selectedItemCount,
  preview,
  previewError,
  executionResult,
  isLoadingPreview,
  isRunning,
  selectedExecutableCount,
  canRetry,
  onClose,
  onStart,
  onRetry,
  onViewChannels,
}: ManagedSiteTokenBatchExportFooterProps) {
  if (executionResult) {
    return (
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="text-muted-foreground min-w-0 flex-1 text-sm break-words">
          {t("keyManagement:batchManagedSiteExport.results.summary", {
            created: executionResult.createdCount,
            failed: executionResult.failedCount,
            skipped: executionResult.skippedCount,
            total: executionResult.items.length,
          })}
        </div>
        <div className="flex min-w-0 flex-wrap items-center justify-end gap-2">
          {canRetry ? (
            <Button
              type="button"
              variant="outline"
              className="h-auto min-h-9 whitespace-normal"
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
              className="h-auto min-h-9 whitespace-normal"
              onClick={onViewChannels}
            >
              {t("keyManagement:batchManagedSiteExport.actions.viewChannels")}
            </Button>
          ) : null}
          <Button
            type="button"
            className="h-auto min-h-9 whitespace-normal"
            onClick={onClose}
            data-testid={
              KEY_MANAGEMENT_TEST_IDS.managedSiteBatchExportCloseButton
            }
          >
            {t("common:actions.close")}
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="flex items-center justify-between gap-3">
      <div className="text-muted-foreground text-sm">
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
      <div className="flex items-center gap-2">
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
          leftIcon={<SendToBack className="h-4 w-4" />}
          loading={isRunning}
          disabled={
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
      </div>
    </div>
  )
}
