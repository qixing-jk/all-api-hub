import type { TFunction } from "i18next"
import { useCallback, useRef } from "react"
import { useTranslation } from "react-i18next"

import {
  Alert,
  Notice,
  NoticeActionButton,
  SearchableSelect,
} from "~/components/ui"
import { BASIC_SETTINGS_TAB_IDS } from "~/constants/basicSettingsTabs"
import { NewApiManagedVerificationDialog } from "~/features/ManagedSiteVerification/NewApiManagedVerificationDialog"
import AddTokenDialog from "~/features/TokenProvisioning/components/AddTokenDialog"
import { OneTimeSecretDialog } from "~/features/TokenProvisioning/components/OneTimeSecretDialog"
import { ACCOUNT_KEY_RESOURCE_FAILURE_CODES } from "~/services/apiAdapters/contracts/accountKeyResource"
import {
  openApiCredentialProfilesPage,
  openSettingsTab,
} from "~/utils/navigation"

import { AccountKeyResourceDeleteDialog } from "./components/AccountKeyResource/AccountKeyResourceDeleteDialog"
import { AccountKeyResourceEditorDialog } from "./components/AccountKeyResource/AccountKeyResourceEditorDialog"
import { AccountKeyScopeSelector } from "./components/AccountKeyResource/AccountKeyScopeSelector"
import { AccountSelectorPanel } from "./components/AccountSelectorPanel"
import { AccountSummaryBar } from "./components/AccountSummaryBar"
import { AssociateApiCredentialProfileDialog } from "./components/AssociateApiCredentialProfileDialog"
import { Footer } from "./components/Footer"
import { Header } from "./components/Header"
import { LinkedChannelCleanupPending } from "./components/LinkedChannelCleanup"
import { RepairMissingKeysDialog } from "./components/RepairMissingKeysDialog"
import { TokenList } from "./components/TokenList"
import { TokenSearchBar } from "./components/TokenSearchBar"
import {
  ACCOUNT_KEY_STATUS_FILTERS,
  KEY_MANAGEMENT_ALL_ACCOUNTS_VALUE,
} from "./constants"
import { useKeyManagementViewModel } from "./hooks/useKeyManagementViewModel"
import { getAccountKeyScopeMessages } from "./presentation/accountKeyResourcePresentation"
import { KEY_MANAGEMENT_TEST_IDS } from "./testIds"

const nativeStatusOptions = (t: TFunction) => [
  {
    value: ACCOUNT_KEY_STATUS_FILTERS.All,
    label: t("keyManagement:native.status.all"),
  },
  {
    value: ACCOUNT_KEY_STATUS_FILTERS.Enabled,
    label: t("keyManagement:native.status.enabled"),
  },
  {
    value: ACCOUNT_KEY_STATUS_FILTERS.Disabled,
    label: t("keyManagement:native.status.disabled"),
  },
  {
    value: ACCOUNT_KEY_STATUS_FILTERS.Expired,
    label: t("keyManagement:native.status.expired"),
  },
  {
    value: ACCOUNT_KEY_STATUS_FILTERS.Unknown,
    label: t("keyManagement:native.status.unknown"),
  },
]

/**
 * Key management page rendering header, filters, token list, and dialogs.
 * @param props Component props optionally carrying routing context.
 * @param props.routeParams Optional route parameters forwarded by the router.
 * @returns Full key management page layout.
 */
