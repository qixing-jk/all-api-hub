import { useEffect, useState } from "react"
import { useTranslation } from "react-i18next"

import { CCSwitchExportDialog } from "~/components/CCSwitchExportDialog"
import { Modal } from "~/components/ui"
import { useCopyKeyDialog } from "~/features/AccountManagement/components/CopyKeyDialog/hooks/useCopyKeyDialog"
import AddTokenDialog from "~/features/KeyManagement/components/AddTokenDialog"
import { DEFAULT_AUTO_PROVISION_TOKEN_NAME } from "~/services/accounts/accountKeyAutoProvisioning/ensureDefaultToken"
import type { ApiToken, DisplaySiteData } from "~/types"

import { DialogFooter } from "./DialogFooter"
import { DialogHeader } from "./DialogHeader"
import { ErrorDisplay } from "./ErrorDisplay"
import { LoadingIndicator } from "./LoadingIndicator"
import { TokenList } from "./TokenList"

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
  const [isAddTokenDialogOpen, setIsAddTokenDialogOpen] = useState(false)
  const [ccSwitchContext, setCCSwitchContext] = useState<{
    token: ApiToken
    account: DisplaySiteData
  } | null>(null)
  const {
    tokens,
    isLoading,
    error,
    isCreating,
    createError,
    sub2apiCreateAllowedGroups,
    copiedTokenId,
    expandedTokens,
    canCreateDefaultKey,
    fetchTokens,
    copyKey,
    createDefaultKey,
    refreshTokensAfterCreate,
    toggleTokenExpansion,
    clearSub2ApiCreateAllowedGroups,
  } = useCopyKeyDialog(isOpen, account)

  const handleOpenAddTokenDialog = () => {
    clearSub2ApiCreateAllowedGroups()
    setIsAddTokenDialogOpen(true)
  }
  const handleCloseAddTokenDialog = () => {
    clearSub2ApiCreateAllowedGroups()
    setIsAddTokenDialogOpen(false)
  }
  const handleAddTokenSuccess = () => {
    clearSub2ApiCreateAllowedGroups()
    return refreshTokensAfterCreate()
  }

  useEffect(() => {
    if (!isOpen || !account) {
      clearSub2ApiCreateAllowedGroups()
      setIsAddTokenDialogOpen(false)
    }
  }, [account, clearSub2ApiCreateAllowedGroups, isOpen])

  useEffect(() => {
    if (
      !sub2apiCreateAllowedGroups ||
      sub2apiCreateAllowedGroups.length === 0
    ) {
      return
    }

    setIsAddTokenDialogOpen(true)
  }, [sub2apiCreateAllowedGroups])

  const sub2apiQuickCreatePrefill =
    sub2apiCreateAllowedGroups && sub2apiCreateAllowedGroups.length > 0
      ? {
          modelId: "",
          defaultName: DEFAULT_AUTO_PROVISION_TOKEN_NAME,
          group: sub2apiCreateAllowedGroups.includes("default")
            ? "default"
            : sub2apiCreateAllowedGroups[0] ?? "default",
          allowedGroups: sub2apiCreateAllowedGroups,
        }
      : undefined

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
      return <ErrorDisplay error={error} onRetry={fetchTokens} />
    }
    if (!account) {
      return null
    }
    return (
      <TokenList
        tokens={tokens}
        expandedTokens={expandedTokens}
        copiedTokenId={copiedTokenId}
        onToggleToken={toggleTokenExpansion}
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
        footer={<DialogFooter tokenCount={tokens.length} onClose={onClose} />}
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
          createPrefill={sub2apiQuickCreatePrefill}
          prefillNotice={
            sub2apiQuickCreatePrefill
              ? t("sub2api.createRequiresGroupSelection")
              : undefined
          }
          onSuccess={handleAddTokenSuccess}
        />
      ) : null}
    </>
  )
}
