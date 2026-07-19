import type { TFunction } from "i18next"
import { RefreshCcw } from "lucide-react"
import { useId } from "react"

import {
  Button,
  Checkbox,
  type CompactMultiSelectOption,
} from "~/components/ui"
import type {
  ManagedSiteTokenBatchExportExecutionResult,
  ManagedSiteTokenBatchExportMatchedChannel,
  ManagedSiteTokenBatchExportPreview,
  ManagedSiteTokenBatchExportPreviewItem,
} from "~/types/managedSiteTokenBatchExport"

import { ManagedSiteTokenBatchExportPreviewRow } from "./ManagedSiteTokenBatchExportPreviewRow"

interface ManagedSiteTokenBatchExportPreviewListProps {
  t: TFunction
  preview: ManagedSiteTokenBatchExportPreview
  selectedIds: Set<string>
  executableSelection: {
    checked: boolean | "indeterminate"
    itemCount: number
    selectedCount: number
  }
  modelOptions: CompactMultiSelectOption[]
  executionResult: ManagedSiteTokenBatchExportExecutionResult | null
  isLoadingPreview: boolean
  isManualPreviewRefresh: boolean
  isRunning: boolean
  verifyingItemId: string | null
  isVerificationDialogOpen: boolean
  onToggleAll: () => void
  onRefreshPreview: () => void
  onToggleItem: (item: ManagedSiteTokenBatchExportPreviewItem) => void
  onItemModelsChange: (
    item: ManagedSiteTokenBatchExportPreviewItem,
    models: string[],
  ) => void
  onVerifyAndRefresh: (
    item: ManagedSiteTokenBatchExportPreviewItem,
    candidate: ManagedSiteTokenBatchExportMatchedChannel,
  ) => void
}

/**
 * Renders preview selection controls and the list of batch export rows.
 */
export function ManagedSiteTokenBatchExportPreviewList({
  t,
  preview,
  selectedIds,
  executableSelection,
  modelOptions,
  executionResult,
  isLoadingPreview,
  isManualPreviewRefresh,
  isRunning,
  verifyingItemId,
  isVerificationDialogOpen,
  onToggleAll,
  onRefreshPreview,
  onToggleItem,
  onItemModelsChange,
  onVerifyAndRefresh,
}: ManagedSiteTokenBatchExportPreviewListProps) {
  const hasExecutionResult = Boolean(executionResult)
  const isVerificationPending =
    isVerificationDialogOpen || Boolean(verifyingItemId)
  const selectAllId = useId()

  return (
    <>
      {!executionResult ? (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border p-3">
          <div className="flex items-center gap-2 text-sm">
            <Checkbox
              id={selectAllId}
              checked={executableSelection.checked}
              disabled={isRunning || executableSelection.itemCount === 0}
              aria-label={t(
                "keyManagement:batchManagedSiteExport.actions.selectAll",
                {
                  selected: executableSelection.selectedCount,
                  total: executableSelection.itemCount,
                },
              )}
              onCheckedChange={onToggleAll}
            />
            <label htmlFor={selectAllId}>
              {t("keyManagement:batchManagedSiteExport.actions.selectAll", {
                selected: executableSelection.selectedCount,
                total: executableSelection.itemCount,
              })}
            </label>
          </div>
          <Button
            type="button"
            size="sm"
            variant="outline"
            leftIcon={<RefreshCcw className="h-4 w-4" />}
            loading={isManualPreviewRefresh}
            disabled={isLoadingPreview || isRunning || isVerificationPending}
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

      <div className="max-h-[60vh] space-y-3 overflow-y-auto rounded-md border p-3 md:max-h-[min(70vh,48rem)]">
        {preview.items.map((item) => (
          <ManagedSiteTokenBatchExportPreviewRow
            key={item.id}
            t={t}
            item={item}
            siteType={preview.siteType}
            result={executionResult?.items.find(
              (resultItem) => resultItem.id === item.id,
            )}
            modelOptions={modelOptions}
            isSelected={selectedIds.has(item.id)}
            hasExecutionResult={hasExecutionResult}
            isLoadingPreview={isLoadingPreview}
            isRunning={isRunning}
            verifyingItemId={verifyingItemId}
            isVerificationDialogOpen={isVerificationDialogOpen}
            onToggleItem={onToggleItem}
            onItemModelsChange={onItemModelsChange}
            onVerifyAndRefresh={onVerifyAndRefresh}
          />
        ))}
      </div>
    </>
  )
}
