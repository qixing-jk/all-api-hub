import { SendToBack } from "lucide-react"
import { useTranslation } from "react-i18next"

import ManagedSiteTypeSwitcher from "~/components/ManagedSiteTypeSwitcher"
import { Button, DestructiveConfirmDialog, Modal } from "~/components/ui"
import { MENU_ITEM_IDS } from "~/constants/optionsMenuIds"
import { KEY_MANAGEMENT_TEST_IDS } from "~/features/KeyManagement/testIds"
import { NewApiManagedVerificationDialog } from "~/features/ManagedSiteVerification/NewApiManagedVerificationDialog"
import { getManagedSiteLabel } from "~/services/managedSites/utils/managedSite"
import { pushWithinOptionsPage } from "~/utils/navigation"

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
  intent,
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
    intent,
    onCompleted,
    t,
  })
  const verificationState = dialog.verification.dialogState
  const isVerificationDialogVisible = isOpen && verificationState.isOpen
  const handleViewChannels = () => {
    dialog.actions.close()
    pushWithinOptionsPage(`#${MENU_ITEM_IDS.MANAGED_SITE_CHANNELS}`)
  }
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
            <div className="text-muted-foreground text-sm">
              {t("keyManagement:batchManagedSiteExport.gatewayDescription")}
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
            canRetry={Boolean(
              dialog.executionResult?.items.some(
                (item) =>
                  item.result === "failed" || item.result === "uncertain",
              ),
            )}
            onClose={dialog.actions.close}
            onStart={dialog.actions.openConfirm}
            onRetry={dialog.actions.retry}
            onViewChannels={handleViewChannels}
          />
        }
      >
        <div className="space-y-4">
          {dialog.preview?.targetSummary ? (
            <div className="flex flex-wrap items-start justify-between gap-3 rounded-md border p-3 text-sm">
              <div className="min-w-0">
                <div className="font-medium">
                  {t("keyManagement:batchManagedSiteExport.target.title", {
                    site: getManagedSiteLabel(t, dialog.preview.siteType),
                  })}
                </div>
                <div className="text-muted-foreground text-xs break-all">
                  {dialog.preview.targetSummary.baseUrl}
                </div>
              </div>
              <ManagedSiteTypeSwitcher
                ariaLabel={t(
                  "keyManagement:batchManagedSiteExport.target.change",
                )}
                size="sm"
                triggerClassName="w-auto min-w-[172px]"
                triggerTestId={
                  KEY_MANAGEMENT_TEST_IDS.managedSiteBatchExportTargetSwitcher
                }
                disabled={dialog.isLoadingPreview || dialog.isRunning}
              />
            </div>
          ) : null}

          {dialog.intent.source === "repair-created" &&
          dialog.intent.verification === "trusted-new" ? (
            <div className="space-y-2 rounded-md border border-blue-200 bg-blue-50/60 p-3 text-sm dark:border-blue-900/40 dark:bg-blue-950/20">
              <div>
                {t(
                  "keyManagement:batchManagedSiteExport.repairTrusted.description",
                )}
              </div>
              <Button
                type="button"
                size="sm"
                variant="outline"
                data-testid={
                  KEY_MANAGEMENT_TEST_IDS.managedSiteBatchExportUseCompleteChecksButton
                }
                onClick={dialog.actions.useCompleteChecks}
                disabled={dialog.isLoadingPreview || dialog.isRunning}
              >
                {t(
                  "keyManagement:batchManagedSiteExport.repairTrusted.useCompleteChecks",
                )}
              </Button>
            </div>
          ) : null}

          <ManagedSiteTokenBatchExportStatusPanels
            t={t}
            previewError={dialog.previewError}
            executionError={dialog.executionError}
            isTargetChanged={dialog.isTargetChanged}
            isLoadingPreview={dialog.isLoadingPreview}
            isManualPreviewRefresh={dialog.isManualPreviewRefresh}
            showPreviewLoadingStatus={
              !dialog.isManualPreviewRefresh || !dialog.preview
            }
            isRunning={dialog.isRunning}
            onRefreshPreview={dialog.actions.retryPreview}
          />

          {dialog.preview && !dialog.previewError ? (
            <ManagedSiteTokenBatchExportPreviewList
              t={t}
              preview={dialog.preview}
              selectedIds={dialog.selectedIds}
              executableSelection={dialog.executableSelection}
              modelOptions={dialog.modelOptions}
              executionResult={dialog.executionResult}
              isLoadingPreview={dialog.isLoadingPreview}
              isManualPreviewRefresh={dialog.isManualPreviewRefresh}
              isRunning={dialog.isRunning}
              verifyingItemId={dialog.verifyingItemId}
              isVerificationDialogOpen={isVerificationDialogVisible}
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
        isOpen={isOpen && dialog.isConfirmOpen}
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
        workingLabel={t("keyManagement:batchManagedSiteExport.actions.running")}
        cancelLabel={t("common:actions.cancel")}
        isWorking={dialog.isRunning}
        icon={<SendToBack className="text-primary h-5 w-5" />}
        confirmVariant="default"
      />
      <NewApiManagedVerificationDialog
        isOpen={isVerificationDialogVisible}
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