export default function KeyManagement(props: {
  routeParams?: Record<string, string>
}) {
  const { routeParams } = props
  const { t } = useTranslation([
    "keyManagement",
    "common",
    "apiCredentialProfiles",
  ])
  const {
    headerState,
    isRepairOpen,
    isAddTokenOpen,
    setIsAddTokenOpen,
    repairStartOnOpen,
    isAccountSelectorOpen,
    setIsAccountSelectorOpen,
    verification,
    isManagedSiteConfigComplete,
    displayData,
    selectedAccount,
    searchTerm,
    isLoading,
    currentAccountLoadError,
    currentAccountUnsupportedKeyManagement,
    allAccountsFilterAccountIds,
    entries,
    filteredEntries,
    copyServiceCredential,
    rotateServiceCredential,
    credentialProfileLinks,
    areCredentialProfileLinksLoading,
    credentialProfileLinksError,
    reloadCredentialProfileLinks,
    credentialProfiles,
    areCredentialProfilesLoading,
    credentialAssociations,
    nativeKeys,
    routeAssociationId,
    associationTarget,
    setAssociationTargetStatus,
    handleAccountSummaryClick,
    handleSelectedAccountChange,
    clearAssociationTarget,
    handleSearchTermChange,
    getProfileForLocator,
    allNativeRows,
    nativeRows,
    combinedAccountSummaryItems,
    combinedFailedAccounts,
    combinedTokenLoadProgress,
    aggregateCounts,
    retryCombinedFailedAccounts,
    nativeInventoryLoadError,
    isNativeInventoryLoading,
    managedSiteTokenStatuses,
    isManagedSiteChannelStatusSupported,
    isManagedSiteStatusRefreshing,
    handleRepairMissingKeys,
    handleCloseRepairMissingKeys,
    handleOpenAccountManagement,
    handleRefreshTokens,
    handleRefreshManagedSiteStatuses,
    handleManagedSiteVerificationRetry,
    handleManagedSiteImportSuccess,
    addTokenAvailableAccounts,
    selectedAddTokenScopeAccount,
    isSelectedNativeKeyAccount,
    canCreateKeyInCurrentScope,
    addTokenDisabledReason,
    handleRequestAddToken,
    addTokenPreSelectedAccountId,
    guidedManagedSiteImport,
    nativeOneTimeSaveAction,
    associationTargetStatusMessage,
    isAssociationRoutePending,
    isAssociationRouteUnavailable,
    canClearAssociationRoute,
    showAssociationRouteNotice,
  } = useKeyManagementViewModel(routeParams)
  const accountSelectorTriggerRef = useRef<HTMLButtonElement>(null)
  const handleRequestAccountSelection = useCallback(() => {
    const selectorTrigger = accountSelectorTriggerRef.current

    if (selectorTrigger) {
      if (typeof selectorTrigger.scrollIntoView === "function") {
        selectorTrigger.scrollIntoView({
          block: "nearest",
        })
      }
    }

    setIsAccountSelectorOpen(true)
  }, [setIsAccountSelectorOpen])

  return (
    <div className="py-density-4 sm:py-density-6 px-4 sm:px-6">
      <Header
        onAddToken={handleRequestAddToken}
        onRepairMissingKeys={handleRepairMissingKeys}
        onRefresh={handleRefreshTokens}
        onOpenSelectedAccountModels={headerState.onOpenSelectedAccountModels}
        onRefreshManagedSiteStatus={
          isManagedSiteChannelStatusSupported
            ? () => void handleRefreshManagedSiteStatuses()
            : undefined
        }
        managedSiteStatusHint={
          !isManagedSiteChannelStatusSupported
            ? t("managedSiteStatus.pageUnsupported")
            : undefined
        }
        selectedAccount={selectedAccount}
        isLoading={headerState.isLoading}
        isManagedSiteStatusRefreshing={isManagedSiteStatusRefreshing}
        isAddTokenDisabled={headerState.isAddTokenDisabled}
        addTokenDisabledReason={addTokenDisabledReason}
        isRepairDisabled={displayData.length === 0}
        isManagedSiteStatusRefreshDisabled={
          headerState.isManagedSiteStatusRefreshDisabled
        }
      />

      <LinkedChannelCleanupPending />
      {routeAssociationId ? (
        <div className="sr-only" role="status" aria-live="polite">
          {associationTargetStatusMessage}
        </div>
      ) : null}

      {showAssociationRouteNotice ? (
        <Notice
          tone={isAssociationRoutePending ? "info" : "warning"}
          className="mb-density-4"
          description={
            <span>
              {associationTargetStatusMessage}{" "}
              {isAssociationRouteUnavailable ? (
                <NoticeActionButton
                  onClick={() => {
                    void reloadCredentialProfileLinks()
                    void handleRefreshTokens()
                  }}
                >
                  {t("keyManagement:credentialAssociation.target.retry")}
                </NoticeActionButton>
              ) : canClearAssociationRoute ? (
                <NoticeActionButton onClick={clearAssociationTarget}>
                  {t("keyManagement:credentialAssociation.target.clear")}
                </NoticeActionButton>
              ) : null}
            </span>
          }
        />
      ) : null}

      <AccountSelectorPanel
        selectedAccount={selectedAccount}
        setSelectedAccount={handleSelectedAccountChange}
        displayData={displayData}
        selectorOpen={isAccountSelectorOpen}
        onSelectorOpenChange={setIsAccountSelectorOpen}
        selectorTriggerRef={accountSelectorTriggerRef}
        aggregateCounts={aggregateCounts}
      />

      {isSelectedNativeKeyAccount ? (
        <div className="mb-density-4 space-y-density-3">
          <AccountKeyScopeSelector
            siteType={selectedAddTokenScopeAccount?.siteType}
            scopes={nativeKeys.scopes}
            selectedScope={nativeKeys.selectedScope}
            isLoading={nativeKeys.isLoading}
            isRetrying={
              nativeKeys.isLoading || nativeKeys.isScopeInventoryLoading
            }
            isPartial={nativeKeys.scopeInventoryFailure !== null}
            error={
              nativeKeys.failures[selectedAccount]?.code ===
              ACCOUNT_KEY_RESOURCE_FAILURE_CODES.PermissionDenied
                ? ACCOUNT_KEY_RESOURCE_FAILURE_CODES.PermissionDenied
                : nativeKeys.failures[selectedAccount]?.code ===
                    ACCOUNT_KEY_RESOURCE_FAILURE_CODES.AuthenticationFailed
                  ? ACCOUNT_KEY_RESOURCE_FAILURE_CODES.AuthenticationFailed
                  : nativeKeys.failures[selectedAccount]
                    ? ACCOUNT_KEY_RESOURCE_FAILURE_CODES.Unavailable
                    : undefined
            }
            onSelectScope={(scope) => {
              if (routeAssociationId) clearAssociationTarget()
              nativeKeys.selectScope(scope)
            }}
            onRetry={() =>
              void (nativeKeys.scopeInventoryFailure
                ? nativeKeys.retryScopeInventory()
                : nativeKeys.refresh())
            }
          />
          <SearchableSelect
            data-testid={KEY_MANAGEMENT_TEST_IDS.nativeStatusFilter}
            aria-label={t("keyManagement:native.statusFilter.label")}
            options={nativeStatusOptions(t)}
            value={nativeKeys.statusFilter}
            onChange={(value) => {
              if (routeAssociationId) clearAssociationTarget()
              nativeKeys.setStatusFilter(
                value as (typeof ACCOUNT_KEY_STATUS_FILTERS)[keyof typeof ACCOUNT_KEY_STATUS_FILTERS],
              )
            }}
          />
          {nativeKeys.notice ? (
            <Alert
              variant="warning"
              compact
              title={
                getAccountKeyScopeMessages(
                  displayData.find((account) => account.id === selectedAccount)
                    ?.siteType,
                  t,
                ).fallback
              }
            />
          ) : null}
        </div>
      ) : null}

      {selectedAccount === KEY_MANAGEMENT_ALL_ACCOUNTS_VALUE &&
        combinedAccountSummaryItems.length > 0 && (
          <AccountSummaryBar
            items={combinedAccountSummaryItems}
            tokenLoadProgress={combinedTokenLoadProgress}
            failedAccounts={combinedFailedAccounts}
            onRetryFailedAccounts={retryCombinedFailedAccounts}
            activeAccountIds={allAccountsFilterAccountIds}
            onAccountClick={handleAccountSummaryClick}
          />
        )}

      {selectedAccount ? (
        <TokenSearchBar
          searchTerm={searchTerm}
          setSearchTerm={handleSearchTermChange}
        />
      ) : null}

      <TokenList
        isLoading={isLoading}
        entries={entries}
        filteredEntries={filteredEntries}
        handleAddToken={handleRequestAddToken}
        canCreateTokens={canCreateKeyInCurrentScope}
        onAddAccount={handleOpenAccountManagement}
        onRequestAccountSelection={handleRequestAccountSelection}
        selectedAccount={selectedAccount}
        displayData={displayData}
        currentAccountLoadError={currentAccountLoadError}
        nativeInventoryLoadError={nativeInventoryLoadError}
        currentAccountUnsupportedKeyManagement={
          currentAccountUnsupportedKeyManagement
        }
        onCopyServiceCredential={copyServiceCredential}
        onRotateServiceCredential={rotateServiceCredential}
        nativeRows={nativeRows}
        nativeUnfilteredRows={allNativeRows}
        nativeLoading={isNativeInventoryLoading}
        nativeDetail={nativeKeys.detail}
        nativeDetailLoading={nativeKeys.isDetailLoading}
        nativeDetailFailure={nativeKeys.detailFailure}
        onCloseNativeDetail={nativeKeys.closeDetail}
        nativeDetailsFromRows={
          selectedAccount === KEY_MANAGEMENT_ALL_ACCOUNTS_VALUE
        }
        onOpenNativeDetail={(ref) => void nativeKeys.openDetail(ref)}
        onEditNativeKey={(ref) => void nativeKeys.openEdit(ref)}
        onDeleteNativeKey={nativeKeys.openDelete}
        onRetryCurrentAccount={
          selectedAccount
            ? () => void handleRefreshTokens(selectedAccount)
            : undefined
        }
        managedSiteTokenStatuses={managedSiteTokenStatuses}
        onManagedSiteImportSuccess={
          isManagedSiteChannelStatusSupported
            ? handleManagedSiteImportSuccess
            : undefined
        }
        onManagedSiteVerificationRetry={
          isManagedSiteChannelStatusSupported
            ? handleManagedSiteVerificationRetry
            : undefined
        }
        guidedManagedSiteImport={guidedManagedSiteImport}
        allAccountsFilterAccountIds={allAccountsFilterAccountIds}
        credentialProfileLinks={credentialProfileLinks}
        getCredentialProfileForLocator={
          credentialAssociations.getProfileForLocator
        }
        canManageCredentialAssociations={
          !areCredentialProfileLinksLoading && !credentialProfileLinksError
        }
        canAssociateExistingCredential={
          !areCredentialProfilesLoading && credentialProfiles.length > 0
        }
        onAssociateAssociation={credentialAssociations.openPicker}
        onUnlinkAssociation={credentialAssociations.unlink}
        associationTarget={associationTarget}
        onAssociationTargetStatusChange={setAssociationTargetStatus}
      />

      {!isManagedSiteConfigComplete ? (
        <Notice
          tone="default"
          className="mt-density-6 mx-auto max-w-2xl text-left"
          description={
            <span>
              {t("keyManagement:managedSiteSetupRecovery.description")}{" "}
              <NoticeActionButton
                onClick={() =>
                  void openSettingsTab(BASIC_SETTINGS_TAB_IDS.ManagedSite, {
                    preserveHistory: true,
                  })
                }
              >
                {t(
                  "keyManagement:managedSiteSetupRecovery.configureManagedSite",
                )}
              </NoticeActionButton>
            </span>
          }
        />
      ) : null}

      <Footer />

      <AssociateApiCredentialProfileDialog
        isOpen={credentialAssociations.pickerTarget !== null}
        locator={credentialAssociations.pickerTarget?.locator ?? null}
        displayLabel={credentialAssociations.pickerTarget?.displayLabel}
        targetSecret={credentialAssociations.pickerTarget?.targetSecret}
        profiles={credentialProfiles}
        isProfilesLoading={areCredentialProfilesLoading}
        existingProfileNames={credentialAssociations.existingProfileNames}
        isWorking={credentialAssociations.isAssociating}
        onClose={credentialAssociations.closePicker}
        onAssociate={credentialAssociations.associate}
        onOpenProfiles={() => {
          credentialAssociations.clearPicker()
          void openApiCredentialProfilesPage()
        }}
      />

      <AddTokenDialog
        isOpen={isAddTokenOpen && !isSelectedNativeKeyAccount}
        onClose={() => setIsAddTokenOpen(false)}
        onSuccess={async () => {
          await nativeKeys.refresh()
        }}
        availableAccounts={addTokenAvailableAccounts}
        preSelectedAccountId={addTokenPreSelectedAccountId}
      />

      <RepairMissingKeysDialog
        isOpen={isRepairOpen}
        onClose={handleCloseRepairMissingKeys}
        accounts={displayData}
        startOnOpen={repairStartOnOpen}
      />

      <AccountKeyResourceEditorDialog
        editor={nativeKeys.editor}
        terminalCloseEditor={nativeKeys.terminalCloseEditor}
        opening={nativeKeys.editorOpening}
        onRetryOpening={nativeKeys.retryEditorOpening}
        onCancelOpening={nativeKeys.cancelEditorOpening}
        onClose={nativeKeys.closeEditor}
        onTerminalCloseSettled={nativeKeys.settleTerminalClose}
        onSubmit={nativeKeys.submitEditor}
        onValuesChange={nativeKeys.setEditorValues}
        onLoadOptions={nativeKeys.loadEditorOptions}
        focusWorkflowId={nativeKeys.focusWorkflowId ?? undefined}
      />

      <AccountKeyResourceDeleteDialog
        nativeKeys={nativeKeys}
        accounts={displayData}
        getProfileForLocator={getProfileForLocator}
      />

      <OneTimeSecretDialog
        isOpen={nativeKeys.createdSecret !== null}
        result={nativeKeys.createdSecret}
        onClose={nativeKeys.closeCreatedSecret}
        saveAction={nativeOneTimeSaveAction}
        onCopyResult={nativeKeys.recordCreatedSecretCopyResult}
        onSaveResult={nativeKeys.recordCreatedSecretSaveResult}
        focusWorkflowId={nativeKeys.focusWorkflowId ?? undefined}
      />

      <NewApiManagedVerificationDialog
        isOpen={verification.dialogState.isOpen}
        step={verification.dialogState.step}
        request={verification.dialogState.request}
        code={verification.dialogState.code}
        errorMessage={verification.dialogState.errorMessage}
        isBusy={verification.dialogState.isBusy}
        busyMessage={verification.dialogState.busyMessage}
        onCodeChange={verification.setCode}
        onClose={verification.closeDialog}
        onSubmit={verification.submitCode}
        onRetry={verification.retryVerification}
        onOpenSite={verification.openBaseUrl}
        onUpdateRequestConfig={verification.patchRequestConfig}
      />
    </div>
  )
}
