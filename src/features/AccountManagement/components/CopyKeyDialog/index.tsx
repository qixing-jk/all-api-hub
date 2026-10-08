import { useEffect, useState } from "react"
import { useTranslation } from "react-i18next"

import { Alert, Modal, Spinner } from "~/components/ui"
import { useCopyKeyDialog } from "~/features/AccountManagement/components/CopyKeyDialog/hooks/useCopyKeyDialog"
import { ACCOUNT_MANAGEMENT_TEST_IDS } from "~/features/AccountManagement/testIds"
import { useApiCredentialProfileLinks } from "~/features/ApiCredentialProfiles/associations/useApiCredentialProfileLinks"
import { useApiCredentialProfiles } from "~/features/ApiCredentialProfiles/workspace/useApiCredentialProfiles"
import {
  DeeplinkExportDialog,
  type DeeplinkExportRequest,
  type DeeplinkExportTarget,
} from "~/features/CredentialExport/DeeplinkExportDialog"
import { getCredentialProfileForLocator } from "~/features/KeyManagement/associations/credentialAssociations"
import type { NativeKeyManagementRow } from "~/features/KeyManagement/types"
import AddTokenDialog from "~/features/TokenProvisioning/components/AddTokenDialog"
import { DefaultTokenGroupSelectionDialog } from "~/features/TokenProvisioning/components/DefaultTokenGroupSelectionDialog"
import { OneTimeSecretDialog } from "~/features/TokenProvisioning/components/OneTimeSecretDialog"
import { useDefaultTokenQuickCreate } from "~/features/TokenProvisioning/hooks/useDefaultTokenQuickCreate"
import { buildOneTimeApiKeyProfileSaveAction } from "~/features/TokenProvisioning/utils/apiCredentialProfileSaveAction"
import type { AccountKeyCreationResult } from "~/services/accounts/accountKeyCreation"
import { ACCOUNT_RUNTIME_KEY_SOURCES } from "~/services/accounts/accountRuntimeKeys"
import { supportsRecoverableAccountRuntimeKeySecrets } from "~/services/accounts/keyProductCapabilities"
import type { CredentialExportSource } from "~/services/integrations/credentialExport"
import type { DisplaySiteData } from "~/types"
import { createLogger } from "~/utils/core/logger"
import { openKeysPage } from "~/utils/navigation"

import { DialogFooter } from "./DialogFooter"
import { DialogHeader } from "./DialogHeader"
import { ErrorDisplay } from "./ErrorDisplay"
import { KeyInventoryList } from "./KeyInventoryList"
import { LoadingIndicator } from "./LoadingIndicator"

interface CopyKeyDialogProps {
  isOpen: boolean
  onClose: () => void
  account: DisplaySiteData | null
}

/**
 * Modal dialog for browsing and copying API keys tied to an account, with export helpers.
 */
