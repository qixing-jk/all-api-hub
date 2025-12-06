import { KeyIcon, PlusIcon } from "@heroicons/react/24/outline"
import { useState } from "react"
import { useTranslation } from "react-i18next"

import { CCSwitchExportDialog } from "~/components/CCSwitchExportDialog"
import { Card, EmptyState } from "~/components/ui"
import type { DisplaySiteData } from "~/types"

import { AccountToken } from "../type"
import { TokenListItem } from "./TokenListItem"

interface TokenListProps {
  isLoading: boolean
  tokens: AccountToken[]
  filteredTokens: AccountToken[]
  visibleKeys: Set<number>
  toggleKeyVisibility: (id: number) => void
  copyKey: (key: string, name: string) => void
  handleEditToken: (token: AccountToken) => void
  handleDeleteToken: (token: AccountToken) => void
  handleAddToken: () => void
  selectedAccount: string
  displayData: DisplaySiteData[]
}

/**
 * Skeleton placeholder shown while tokens list is loading.
 */
function LoadingSkeleton() {
  return (
    <div className="space-y-3">
      {[...Array(3)].map((_, i) => (
        <Card key={i} padding="sm" className="animate-pulse">
          <div className="dark:bg-dark-bg-tertiary mb-2 h-4 w-1/4 rounded bg-gray-200"></div>
          <div className="dark:bg-dark-bg-tertiary mb-2 h-3 w-1/2 rounded bg-gray-200"></div>
          <div className="dark:bg-dark-bg-tertiary h-3 w-3/4 rounded bg-gray-200"></div>
        </Card>
      ))}
    </div>
  )
}

/**
 * Empty state content for no tokens or filtered results.
 * @param props Component props container.
 * @param props.tokens All tokens for the current account.
 * @param props.handleAddToken Callback to open the add-token flow.
 * @param props.displayData Account display data used to determine empty states.
 */
function TokenEmptyState({
  tokens,
  handleAddToken,
  displayData,
}: {
  tokens: unknown[]
  handleAddToken: () => void
  displayData: { id: string }[]
}) {
  const { t } = useTranslation("keyManagement")

  // 如果没有账户
  if (displayData.length === 0) {
    return (
      <EmptyState
        icon={<KeyIcon className="h-12 w-12" />}
        title={tokens.length === 0 ? t("noKeys") : t("noMatchingKeys")}
        description={t("pleaseAddAccount")}
      />
    )
  }

  // 如果没有密钥
  if (tokens.length === 0) {
    return (
      <EmptyState
        icon={<KeyIcon className="h-12 w-12" />}
        title={t("noKeys")}
        action={{
          label: t("createFirstKey"),
          onClick: handleAddToken,
          variant: "success",
          icon: <PlusIcon className="h-4 w-4" />,
        }}
      />
    )
  }

  // 搜索无结果
  return (
    <EmptyState
      icon={<KeyIcon className="h-12 w-12" />}
      title={t("noMatchingKeys")}
    />
  )
}

/**
 * Displays a list of API tokens with loading and empty states.
 * Handles key visibility toggles, copy, edit/delete actions, and CCSwitch export.
 * @param props Component props configuring the token list view.
 * @param props.isLoading Whether data for the current account is still loading.
 * @param props.tokens Tokens belonging to the selected account.
 * @param props.filteredTokens Tokens after search/filter is applied.
 * @param props.visibleKeys Set of token IDs whose values are currently unmasked.
 * @param props.toggleKeyVisibility Toggles a token between visible/hidden states.
 * @param props.copyKey Copies the token value to the clipboard.
 * @param props.handleEditToken Opens the edit modal for the given token.
 * @param props.handleDeleteToken Removes the token after confirmation.
 * @param props.handleAddToken Opens the add-token dialog.
 * @param props.selectedAccount Currently selected account identifier.
 * @param props.displayData Account metadata used to render contextual info.
 */
export function TokenList(props: TokenListProps) {
  const {
    isLoading,
    tokens,
    filteredTokens,
    visibleKeys,
    toggleKeyVisibility,
    copyKey,
    handleEditToken,
    handleDeleteToken,
    handleAddToken,
    selectedAccount,
    displayData,
  } = props
  const { t } = useTranslation("keyManagement")
  const [ccSwitchContext, setCCSwitchContext] = useState<{
    token: AccountToken
    account: DisplaySiteData
  } | null>(null)

  const handleOpenCCSwitchDialog = (
    token: AccountToken,
    account: DisplaySiteData,
  ) => {
    setCCSwitchContext({ token, account })
  }

  const handleCloseCCSwitchDialog = () => {
    setCCSwitchContext(null)
  }

  if (!selectedAccount) {
    return (
      <EmptyState
        icon={<KeyIcon className="h-12 w-12" />}
        title={t("noKeys")}
      />
    )
  }

  if (isLoading) {
    return <LoadingSkeleton />
  }

  if (filteredTokens.length === 0) {
    return (
      <TokenEmptyState
        tokens={tokens}
        handleAddToken={handleAddToken}
        displayData={displayData}
      />
    )
  }

  return (
    <>
      <div className="space-y-3">
        {filteredTokens.map((token) => {
          const account = displayData.find(
            (item) => item.name === token.accountName,
          )
          if (!account) {
            return null
          }

          return (
            <TokenListItem
              key={`${token.accountName}-${token.id}`}
              token={token}
              visibleKeys={visibleKeys}
              toggleKeyVisibility={toggleKeyVisibility}
              copyKey={copyKey}
              handleEditToken={handleEditToken}
              handleDeleteToken={handleDeleteToken}
              account={account}
              onOpenCCSwitchDialog={() =>
                handleOpenCCSwitchDialog(token, account)
              }
            />
          )
        })}
      </div>

      {ccSwitchContext && (
        <CCSwitchExportDialog
          isOpen={true}
          onClose={handleCloseCCSwitchDialog}
          account={ccSwitchContext.account}
          token={ccSwitchContext.token}
        />
      )}
    </>
  )
}
