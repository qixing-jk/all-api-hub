import type { TFunction } from "i18next"
import { Loader2, RefreshCcw } from "lucide-react"

import { Button } from "~/components/ui"

interface ManagedSiteTokenBatchExportStatusPanelsProps {
  t: TFunction
  previewError: string | null
  executionError: string | null
  isTargetChanged?: boolean
  isLoadingPreview: boolean
  isManualPreviewRefresh: boolean
  showPreviewLoadingStatus: boolean
  isRunning: boolean
  onRefreshPreview: () => void
}

/**
 * Renders preview loading, preview failure, and execution failure panels.
 */
export function ManagedSiteTokenBatchExportStatusPanels({
  t,
  previewError,
  executionError,
  isTargetChanged = false,
  isLoadingPreview,
  isManualPreviewRefresh,
  showPreviewLoadingStatus,
  isRunning,
  onRefreshPreview,
}: ManagedSiteTokenBatchExportStatusPanelsProps) {
  return (
    <>
      {previewError ? (
        <div className="border-destructive-border bg-destructive-soft text-destructive-soft-foreground space-y-density-2 py-density-3 rounded-md border px-3 text-sm">
          <div>
            {t("keyManagement:batchManagedSiteExport.preview.loadFailed", {
              error: previewError,
            })}
          </div>
          <Button
            type="button"
            size="sm"
            variant="outline"
            leftIcon={<RefreshCcw className="h-4 w-4" />}
            loading={isManualPreviewRefresh}
            disabled={isLoadingPreview || isRunning}
            onClick={onRefreshPreview}
          >
            {isManualPreviewRefresh
              ? t("keyManagement:batchManagedSiteExport.preview.loading")
              : t(
                  "keyManagement:batchManagedSiteExport.actions.refreshPreview",
                )}
          </Button>
        </div>
      ) : null}

      {executionError ? (
        <div className="border-destructive-border bg-destructive-soft text-destructive-soft-foreground py-density-3 rounded-md border px-3 text-sm">
          {isTargetChanged
            ? t("keyManagement:batchManagedSiteExport.messages.targetChanged")
            : t(
                "keyManagement:batchManagedSiteExport.messages.executionFailed",
                {
                  error: executionError,
                },
              )}
        </div>
      ) : null}

      {isLoadingPreview && showPreviewLoadingStatus ? (
        <div className="text-muted-foreground py-density-3 rounded-md border px-3 text-sm">
          <div className="gap-y-density-2 flex items-center gap-x-2">
            <Loader2 className="h-4 w-4 animate-spin" />
            {t("keyManagement:batchManagedSiteExport.preview.loading")}
          </div>
        </div>
      ) : null}
    </>
  )
}
