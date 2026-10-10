import { useEffect, useState } from "react"
import { useTranslation } from "react-i18next"

import { Alert, Modal } from "~/components/ui"
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
import AddTokenDialog from "~/features/TokenProvisioning/creation/AddTokenDialog"
import { DefaultTokenGroupSelectionDialog } from "~/features/TokenProvisioning/creation/DefaultTokenGroupSelectionDialog"
import { useDefaultTokenQuickCreate } from "~/features/TokenProvisioning/creation/useDefaultTokenQuickCreate"
import { buildOneTimeApiKeyProfileSaveAction } from "~/features/TokenProvisioning/secretDelivery/apiCredentialProfileSaveAction"
import { OneTimeSecretDialog } from "~/features/TokenProvisioning/secretDelivery/OneTimeSecretDialog"
import type { AccountKeyCreationResult } from "~/services/accounts/keys/accountKeyCreation"
import { ACCOUNT_RUNTIME_KEY_SOURCES } from "~/services/accounts/keys/accountRuntimeKeys"
import { supportsRecoverableAccountRuntimeKeySecrets } from "~/services/accounts/keys/keyProductCapabilities"
import type { CredentialExportSource } from "~/services/integrations/credentialExport"
import type { DisplaySiteData } from "~/types"
import { createLogger } from "~/utils/core/logger"
import { openKeysPage } from "~/utils/navigation"

import { DialogFooter } from "./DialogFooter"
import { DialogHeader } from "./DialogHeader"
import { ErrorDisplay } from "./ErrorDisplay"
import { KeyInventoryList, type KeyEditorAction } from "./KeyInventoryList"
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
  const [createEditorAction, setCreateEditorAction] =
    useState<KeyEditorAction | null>(null)
  const isAddTokenDialogOpen = createEditorAction !== null
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
      setCreateEditorAction("default")
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
    setCreateEditorAction("custom")
  }
  const handleCloseAddTokenDialog = () => {
    setCreateEditorAction(null)
    setIsCreateEditorReady(false)
  }
  const handleAddTokenSuccess = (createdToken: AccountKeyCreationResult) => {
    return refreshRuntimeKeysAfterCreate(createdToken)
  }

  useEffect(() => {
    if (!isOpen || !account) {
      setCreateEditorAction(null)
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
        openingEditorAction={isOpeningCreateEditor ? createEditorAction : null}
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
        focusFallbackKey={isAddTokenDialogOpen ? undefined : account?.id}
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
        <div className="space-y-density-3">
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
