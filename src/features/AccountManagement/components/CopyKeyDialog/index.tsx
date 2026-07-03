import { useEffect, useRef, useState } from "react"
import { useTranslation } from "react-i18next"

import { CCSwitchExportDialog } from "~/components/CCSwitchExportDialog"
import { Modal } from "~/components/ui"
import { useCopyKeyDialog } from "~/features/AccountManagement/components/CopyKeyDialog/hooks/useCopyKeyDialog"
import AddTokenDialog from "~/features/TokenProvisioning/components/AddTokenDialog"
import { buildDefaultTokenCreatePrefill } from "~/features/TokenProvisioning/components/AddTokenDialog/defaultTokenCreatePrefill"
import { OneTimeApiKeyDialog } from "~/features/TokenProvisioning/components/OneTimeApiKeyDialog"
import { buildOneTimeApiKeyProfileSaveAction } from "~/features/TokenProvisioning/utils/apiCredentialProfileSaveAction"
import type { ApiToken, DisplaySiteData } from "~/types"
import { createLogger } from "~/utils/core/logger"

import { DialogFooter } from "./DialogFooter"
import { DialogHeader } from "./DialogHeader"
import { ErrorDisplay } from "./ErrorDisplay"
import { LoadingIndicator } from "./LoadingIndicator"
import { RuntimeKeyList } from "./RuntimeKeyList"

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
  const { t } = useTranslation("messages")
  const keyManagementT = useTranslation("keyManagement").t
  const [isAddTokenDialogOpen, setIsAddTokenDialogOpen] = useState(false)
  const isMountedRef = useRef(true)
  const [ccSwitchContext, setCCSwitchContext] = useState<{
    token: ApiToken
    account: DisplaySiteData
  } | null>(null)
  const {
    runtimeKeys,
    isLoading,
    error,
    isCreating,
    createError,
    oneTimeToken,
    defaultTokenCreateAllowedGroups,
    copiedRuntimeKeyId,
    expandedRuntimeKeys,
    canCreateDefaultKey,
    fetchRuntimeKeys,
    copyKey,
    createDefaultKey,
    refreshRuntimeKeysAfterCreate,
    toggleRuntimeKeyExpansion,
    clearDefaultTokenCreateAllowedGroups,
    clearOneTimeToken,
  } = useCopyKeyDialog(isOpen, account)
  const oneTimeKeySaveAction =
    account && oneTimeToken
      ? buildOneTimeApiKeyProfileSaveAction({
          accountName: account.name,
          baseUrl: account.baseUrl,
          siteType: account.siteType,
          tagIds: account.tagIds ?? [],
          token: oneTimeToken,
          t: keyManagementT,
          logger,
          source: "CopyKeyDialog",
        })
      : undefined

  const handleOpenAddTokenDialog = () => {
    clearDefaultTokenCreateAllowedGroups()
    setIsAddTokenDialogOpen(true)
  }
  const handleCloseAddTokenDialog = () => {
    clearDefaultTokenCreateAllowedGroups()
    setIsAddTokenDialogOpen(false)
  }
  const handleAddTokenSuccess = (createdToken?: ApiToken) => {
    clearDefaultTokenCreateAllowedGroups()
    return refreshRuntimeKeysAfterCreate(createdToken)
  }

  useEffect(() => {
    isMountedRef.current = true

    return () => {
      isMountedRef.current = false
    }
  }, [])

  useEffect(() => {
    if (!isOpen || !account) {
      clearDefaultTokenCreateAllowedGroups()
      setIsAddTokenDialogOpen(false)
    }
  }, [account, clearDefaultTokenCreateAllowedGroups, isOpen])

  useEffect(() => {
    if (
      !isMountedRef.current ||
      !isOpen ||
      !account ||
      !defaultTokenCreateAllowedGroups ||
      defaultTokenCreateAllowedGroups.length === 0
    ) {
      return
    }

    setIsAddTokenDialogOpen(true)
  }, [account, defaultTokenCreateAllowedGroups, isOpen])

  const defaultTokenQuickCreatePrefill = buildDefaultTokenCreatePrefill(
    defaultTokenCreateAllowedGroups,
  )

  const handleOpenCCSwitchDialog = (
    token: ApiToken,
    currentAccount: DisplaySiteData,
  ) => {
    setCCSwitchContext({ token, account: currentAccount })
  }

  const handleCloseCCSwitchDialog = () => setCCSwitchContext(null)

  const renderContent = () => {
    if (isLoading) {
      return <LoadingIndicator />
    }
    if (error) {
      return <ErrorDisplay error={error} onRetry={fetchRuntimeKeys} />
    }
    if (!account) {
      return null
    }
    return (
      <RuntimeKeyList
        runtimeKeys={runtimeKeys}
        expandedRuntimeKeys={expandedRuntimeKeys}
        copiedRuntimeKeyId={copiedRuntimeKeyId}
        onToggleRuntimeKey={toggleRuntimeKeyExpansion}
        onCopyKey={copyKey}
        account={account}
        onOpenCCSwitchDialog={handleOpenCCSwitchDialog}
        canCreateDefaultKey={canCreateDefaultKey}
        isCreating={isCreating}
        createError={createError}
        onCreateDefaultKey={createDefaultKey}
        onOpenAddTokenDialog={handleOpenAddTokenDialog}
      />
    )
  }

  return (
    <>
      <Modal
        isOpen={isOpen}
        onClose={onClose}
        panelClassName="max-h-[85vh] overflow-hidden flex flex-col"
        header={<DialogHeader account={account} />}
        footer={
          <DialogFooter keyCount={runtimeKeys.length} onClose={onClose} />
        }
      >
        <div className="flex-1 overflow-y-auto">{renderContent()}</div>
      </Modal>
      {ccSwitchContext && (
        <CCSwitchExportDialog
          isOpen={true}
          onClose={handleCloseCCSwitchDialog}
          account={ccSwitchContext.account}
          token={ccSwitchContext.token}
        />
      )}
      {account ? (
        <AddTokenDialog
          isOpen={isAddTokenDialogOpen}
          onClose={handleCloseAddTokenDialog}
          availableAccounts={[account]}
          preSelectedAccountId={account.id}
          createPrefill={defaultTokenQuickCreatePrefill}
          prefillNotice={
            defaultTokenQuickCreatePrefill
              ? t("tokenProvisioning.createRequiresGroupSelection")
              : undefined
          }
          onSuccess={handleAddTokenSuccess}
          showOneTimeKeyDialog={false}
        />
      ) : null}
      <OneTimeApiKeyDialog
        isOpen={!!oneTimeToken}
        token={oneTimeToken}
        onClose={clearOneTimeToken}
        saveAction={oneTimeKeySaveAction}
      />
    </>
  )
}

const logger = createLogger("CopyKeyDialog")
