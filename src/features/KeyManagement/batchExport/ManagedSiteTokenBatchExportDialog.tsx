import { SendToBack } from "lucide-react"
import { useTranslation } from "react-i18next"

import {
  Button,
  ConfirmDialog,
  Input,
  Modal,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "~/components/ui"
import { MENU_ITEM_IDS } from "~/constants/optionsMenuIds"
import { ManagedSiteTokenBatchExportFooter } from "~/features/KeyManagement/batchExport/ManagedSiteTokenBatchExportFooter"
import { ManagedSiteTokenBatchExportPreviewList } from "~/features/KeyManagement/batchExport/ManagedSiteTokenBatchExportPreviewList"
import { ManagedSiteTokenBatchExportStatusPanels } from "~/features/KeyManagement/batchExport/ManagedSiteTokenBatchExportStatusPanels"
import {
  useManagedSiteTokenBatchExportDialog,
  type ManagedSiteTokenBatchExportDialogProps,
} from "~/features/KeyManagement/batchExport/useManagedSiteTokenBatchExportDialog"
import { KEY_MANAGEMENT_TEST_IDS } from "~/features/KeyManagement/testIds"
import { NewApiManagedVerificationDialog } from "~/features/ManagedSiteVerification/NewApiManagedVerificationDialog"
import ManagedSiteTypeSwitcher from "~/features/ManagedSiteWidgets/ManagedSiteTypeSwitcher"
import { getManagedSiteLabel } from "~/services/managedSites/utils/managedSite"
import {
  MANAGED_SITE_TOKEN_BATCH_EXPORT_EXECUTION_RESULTS,
  MANAGED_SITE_TOKEN_BATCH_IMPORT_VERIFICATIONS,
} from "~/types/managedSiteTokenBatchExport"
import { pushWithinOptionsPage } from "~/utils/navigation/optionsPage"

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
          <div className="space-y-density-1">
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
            hasInvalidImportGroups={dialog.hasInvalidImportGroups}
            importMode={dialog.importMode}
            canRetry={Boolean(
              dialog.executionResult?.items.some(
                (item) =>
                  item.result ===
                  MANAGED_SITE_TOKEN_BATCH_EXPORT_EXECUTION_RESULTS.FAILED,
              ),
            )}
            onClose={dialog.actions.close}
            onStart={dialog.actions.start}
            onRetry={dialog.actions.retry}
            onViewChannels={handleViewChannels}
          />
        }
      >
        <div className="space-y-density-4">
          {dialog.preview?.targetSummary ? (
            <div className="gap-y-density-3 py-density-3 flex flex-wrap items-start justify-between gap-x-3 rounded-md border px-3 text-sm">
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

          {dialog.preview &&
          (dialog.canGroup || dialog.importMode === "grouped") ? (
            <div className="space-y-density-2 rounded-md border p-3 text-sm">
              <Select
                value={dialog.importMode}
                onValueChange={(value) => {
                  void dialog.actions.changeImportMode(value)
                }}
                disabled={
                  dialog.isLoadingPreview ||
                  dialog.isRunning ||
                  Boolean(dialog.executionResult)
                }
              >
                <SelectTrigger
                  aria-label={t(
                    "keyManagement:batchManagedSiteExport.importMode.label",
                  )}
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="independent">
                    {t(
                      "keyManagement:batchManagedSiteExport.importMode.independent",
                    )}
                  </SelectItem>
                  <SelectItem value="grouped" disabled={!dialog.canGroup}>
                    {t(
                      "keyManagement:batchManagedSiteExport.importMode.grouped",
                    )}
                  </SelectItem>
                </SelectContent>
              </Select>
              {dialog.importMode === "grouped" ? (
                <>
                  <p className="text-muted-foreground">
                    {t(
                      "keyManagement:batchManagedSiteExport.importMode.scheduling",
                    )}
                  </p>
                  <p>
                    {t(
                      "keyManagement:batchManagedSiteExport.importMode.summary",
                      {
                        keyCount: dialog.executableSelection.selectedCount,
                        resourceCount: dialog.importGroups.length,
                      },
                    )}
                  </p>
                  {dialog.importGroups.map((group) => (
                    <details
                      key={group.id}
                      open
                      data-testid="managed-site-import-group"
                      className="rounded-md border p-2"
                    >
                      <summary className="cursor-pointer font-medium">
                        {group.draft.name} ·{" "}
                        {t(
                          "keyManagement:batchManagedSiteExport.importMode.keyCount",
                          { count: group.draft.credentials?.length ?? 1 },
                        )}
                      </summary>
                      <div className="text-muted-foreground mt-2 space-y-1">
                        <p className="break-all">{group.draft.base_url}</p>
                        <Input
                          aria-label={t(
                            "keyManagement:batchManagedSiteExport.importMode.resourceName",
                          )}
                          value={group.draft.name}
                          onChange={(event) =>
                            dialog.actions.changeImportGroupName(
                              group.id,
                              event.target.value,
                            )
                          }
                          aria-invalid={!group.draft.name.trim()}
                          disabled={
                            dialog.isRunning || Boolean(dialog.executionResult)
                          }
                        />
                        {group.itemIds.map((id) => {
                          const item = dialog.previewItemsById.get(id)
                          return item ? (
                            <p key={id}>
                              {item.accountName} / {item.runtimeKeyName}
                            </p>
                          ) : null
                        })}
                        <p>
                          {t(
                            "keyManagement:batchManagedSiteExport.importMode.models",
                            { models: group.draft.models.join(", ") },
                          )}
                        </p>
                        {group.modelSetsDiffer ? (
                          <p>
                            {t(
                              "keyManagement:batchManagedSiteExport.importMode.modelDifferences",
                            )}
                          </p>
                        ) : null}
                        {!group.supportsMultipleCredentials ? (
                          <p>
                            {t(
                              "keyManagement:batchManagedSiteExport.importMode.unsupported",
                            )}
                          </p>
                        ) : null}
                      </div>
                    </details>
                  ))}
                </>
              ) : null}
            </div>
          ) : null}

          {dialog.intent.source === "repair-created" &&
          dialog.intent.verification ===
            MANAGED_SITE_TOKEN_BATCH_IMPORT_VERIFICATIONS.TRUSTED_NEW ? (
            <div className="border-primary-soft-border bg-primary-soft space-y-density-2 py-density-3 rounded-md border px-3 text-sm">
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
              retainedExecutionItems={dialog.retainedExecutionItems}
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

      <ConfirmDialog
        intent="confirm"
        icon={SendToBack}
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
