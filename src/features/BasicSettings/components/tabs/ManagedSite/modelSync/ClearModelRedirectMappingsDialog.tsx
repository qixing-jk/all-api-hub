import { useTranslation } from "react-i18next"

import {
  ActionGroup,
  Badge,
  Button,
  Checkbox,
  CollapsibleSection,
  ConfirmDialog,
  Input,
  Modal,
} from "~/components/ui"
import { useClearModelRedirectMappingsSession } from "~/features/BasicSettings/components/tabs/ManagedSite/modelSync/useClearModelRedirectMappingsSession"
import { BASIC_SETTINGS_TEST_IDS } from "~/features/BasicSettings/testIds"
import { getManagedResourceRefKey } from "~/services/managedSites/managedResourceIdentity"

interface ClearModelRedirectMappingsDialogProps {
  isOpen: boolean
  onClose: () => void
}

/**
 * Dialog for previewing and confirming bulk clearing of model redirect mappings across managed site channels.
 */
export function ClearModelRedirectMappingsDialog({
  isOpen,
  onClose,
}: ClearModelRedirectMappingsDialogProps) {
  const { t } = useTranslation("modelRedirect")
  const {
    channels,
    selectedKeys,
    isLoading,
    loadError,
    searchText,
    setSearchText,
    isConfirmOpen,
    setIsConfirmOpen,
    isClearing,
    resultErrors,
    filteredChannelItems,
    selectedCount,
    totalCount,
    filteredCount,
    canContinue,
    handleClose,
    handleToggleSelected,
    handleSelectAll,
    handleSelectNone,
    handleConfirm,
  } = useClearModelRedirectMappingsSession(isOpen, onClose)

  return (
    <>
      <Modal
        isOpen={isOpen}
        onClose={handleClose}
        closeOnBackdropClick={!isClearing}
        closeOnEsc={!isClearing}
        showCloseButton={!isClearing}
        size="lg"
        header={
          <div className="space-y-density-1">
            <div className="text-base font-semibold">
              {t("bulkClear.preview.title")}
            </div>
            <div className="dark:text-secondary-foreground text-muted-foreground text-sm">
              {t("bulkClear.preview.description")}
            </div>
          </div>
        }
        footer={
          <div className="gap-y-density-3 flex flex-col items-stretch justify-between gap-x-3 sm:flex-row sm:items-center">
            <div className="dark:text-secondary-foreground text-muted-foreground min-w-0 text-sm break-words">
              {t("bulkClear.preview.selectedCount", {
                selected: selectedCount,
                total: totalCount,
              })}
              {filteredCount !== totalCount && (
                <span className="ml-2">
                  {t("bulkClear.search.filteredCount", {
                    filtered: filteredCount,
                    total: totalCount,
                  })}
                </span>
              )}
            </div>
            <ActionGroup>
              <Button
                type="button"
                variant="outline"
                onClick={handleClose}
                disabled={isClearing}
              >
                {t("bulkClear.actions.close")}
              </Button>
              <Button
                type="button"
                variant="destructive"
                onClick={() => setIsConfirmOpen(true)}
                disabled={!canContinue || isClearing}
                data-testid={
                  BASIC_SETTINGS_TEST_IDS.managedSiteModelRedirectBulkClearContinueButton
                }
              >
                {t("bulkClear.actions.continue")}
              </Button>
            </ActionGroup>
          </div>
        }
      >
        <div className="space-y-density-4">
          <div className="gap-y-density-2 flex flex-wrap items-center justify-between gap-x-2">
            <div className="dark:text-foreground text-secondary-foreground text-sm">
              {t("bulkClear.preview.channelListLabel")}
            </div>
            <div className="gap-y-density-2 flex items-center gap-x-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleSelectAll}
                disabled={
                  isLoading || isClearing || !filteredChannelItems.length
                }
              >
                {t("bulkClear.actions.selectAll")}
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleSelectNone}
                disabled={
                  isLoading || isClearing || !filteredChannelItems.length
                }
              >
                {t("bulkClear.actions.selectNone")}
              </Button>
            </div>
          </div>

          <Input
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            placeholder={t("bulkClear.search.placeholder")}
            aria-label={t("bulkClear.search.label")}
            disabled={isLoading || isClearing || !channels.length}
          />

          {isLoading && (
            <div className="dark:text-secondary-foreground border-border text-muted-foreground py-density-3 rounded-md border px-3 text-sm">
              {t("bulkClear.status.loading")}
            </div>
          )}

          {loadError && (
            <div className="border-destructive-border bg-destructive-soft text-destructive-soft-foreground py-density-3 rounded-md border px-3 text-sm">
              {t("bulkClear.status.loadFailed", { error: loadError })}
            </div>
          )}

          {!isLoading && !loadError && (
            <div className="border-border space-y-density-2 py-density-3 max-h-[60vh] overflow-y-auto rounded-md border px-3 md:max-h-[min(70vh,48rem)]">
              {channels.length === 0 ? (
                <div className="dark:text-secondary-foreground text-muted-foreground text-sm">
                  {t("bulkClear.status.noChannels")}
                </div>
              ) : filteredChannelItems.length === 0 ? (
                <div className="dark:text-secondary-foreground text-muted-foreground text-sm">
                  {t("bulkClear.search.noResults")}
                </div>
              ) : (
                filteredChannelItems.map(({ channel, meta }) => {
                  const checked = selectedKeys.has(
                    getManagedResourceRefKey(channel.ref),
                  )
                  const mappingIsEmpty = meta.isEmpty
                  const checkboxDisabled = isClearing

                  return (
                    <div
                      key={getManagedResourceRefKey(channel.ref)}
                      className="hover:bg-surface-subtle dark:hover:bg-card/50 space-y-density-2 py-density-2 rounded-md px-2"
                    >
                      <div className="gap-y-density-3 flex items-start gap-x-3">
                        <Checkbox
                          aria-label={`${channel.name} (#${channel.ref.resourceId})`}
                          data-testid={`${BASIC_SETTINGS_TEST_IDS.managedSiteModelRedirectBulkClearChannelCheckboxPrefix}-${channel.ref.resourceId}`}
                          checked={checked}
                          onCheckedChange={() =>
                            handleToggleSelected(
                              getManagedResourceRefKey(channel.ref),
                            )
                          }
                          disabled={checkboxDisabled}
                        />
                        <div className="min-w-0 flex-1">
                          <div className="gap-y-density-2 flex items-center justify-between gap-x-2">
                            <div className="text-foreground truncate text-sm font-medium">
                              {channel.name}
                            </div>
                            {!meta.isInvalid ? (
                              <Badge
                                variant={mappingIsEmpty ? "secondary" : "info"}
                                size="sm"
                              >
                                {t("bulkClear.preview.mappingCount", {
                                  count: meta.count,
                                })}
                              </Badge>
                            ) : (
                              <Badge variant="warning" size="sm">
                                {t("bulkClear.preview.mappingInvalidBadge")}
                              </Badge>
                            )}
                          </div>
                          <div className="dark:text-secondary-foreground text-muted-foreground text-xs">
                            #{channel.ref.resourceId}
                          </div>
                        </div>
                      </div>

                      {mappingIsEmpty ? (
                        <div className="dark:text-secondary-foreground text-muted-foreground text-xs">
                          {t("bulkClear.preview.mappingEmptyInline")}
                        </div>
                      ) : (
                        <CollapsibleSection
                          title={t("bulkClear.preview.mappingToggle")}
                          buttonClassName="px-1"
                          panelClassName="bg-surface-subtle dark:bg-background/20"
                        >
                          <>
                            {meta.isInvalid && (
                              <div className="text-warning-text mb-density-2 text-xs">
                                {t("bulkClear.preview.mappingInvalid")}
                              </div>
                            )}
                            <pre className="text-secondary-foreground max-h-[40vh] overflow-auto text-xs wrap-break-word whitespace-pre-wrap md:max-h-[min(50vh,32rem)]">
                              {meta.previewText}
                            </pre>
                          </>
                        </CollapsibleSection>
                      )}
                    </div>
                  )
                })
              )}
            </div>
          )}

          {!isLoading &&
            !loadError &&
            selectedCount === 0 &&
            channels.length > 0 && (
              <div className="text-destructive-text text-sm">
                {t("bulkClear.status.emptySelection")}
              </div>
            )}

          {resultErrors.length > 0 && (
            <div className="border-warning-border bg-warning-soft text-warning-soft-foreground py-density-3 rounded-md border px-3 text-sm">
              <div className="font-medium">{t("bulkClear.result.title")}</div>
              <ul className="mt-density-2 space-y-density-1 list-disc pl-5">
                {resultErrors.map((err, index) => (
                  <li key={`${err}-${index}`}>{err}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </Modal>

      <ConfirmDialog
        intent="destructive"
        isOpen={isConfirmOpen}
        onClose={() => {
          if (!isClearing) setIsConfirmOpen(false)
        }}
        size="sm"
        title={t("bulkClear.confirm.title")}
        description={t("bulkClear.confirm.description", {
          count: selectedCount,
        })}
        warningTitle={t("bulkClear.confirm.warningTitle")}
        cancelLabel={t("bulkClear.actions.cancel")}
        confirmLabel={t("bulkClear.actions.confirm")}
        workingLabel={t("bulkClear.status.clearing")}
        confirmButtonTestId={
          BASIC_SETTINGS_TEST_IDS.managedSiteModelRedirectBulkClearConfirmButton
        }
        onConfirm={() => {
          void handleConfirm()
        }}
        isWorking={isClearing}
        details={
          selectedCount > 0 ? (
            <div className="dark:text-secondary-foreground text-muted-foreground text-sm">
              {t("bulkClear.confirm.details", { count: selectedCount })}
            </div>
          ) : undefined
        }
      />
    </>
  )
}
