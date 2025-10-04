import AddTokenDialog from "~/components/AddTokenDialog"

import { Controls } from "./Controls"
import { Footer } from "./Footer"
import { Header } from "./Header"
import { useKeyManagement } from "./hooks/useKeyManagement"
import { TokenList } from "./TokenList"

export default function KeyManagement({
  routeParams
}: {
  routeParams?: Record<string, string>
}) {
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
    loadTokens,
    filteredTokens,
    copyKey,
    toggleKeyVisibility,
    handleAddToken,
    handleCloseAddToken,
    handleEditToken,
    handleDeleteToken
  } = useKeyManagement(routeParams)

  return (
    <div className="p-6">
      <Header
        onAddToken={handleAddToken}
        onRefresh={() => selectedAccount && loadTokens()}
        isLoading={isLoading || !selectedAccount}
        isAddTokenDisabled={!selectedAccount || displayData.length === 0}
      />

      <Controls
        selectedAccount={selectedAccount}
        setSelectedAccount={setSelectedAccount}
        searchTerm={searchTerm}
        setSearchTerm={setSearchTerm}
        displayData={displayData}
        tokens={tokens}
        filteredTokens={filteredTokens}
      />

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
      />

      <Footer />

      <AddTokenDialog
        isOpen={isAddTokenOpen}
        onClose={handleCloseAddToken}
        availableAccounts={displayData}
        preSelectedAccountId={selectedAccount || null}
        editingToken={editingToken}
      />
    </div>
  )
}
