import { useEffect, useState } from "react"

import { CCSwitchExportDialog } from "~/components/CCSwitchExportDialog"
import { Modal } from "~/components/ui"
import AddTokenDialog from "~/entrypoints/options/pages/KeyManagement/components/AddTokenDialog"
import { useCopyKeyDialog } from "~/features/AccountManagement/components/CopyKeyDialog/hooks/useCopyKeyDialog"
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
    copiedKey,
    expandedTokens,
    canCreateDefaultKey,
    fetchTokens,
    copyKey,
    createDefaultKey,
    refreshTokensAfterCreate,
    toggleTokenExpansion,
  } = useCopyKeyDialog(isOpen, account)

  const handleOpenAddTokenDialog = () => setIsAddTokenDialogOpen(true)
  const handleCloseAddTokenDialog = () => setIsAddTokenDialogOpen(false)
  const handleAddTokenSuccess = () => refreshTokensAfterCreate()

  useEffect(() => {
    if (!isOpen || !account) {
      setIsAddTokenDialogOpen(false)
    }
  }, [isOpen, account])

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
        copiedKey={copiedKey}
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
          onSuccess={handleAddTokenSuccess}
        />
      ) : null}
    </>
  )
}
