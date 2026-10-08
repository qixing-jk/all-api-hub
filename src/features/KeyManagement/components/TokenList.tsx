import { ChevronDown, ChevronUp, Library, SendToBack } from "lucide-react"
import { useTranslation } from "react-i18next"

import { ManagedSiteIcon } from "~/components/icons/ManagedSiteIcon"
import { Badge, Button, Card, Checkbox, Spinner } from "~/components/ui"
import { useUserPreferencesContext } from "~/contexts/UserPreferencesContext"
import { DeeplinkExportDialog } from "~/components/DeeplinkExportDialog"
import { useTokenCredentialAssociations } from "~/features/KeyManagement/hooks/useTokenCredentialAssociations"
import { ManagedSiteTokenBatchExportDialog } from "~/features/KeyManagement/components/ManagedSiteTokenBatchExportDialog"
import { BatchSelectionControl } from "~/features/KeyManagement/components/BatchSelectionControl"
import { KeyAccountGroups } from "~/features/KeyManagement/components/KeyAccountGroups"
import { ServiceCredentialCard } from "~/features/KeyManagement/components/ServiceCredentialCard"
import { TokenEmptyState } from "~/features/KeyManagement/components/TokenEmptyState"
import type { TokenListProps } from "~/features/KeyManagement/components/TokenList.types"
import { useBatchTokenActions } from "~/features/KeyManagement/hooks/useBatchTokenActions"
import { useTokenListInventoryViewModel } from "~/features/KeyManagement/components/useTokenListInventoryViewModel"
import { AccountKeyResourceList } from "~/features/KeyManagement/components/AccountKeyResource/AccountKeyResourceList"
import { KEY_MANAGEMENT_TEST_IDS } from "~/features/KeyManagement/testIds"
import {
  type KeyManagementEntry,
  type NativeKeyManagementRow,
} from "~/features/KeyManagement/types"
import { cn } from "~/lib/utils"
import {
  ACCOUNT_RUNTIME_KEY_SOURCES,
  getAccountRuntimeKeyLocator,
  isServiceCredentialRuntimeKey,
} from "~/services/accounts/accountRuntimeKeys"
import { getManagedSiteLabel } from "~/services/managedSites/utils/managedSite"
import type { DisplaySiteData } from "~/types"
import {
  MANAGED_SITE_TOKEN_BATCH_IMPORT_SOURCES,
  MANAGED_SITE_TOKEN_BATCH_IMPORT_VERIFICATIONS,
  type ManagedSiteBatchImportIntent,
} from "~/types/managedSiteTokenBatchExport"

const MANUAL_MANAGED_SITE_BATCH_IMPORT_INTENT = {
  source: MANAGED_SITE_TOKEN_BATCH_IMPORT_SOURCES.MANUAL_SELECTION,
  verification: MANAGED_SITE_TOKEN_BATCH_IMPORT_VERIFICATIONS.COMPLETE,
} satisfies ManagedSiteBatchImportIntent

/**
 * Skeleton placeholder shown while tokens list is loading.
 */
function LoadingSkeleton() {
  return (
    <div className="space-y-density-3" data-options-page-pending>
      {[...Array(3)].map((_, i) => (
        <Card key={i} padding="sm" className="animate-pulse">
          <div className="bg-secondary mb-density-2 h-4 w-1/4 rounded"></div>
          <div className="bg-secondary mb-density-2 h-3 w-1/2 rounded"></div>
          <div className="bg-secondary h-3 w-3/4 rounded"></div>
        </Card>
      ))}
    </div>
  )
}

