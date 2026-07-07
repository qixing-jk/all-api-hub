import type { TFunction } from "i18next"
import { Loader2, RefreshCcw } from "lucide-react"

import { Button } from "~/components/ui"

interface ManagedSiteTokenBatchExportStatusPanelsProps {
  t: TFunction
  previewError: string | null
  executionError: string | null
  isLoadingPreview: boolean
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
  isLoadingPreview,
  isRunning,
  onRefreshPreview,
}: ManagedSiteTokenBatchExportStatusPanelsProps) {
  return (
    <>
      {previewError ? (
        <div className="space-y-2 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-900/40 dark:bg-red-950/30 dark:text-red-300">
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
            disabled={isLoadingPreview || isRunning}
            onClick={onRefreshPreview}
          >
            {t("keyManagement:batchManagedSiteExport.actions.refreshPreview")}
          </Button>
        </div>
      ) : null}

      {executionError ? (
        <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-900/40 dark:bg-red-950/30 dark:text-red-300">
          {t("keyManagement:batchManagedSiteExport.messages.executionFailed", {
            error: executionError,
          })}
        </div>
      ) : null}

      {isLoadingPreview ? (
        <div className="text-muted-foreground rounded-md border p-3 text-sm">
          <div className="flex items-center gap-2">
            <Loader2 className="h-4 w-4 animate-spin" />
            {t("keyManagement:batchManagedSiteExport.preview.loading")}
          </div>
        </div>
      ) : null}
    </>
  )
}
