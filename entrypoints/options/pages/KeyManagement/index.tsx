import { useEffect, useState } from "react"

import { RuntimeActionIds } from "~/constants/runtimeActions"
import { sendRuntimeActionMessage } from "~/utils/browserApi"

import { AccountSelectorPanel } from "./components/AccountSelectorPanel"
import { AccountSummaryBar } from "./components/AccountSummaryBar"
import AddTokenDialog from "./components/AddTokenDialog"
import { Footer } from "./components/Footer"
import { Header } from "./components/Header"
import { RepairMissingKeysDialog } from "./components/RepairMissingKeysDialog"
import { TokenList } from "./components/TokenList"
import { TokenSearchBar } from "./components/TokenSearchBar"
import { KEY_MANAGEMENT_ALL_ACCOUNTS_VALUE } from "./constants"
import { useKeyManagement } from "./hooks/useKeyManagement"

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
  const [isRepairOpen, setIsRepairOpen] = useState(false)
  const [repairStartOnOpen, setRepairStartOnOpen] = useState(false)

  const {
    displayData,
    selectedAccount,
    setSelectedAccount,
    searchTerm,
    setSearchTerm,
    tokens,
    isLoading,
    visibleKeys,
    isAddTokenOpen,
    editingToken,
    tokenLoadProgress,
    failedAccounts,
    accountSummaryItems,
    allAccountsFilterAccountId,
    setAllAccountsFilterAccountId,
    loadTokens,
    filteredTokens,
    copyKey,
    toggleKeyVisibility,
    retryFailedAccounts,
    handleAddToken,
    handleCloseAddToken,
    handleEditToken,
    handleDeleteToken,
  } = useKeyManagement(routeParams)

  useEffect(() => {
    let cancelled = false

    void (async () => {
      try {
        const response = await sendRuntimeActionMessage({
          action: RuntimeActionIds.AccountKeyRepairGetProgress,
        })

        if (cancelled) return
        if (!response?.success || !response?.data) return

        if (response.data.state === "running") {
          setRepairStartOnOpen(false)
          setIsRepairOpen(true)
        }
      } catch {
        // Silent: repair progress is optional UI enhancement
      }
    })()

    return () => {
      cancelled = true
    }
  }, [])

  const handleRepairMissingKeys = () => {
    setRepairStartOnOpen(true)
    setIsRepairOpen(true)
  }

  const handleCloseRepairMissingKeys = () => {
    setIsRepairOpen(false)
    setRepairStartOnOpen(false)
  }

  const handleAccountSummaryClick = (accountId: string) => {
    if (allAccountsFilterAccountId === accountId) {
      setAllAccountsFilterAccountId(null)
    } else {
      setAllAccountsFilterAccountId(accountId)
    }
  }

  return (
    <div className="p-6">
      <Header
        onAddToken={handleAddToken}
        onRepairMissingKeys={handleRepairMissingKeys}
        onRefresh={() => selectedAccount && loadTokens()}
        selectedAccount={selectedAccount}
        isLoading={isLoading || !selectedAccount}
        isAddTokenDisabled={!selectedAccount || displayData.length === 0}
        isRepairDisabled={displayData.length === 0}
      />

      <AccountSelectorPanel
        selectedAccount={selectedAccount}
        setSelectedAccount={setSelectedAccount}
        displayData={displayData}
        tokens={tokens}
        filteredTokens={filteredTokens}
        tokenLoadProgress={tokenLoadProgress}
        failedAccounts={failedAccounts}
        onRetryFailedAccounts={retryFailedAccounts}
      />

      {selectedAccount === KEY_MANAGEMENT_ALL_ACCOUNTS_VALUE &&
        accountSummaryItems.length > 0 && (
          <AccountSummaryBar
            items={accountSummaryItems}
            activeAccountId={allAccountsFilterAccountId}
            onAccountClick={handleAccountSummaryClick}
          />
        )}

      {selectedAccount ? (
        <TokenSearchBar searchTerm={searchTerm} setSearchTerm={setSearchTerm} />
      ) : null}

      <TokenList
        isLoading={isLoading}
        tokens={tokens}
        filteredTokens={filteredTokens}
        visibleKeys={visibleKeys}
        toggleKeyVisibility={toggleKeyVisibility}
        copyKey={copyKey}
        handleEditToken={handleEditToken}
        handleDeleteToken={handleDeleteToken}
        handleAddToken={handleAddToken}
        selectedAccount={selectedAccount}
        displayData={displayData}
        allAccountsFilterAccountId={allAccountsFilterAccountId}
      />

      <Footer />

      <AddTokenDialog
        isOpen={isAddTokenOpen}
        onClose={handleCloseAddToken}
        availableAccounts={displayData}
        preSelectedAccountId={
          selectedAccount === KEY_MANAGEMENT_ALL_ACCOUNTS_VALUE
            ? null
            : selectedAccount || null
        }
        editingToken={editingToken}
      />

      <RepairMissingKeysDialog
        isOpen={isRepairOpen}
        onClose={handleCloseRepairMissingKeys}
        accounts={displayData}
        startOnOpen={repairStartOnOpen}
      />
    </div>
  )
}