/** Display native resources and singleton credentials with shared runtime actions. */
export function TokenList(props: TokenListProps) {
  const {
    isLoading,
    entries,
    filteredEntries,
    handleAddToken,
    canCreateTokens = true,
    onAddAccount,
    onRequestAccountSelection,
    selectedAccount,
    displayData,
    currentAccountLoadError,
    nativeInventoryLoadError,
    currentAccountUnsupportedKeyManagement,
    onRetryCurrentAccount,
    managedSiteTokenStatuses,
    onManagedSiteImportSuccess,
    onManagedSiteVerificationRetry,
    allAccountsFilterAccountIds = [],
    onCopyServiceCredential,
    onRotateServiceCredential,
    guidedManagedSiteImport,
    nativeRows = [],
    nativeUnfilteredRows = nativeRows,
    nativeLoading = false,
    nativeDetail,
    nativeDetailLoading = false,
    nativeDetailFailure,
    onCloseNativeDetail,
    nativeDetailsFromRows = false,
    onOpenNativeDetail,
    onEditNativeKey,
    onDeleteNativeKey,
    credentialProfileLinks = [],
    getCredentialProfileForLocator,
    canManageCredentialAssociations = false,
    canAssociateExistingCredential = true,
    onAssociateAssociation,
    onUnlinkAssociation,
    associationTarget,
    onAssociationTargetStatusChange,
  } = props
  const { t } = useTranslation(["keyManagement", "settings"])
  const { managedSiteType } = useUserPreferencesContext()
  const {
    actionEntries,
    filteredActionEntries,
    currentDeeplinkExportRequest,
    displayRows,
    filteredDisplayRows,
    guidedManagedSiteImportEntryId,
    isAllAccountsMode,
    isReloading,
    collapsedAccountIds,
    groupedRows,
    collapseAll,
    expandAll,
    toggleGroup,
    handleCloseDeeplinkExport,
    getNativeRowContext,
    openDeeplinkExport,
  } = useTokenListInventoryViewModel({
    entries,
    filteredEntries,
    nativeRows,
    nativeUnfilteredRows,
    displayData,
    selectedAccount,
    allAccountsFilterAccountIds,
    guidedManagedSiteImport,
    getCredentialProfileForLocator,
    isLoading,
    nativeLoading,
  })

  const {
    getAssociationPresentation,
    getNativeNavigationProps,
    getRuntimeEntryNavigationProps,
  } = useTokenCredentialAssociations({
    associationTarget,
    canAssociateExistingCredential,
    canManageCredentialAssociations,
    credentialProfileLinks,
    filteredDisplayRows,
    isLoading,
    nativeLoading,
    onAssociateAssociation,
    onAssociationTargetStatusChange,
    onUnlinkAssociation,
  })
  const managedSiteLabel = getManagedSiteLabel(t, managedSiteType)
  const {
    batchExportOpen,
    batchExportItems,
    isBatchApiProfilesSaving,
    selectedEntryIds,
    filteredEligibleEntries,
    hasFilteredIneligibleEntries,
    selectedVisibleCount,
    visibleSelectionChecked,
    selectedEntries,
    selectedManagedSiteBatchItems,
    selectedApiProfileItems,
    isBatchExportSnapshotEligible,
    getSelectionProps,
    toggleFilteredSelection,
    toggleGroupSelection,
    clearSelection,
    openBatchExportDialog,
    closeBatchExportDialog,
    handleBatchSaveToApiProfiles,
    handleBatchExportCompleted,
  } = useBatchTokenActions({
    actionEntries,
    filteredActionEntries,
    onManagedSiteImportSuccess,
  })

  if ((isLoading || nativeLoading) && displayRows.length === 0) {
    return <LoadingSkeleton />
  }

  const renderServiceCredentialCard = (entry: KeyManagementEntry) => {
    if (!isServiceCredentialRuntimeKey(entry.runtimeKey)) return null

    const managedSiteStatusEntry =
      managedSiteTokenStatuses?.[entry.runtimeKey.id]
    return onCopyServiceCredential ? (
      <ServiceCredentialCard
        account={entry.runtimeKey.account as DisplaySiteData}
        credential={entry.runtimeKey.credential}
        isRotating={entry.uiState.isRotating}
        {...getSelectionProps(entry.id)}
        managedSiteStatus={managedSiteStatusEntry?.result}
        isManagedSiteStatusChecking={
          managedSiteStatusEntry?.isChecking === true
        }
        selectionLabel={entry.runtimeKey.label}
        onCopy={onCopyServiceCredential}
        onRotate={onRotateServiceCredential}
        association={getAssociationPresentation(
          getAccountRuntimeKeyLocator(entry.runtimeKey),
          entry.runtimeKey.label,
          entry.runtimeKey.secret,
        )}
        {...getRuntimeEntryNavigationProps(entry)}
      />
    ) : null
  }

  const renderNativeResourceList = (
    rows: readonly NativeKeyManagementRow[],
  ) => (
    <AccountKeyResourceList
      rows={rows}
      accounts={displayData}
      ariaLabel={t("keyManagement:native.heading")}
      onOpenDetail={onOpenNativeDetail}
      onEdit={onEditNativeKey ?? (() => undefined)}
      onDelete={onDeleteNativeKey ?? (() => undefined)}
      detail={nativeDetail}
      isDetailLoading={nativeDetailLoading}
      detailFailure={nativeDetailFailure}
      onCloseDetail={onCloseNativeDetail}
      detailsFromRows={nativeDetailsFromRows}
      selectionDisabledReason={t(
        "keyManagement:batchSelection.unavailableReason",
      )}
      getAssociation={(row) =>
        getAssociationPresentation(
          {
            source: ACCOUNT_RUNTIME_KEY_SOURCES.AccountKeyResource,
            ref: row.facts.ref,
          },
          row.facts.displayName,
          row.facts.maskedLabel,
        )
      }
      getCredentialProfile={(row) =>
        getCredentialProfileForLocator?.({
          source: ACCOUNT_RUNTIME_KEY_SOURCES.AccountKeyResource,
          ref: row.facts.ref,
        })
      }
      getNavigationTarget={getNativeNavigationProps}
      getActions={(row) => {
        const context = getNativeRowContext(row)
        if (!context) return {}
        const { entry, account } = context
        return {
          ...getSelectionProps(entry.id),
          onOpenDeeplinkExport: (target) =>
            openDeeplinkExport(target, entry.runtimeKey, account),
          managedSiteStatus:
            managedSiteTokenStatuses?.[entry.runtimeKey.id]?.result,
          isManagedSiteStatusChecking:
            managedSiteTokenStatuses?.[entry.runtimeKey.id]?.isChecking,
          onManagedSiteImportSuccess: onManagedSiteImportSuccess
            ? () => onManagedSiteImportSuccess(entry.runtimeKey)
            : undefined,
          onManagedSiteVerificationRetry: onManagedSiteVerificationRetry
            ? (status) =>
                onManagedSiteVerificationRetry(entry.runtimeKey, status)
            : undefined,
          guidedManagedSiteImportRequest:
            entry.id === guidedManagedSiteImportEntryId
              ? guidedManagedSiteImport?.request
              : undefined,
        }
      }}
    />
  )
  const nativeResourceList = renderNativeResourceList(nativeRows)
  if (filteredDisplayRows.length === 0) {
    return (
      <TokenEmptyState
        selectedAccount={selectedAccount}
        totalCount={displayRows.length}
        handleAddToken={handleAddToken}
        canCreateTokens={canCreateTokens}
        displayData={displayData}
        currentAccountLoadError={
          currentAccountLoadError ?? nativeInventoryLoadError
        }
        currentAccountUnsupportedKeyManagement={
          currentAccountUnsupportedKeyManagement
        }
        onRetryCurrentAccount={onRetryCurrentAccount}
        onAddAccount={onAddAccount}
        onRequestAccountSelection={onRequestAccountSelection}
      />
    )
  }

  return (
    <>
      {filteredEligibleEntries.length > 0 ? (
        <div className="gap-density-2 py-density-3 mb-density-4 flex flex-wrap items-center justify-between rounded-md border px-3">
          {hasFilteredIneligibleEntries ? (
            <p className="text-muted-foreground w-full text-sm" role="status">
              {t("keyManagement:batchSelection.eligibilityNotice", {
                count: filteredEligibleEntries.length,
              })}
            </p>
          ) : null}
          <label className="gap-density-2 flex items-center text-sm">
            <Checkbox
              checked={visibleSelectionChecked}
              onCheckedChange={toggleFilteredSelection}
            />
            {t("batchManagedSiteExport.selection.visible", {
              selected: selectedVisibleCount,
              total: filteredEligibleEntries.length,
            })}
          </label>
          <div className="gap-density-2 flex flex-wrap items-center">
            <Button
              size="sm"
              variant="outline"
              type="button"
              disabled={selectedEntries.length === 0}
              onClick={clearSelection}
            >
              {t("batchManagedSiteExport.actions.clearSelection")}
            </Button>

            <Button
              size="sm"
              type="button"
              data-testid={KEY_MANAGEMENT_TEST_IDS.batchSaveToApiProfilesButton}
              loading={isBatchApiProfilesSaving}
              disabled={selectedApiProfileItems.length === 0}
              variant="outline"
              onClick={() => void handleBatchSaveToApiProfiles()}
              leftIcon={<Library className="h-4 w-4" />}
            >
              {isBatchApiProfilesSaving
                ? t("common:status.saving")
                : t("batchApiCredentialProfiles.actions.open", {
                    selectedCount: selectedApiProfileItems.length,
                  })}
            </Button>
            <Button
              size="sm"
              type="button"
              disabled={selectedManagedSiteBatchItems.length === 0}
              onClick={openBatchExportDialog}
              leftIcon={<SendToBack className="h-4 w-4" />}
            >
              <span className="gap-density-1 inline-flex items-center">
                <ManagedSiteIcon siteType={managedSiteType} size="sm" />
                {t("batchManagedSiteExport.actions.open", {
                  site: managedSiteLabel,
                  selectedCount: selectedManagedSiteBatchItems.length,
                })}
              </span>
            </Button>
          </div>
        </div>
      ) : null}

      {isReloading && (
        <div
          aria-live="polite"
          className="border-border bg-surface-subtle/70 text-muted-foreground gap-density-2 py-density-2 mb-density-3 animate-in fade-in flex items-center justify-center rounded-lg border text-xs duration-150"
        >
          <Spinner size="sm" className="text-primary h-3.5 w-3.5" />
          <span>{t("common:status.refreshing")}</span>
        </div>
      )}

      <div
        inert={isReloading}
        className={cn(
          "transition-opacity duration-200",
          isReloading && "pointer-events-none opacity-60 select-none",
        )}
      >
        {!isAllAccountsMode ? nativeResourceList : null}

        {isAllAccountsMode && groupedRows && groupedRows.length > 0 ? (
          <>
            <div className="gap-density-2 mb-density-4 flex flex-wrap items-center justify-end">
              <Button
                size="sm"
                variant="outline"
                type="button"
                data-testid={KEY_MANAGEMENT_TEST_IDS.expandAllButton}
                onClick={expandAll}
                leftIcon={<ChevronDown className="h-4 w-4" />}
              >
                {t("actions.expandAll")}
              </Button>
              <Button
                size="sm"
                variant="outline"
                type="button"
                onClick={collapseAll}
                leftIcon={<ChevronUp className="h-4 w-4" />}
              >
                {t("actions.collapseAll")}
              </Button>
            </div>

            <KeyAccountGroups
              groups={groupedRows}
              hasNavigationTarget={Boolean(
                associationTarget || guidedManagedSiteImport?.accountId,
              )}
              renderGroup={(group) => {
                const { account } = group
                const isCollapsed = collapsedAccountIds.has(account.id)
                const shouldShowShowingCount =
                  group.showingCount !== group.totalCount
                const groupEligibleEntries = filteredEligibleEntries.filter(
                  (entry) => entry.runtimeKey.accountId === account.id,
                )
                const selectedGroupVisibleCount = groupEligibleEntries.filter(
                  (entry) => selectedEntryIds.has(entry.id),
                ).length
                const groupSelectionChecked =
                  selectedGroupVisibleCount === 0
                    ? false
                    : selectedGroupVisibleCount === groupEligibleEntries.length
                      ? true
                      : "indeterminate"

                return (
                  <Card
                    key={account.id}
                    variant="outlined"
                    className="overflow-hidden"
                    role="group"
                    aria-label={account.name}
                  >
                    <div
                      className={cn(
                        "dark:hover:bg-secondary hover:bg-surface-subtle gap-density-3 py-density-2 flex w-full items-center justify-between px-3 text-left",
                        isCollapsed ? "rounded-lg" : "border-border border-b",
                      )}
                    >
                      <BatchSelectionControl
                        checked={groupSelectionChecked}
                        label={t(
                          "batchManagedSiteExport.selection.accountGroup",
                          { name: account.name },
                        )}
                        onSelectionChange={
                          groupEligibleEntries.length > 0
                            ? (checked) =>
                                toggleGroupSelection(
                                  groupEligibleEntries,
                                  checked,
                                )
                            : undefined
                        }
                        disabledReason={
                          groupEligibleEntries.length === 0
                            ? t(
                                "keyManagement:batchSelection.accountUnavailableReason",
                              )
                            : undefined
                        }
                      />
                      <button
                        type="button"
                        className="gap-density-3 flex min-w-0 flex-1 items-center justify-between text-left"
                        onClick={() => toggleGroup(account.id)}
                        aria-expanded={!isCollapsed}
                      >
                        <div className="gap-density-2 flex min-w-0 flex-1 items-center">
                          <span className="truncate font-medium">
                            {account.name}
                          </span>
                          <Badge
                            variant="secondary"
                            size="sm"
                            className="shrink-0"
                          >
                            {t("accountSummary.keys", {
                              count: group.totalCount,
                            })}
                          </Badge>
                          <Badge
                            variant="outline"
                            size="sm"
                            className="shrink-0"
                          >
                            {t("enabledCount", { count: group.enabledCount })}
                          </Badge>
                          {shouldShowShowingCount ? (
                            <Badge
                              variant="outline"
                              size="sm"
                              className="shrink-0"
                            >
                              {t("showingCount", { count: group.showingCount })}
                            </Badge>
                          ) : null}
                        </div>
                        <ChevronDown
                          className={cn(
                            "text-muted-foreground h-4 w-4 shrink-0 transition-transform",
                            isCollapsed ? "rotate-0" : "rotate-180",
                          )}
                        />
                      </button>
                    </div>

                    {!isCollapsed ? (
                      <div className="space-y-density-3 py-density-3 px-3">
                        {group.filteredEntries.map((entry) => (
                          <div key={entry.id}>
                            {renderServiceCredentialCard(entry)}
                          </div>
                        ))}
                        {renderNativeResourceList(group.nativeRows)}
                      </div>
                    ) : null}
                  </Card>
                )
              }}
            />
          </>
        ) : (
          <div className="space-y-density-3">
            {filteredEntries.map((entry) => (
              <div key={entry.id}>{renderServiceCredentialCard(entry)}</div>
            ))}
          </div>
        )}
      </div>

      {currentDeeplinkExportRequest && (
        <DeeplinkExportDialog
          request={currentDeeplinkExportRequest}
          onClose={handleCloseDeeplinkExport}
        />
      )}

      <ManagedSiteTokenBatchExportDialog
        isOpen={batchExportOpen && isBatchExportSnapshotEligible}
        onClose={closeBatchExportDialog}
        items={batchExportItems}
        intent={MANUAL_MANAGED_SITE_BATCH_IMPORT_INTENT}
        onCompleted={handleBatchExportCompleted}
      />
    </>
  )
}
