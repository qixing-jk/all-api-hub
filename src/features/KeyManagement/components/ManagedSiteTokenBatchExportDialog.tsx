import { useTranslation } from "react-i18next"

import { DestructiveConfirmDialog, Modal } from "~/components/ui"
import { NewApiManagedVerificationDialog } from "~/features/ManagedSiteVerification/NewApiManagedVerificationDialog"
import { getManagedSiteLabel } from "~/services/managedSites/utils/managedSite"

import { ManagedSiteTokenBatchExportFooter } from "./ManagedSiteTokenBatchExportDialog/ManagedSiteTokenBatchExportFooter"
import { ManagedSiteTokenBatchExportPreviewList } from "./ManagedSiteTokenBatchExportDialog/ManagedSiteTokenBatchExportPreviewList"
import { ManagedSiteTokenBatchExportStatusPanels } from "./ManagedSiteTokenBatchExportDialog/ManagedSiteTokenBatchExportStatusPanels"
import {
  useManagedSiteTokenBatchExportDialog,
  type ManagedSiteTokenBatchExportDialogProps,
} from "./ManagedSiteTokenBatchExportDialog/useManagedSiteTokenBatchExportDialog"

/**
 * Preview and execute selected Key Management tokens as managed-site channels.
 */
export function ManagedSiteTokenBatchExportDialog({
  isOpen,
  onClose,
  items,
  onCompleted,
}: ManagedSiteTokenBatchExportDialogProps) {
  const { t } = useTranslation([
    "keyManagement",
    "settings",
    "common",
    "channelDialog",
  ])
  const dialog = useManagedSiteTokenBatchExportDialog({
    isOpen,
    onClose,
    items,
    onCompleted,
    t,
  })
  const verificationState = dialog.verification.dialogState

  return (
    <>
      <Modal
        isOpen={isOpen}
        onClose={dialog.actions.close}
        closeOnBackdropClick={!dialog.isRunning}
        closeOnEsc={!dialog.isRunning}
        showCloseButton={!dialog.isRunning}
        size="lg"
        header={
          <div className="space-y-1">
            <div className="text-base font-semibold">
              {t("keyManagement:batchManagedSiteExport.title")}
            </div>
            <div className="text-muted-foreground text-sm">
              {dialog.preview
                ? t("keyManagement:batchManagedSiteExport.description", {
                    site: getManagedSiteLabel(t, dialog.preview.siteType),
                    selectedCount: dialog.preview.totalCount,
                  })
                : t("keyManagement:batchManagedSiteExport.loadingDescription", {
                    selectedCount: items.length,
                  })}
            </div>
          </div>
        }
        footer={
          <ManagedSiteTokenBatchExportFooter
            t={t}
            selectedItemCount={items.length}
            preview={dialog.preview}
            previewError={dialog.previewError}
            executionResult={dialog.executionResult}
            isLoadingPreview={dialog.isLoadingPreview}
            isRunning={dialog.isRunning}
            selectedExecutableCount={dialog.executableSelection.selectedCount}
            onClose={dialog.actions.close}
            onStart={dialog.actions.openConfirm}
          />
        }
      >
        <div className="space-y-4">
          <ManagedSiteTokenBatchExportStatusPanels
            t={t}
            previewError={dialog.previewError}
            executionError={dialog.executionError}
            isLoadingPreview={dialog.isLoadingPreview}
            isRunning={dialog.isRunning}
            onRefreshPreview={dialog.actions.refreshPreview}
          />

          {dialog.preview ? (
            <ManagedSiteTokenBatchExportPreviewList
              t={t}
              preview={dialog.preview}
              selectedIds={dialog.selectedIds}
              executableSelection={dialog.executableSelection}
              modelOptions={dialog.modelOptions}
              executionResult={dialog.executionResult}
              isLoadingPreview={dialog.isLoadingPreview}
              isRunning={dialog.isRunning}
              verifyingItemId={dialog.verifyingItemId}
              isVerificationDialogOpen={verificationState.isOpen}
              onToggleAll={dialog.actions.toggleAll}
              onRefreshPreview={dialog.actions.refreshPreview}
              onToggleItem={dialog.actions.toggleItem}
              onItemModelsChange={dialog.actions.changeItemModels}
              onVerifyAndRefresh={dialog.actions.verifyAndRefresh}
            />
          ) : null}
        </div>
      </Modal>

      <DestructiveConfirmDialog
        isOpen={dialog.isConfirmOpen}
        onClose={dialog.actions.closeConfirm}
        onConfirm={dialog.actions.confirm}
        title={t("keyManagement:batchManagedSiteExport.confirm.title")}
        description={t(
          "keyManagement:batchManagedSiteExport.confirm.description",
          {
            selectedCount: dialog.executableSelection.selectedCount,
          },
        )}
        confirmLabel={t("keyManagement:batchManagedSiteExport.actions.start")}
        cancelLabel={t("common:actions.cancel")}
        isWorking={dialog.isRunning}
      />
      <NewApiManagedVerificationDialog
        isOpen={verificationState.isOpen}
        step={verificationState.step}
        request={verificationState.request}
        code={verificationState.code}
        errorMessage={verificationState.errorMessage}
        isBusy={verificationState.isBusy}
        busyMessage={verificationState.busyMessage}
        onCodeChange={dialog.verification.setCode}
        onClose={dialog.verification.closeDialog}
        onSubmit={dialog.verification.submitCode}
        onRetry={dialog.verification.retryVerification}
        onOpenSite={dialog.verification.openBaseUrl}
        onUpdateRequestConfig={dialog.verification.patchRequestConfig}
      />
    </>
  )
}