export default function CopyKeyDialog({
  isOpen,
  onClose,
  account,
}: CopyKeyDialogProps) {
  const keyManagementT = useTranslation("keyManagement").t
  const { profiles, isLoading: profilesLoading } = useApiCredentialProfiles()
  const {
    links,
    isLoading: linksLoading,
    error: linksError,
  } = useApiCredentialProfileLinks()
  const [isAddTokenDialogOpen, setIsAddTokenDialogOpen] = useState(false)
  const [isCreateEditorReady, setIsCreateEditorReady] = useState(false)
  const [deeplinkExportRequest, setDeeplinkExportRequest] =
    useState<DeeplinkExportRequest | null>(null)
  const {
    runtimeKeys,
    nativeKeyRows,
    isLoading,
    error,
    postCreateError,
    oneTimeSecret,
    copiedRuntimeKeyId,
    expandedRuntimeKeys,
    canCreateDefaultKey,
    supportsApiTokenCreation,
    fetchKeyInventory,
    copyKey,
    refreshRuntimeKeysAfterCreate,
    toggleRuntimeKeyExpansion,
    clearOneTimeSecret,
  } = useCopyKeyDialog(isOpen, account)
  const defaultTokenQuickCreate = useDefaultTokenQuickCreate({
    isActive: isOpen,
    account,
    canCreate: canCreateDefaultKey,
    onCreated: refreshRuntimeKeysAfterCreate,
    onInputRequired: () => {
      setIsCreateEditorReady(false)
      setIsAddTokenDialogOpen(true)
    },
  })
  const {
    selection: defaultTokenGroupSelection,
    isBusy: isDefaultTokenQuickCreateBusy,
    isCreating: isDefaultTokenQuickCreating,
    error: defaultTokenQuickCreateError,
  } = defaultTokenQuickCreate.view
  const oneTimeKeySaveAction =
    account && oneTimeSecret
      ? buildOneTimeApiKeyProfileSaveAction({
          result: oneTimeSecret,
          t: keyManagementT,
          logger,
          source: "CopyKeyDialog",
        })
      : undefined
  const getCredentialProfile = (row: NativeKeyManagementRow) => {
    if (profilesLoading || linksLoading || linksError) return undefined
    return getCredentialProfileForLocator(links, profiles, {
      source: ACCOUNT_RUNTIME_KEY_SOURCES.AccountKeyResource,
      ref: row.facts.ref,
    })
  }
  const showCreateResponseOnlyWarning =
    account !== null &&
    !supportsRecoverableAccountRuntimeKeySecrets(account.siteType) &&
    (nativeKeyRows.length === 0 ||
      nativeKeyRows.some((row) => !getCredentialProfile(row)?.apiKey.trim()))
  const isOpeningCreateEditor = isAddTokenDialogOpen && !isCreateEditorReady

  const handleOpenAddTokenDialog = () => {
    defaultTokenQuickCreate.reset()
    setIsCreateEditorReady(false)
    setIsAddTokenDialogOpen(true)
  }
  const handleCloseAddTokenDialog = () => {
    setIsAddTokenDialogOpen(false)
    setIsCreateEditorReady(false)
  }
  const handleAddTokenSuccess = (createdToken: AccountKeyCreationResult) => {
    return refreshRuntimeKeysAfterCreate(createdToken)
  }

  useEffect(() => {
    if (!isOpen || !account) {
      setIsAddTokenDialogOpen(false)
      setIsCreateEditorReady(false)
    }
  }, [account, isOpen])

  const handleOpenDeeplinkExport = (
    target: DeeplinkExportTarget,
    source: CredentialExportSource,
  ) => {
    setDeeplinkExportRequest({ target, source })
  }

  const handleCloseDeeplinkExport = () => setDeeplinkExportRequest(null)

  const handleOpenKeyManagement = () => {
    if (!account) return
    onClose()
    void openKeysPage(account.id)
  }

  const renderContent = () => {
    if (isLoading) {
      return <LoadingIndicator />
    }
    if (error) {
      return <ErrorDisplay error={error} onRetry={fetchKeyInventory} />
    }
    if (!account) {
      return null
    }
    return (
      <KeyInventoryList
        runtimeKeys={runtimeKeys}
        nativeKeyRows={nativeKeyRows}
        getCredentialProfile={getCredentialProfile}
        expandedRuntimeKeys={expandedRuntimeKeys}
        copiedRuntimeKeyId={copiedRuntimeKeyId}
        onToggleRuntimeKey={toggleRuntimeKeyExpansion}
        onCopyKey={copyKey}
        account={account}
        onOpenDeeplinkExport={handleOpenDeeplinkExport}
        canCreateDefaultKey={canCreateDefaultKey}
        isCreating={isDefaultTokenQuickCreateBusy}
        isOpeningEditor={isOpeningCreateEditor}
        createError={
          defaultTokenGroupSelection
            ? null
            : defaultTokenQuickCreateError ?? postCreateError
        }
        onCreateDefaultKey={defaultTokenQuickCreate.start}
        onOpenAddTokenDialog={handleOpenAddTokenDialog}
        supportsApiTokenCreation={supportsApiTokenCreation}
      />
    )
  }

  return (
    <>
      <Modal
        isOpen={isOpen}
        onClose={onClose}
        size="lg"
        panelClassName="max-h-[85vh] overflow-hidden flex flex-col"
        footerTestId={ACCOUNT_MANAGEMENT_TEST_IDS.copyKeyDialogFooter}
        header={<DialogHeader account={account} />}
        footer={
          <DialogFooter
            keyCount={runtimeKeys.length + nativeKeyRows.length}
            onClose={onClose}
            onOpenKeyManagement={account ? handleOpenKeyManagement : undefined}
          />
        }
      >
        <div className="space-y-density-3 flex-1 overflow-y-auto">
          {showCreateResponseOnlyWarning ? (
            <Alert
              compact
              variant="warning"
              description={keyManagementT(
                "keyDetails.createResponseOnlySecret",
              )}
            />
          ) : null}
          {renderContent()}
          {isOpeningCreateEditor ? (
            <div
              role="status"
              aria-label={keyManagementT("native.editor.opening.loading")}
              className="text-muted-foreground flex items-center gap-2 text-sm"
            >
              <Spinner size="sm" aria-hidden="true" />
              {keyManagementT("native.editor.opening.loading")}
            </div>
          ) : null}
        </div>
      </Modal>
      {deeplinkExportRequest && (
        <DeeplinkExportDialog
          request={deeplinkExportRequest}
          onClose={handleCloseDeeplinkExport}
        />
      )}
      {account ? (
        <AddTokenDialog
          isOpen={isAddTokenDialogOpen}
          onClose={handleCloseAddTokenDialog}
          availableAccounts={[account]}
          preSelectedAccountId={account.id}
          onSuccess={handleAddTokenSuccess}
          onEditorReady={() => setIsCreateEditorReady(true)}
          showOneTimeKeyDialog={false}
        />
      ) : null}
      <DefaultTokenGroupSelectionDialog
        isOpen={Boolean(defaultTokenGroupSelection)}
        requirements={defaultTokenGroupSelection?.requirements ?? []}
        isCreating={isDefaultTokenQuickCreating}
        error={defaultTokenGroupSelection ? defaultTokenQuickCreateError : null}
        onCancel={defaultTokenQuickCreate.cancelSelection}
        onConfirm={defaultTokenQuickCreate.confirmGroup}
      />
      <OneTimeSecretDialog
        isOpen={!!oneTimeSecret}
        result={oneTimeSecret}
        onClose={clearOneTimeSecret}
        saveAction={oneTimeKeySaveAction}
      />
    </>
  )
}

const logger = createLogger("CopyKeyDialog")
