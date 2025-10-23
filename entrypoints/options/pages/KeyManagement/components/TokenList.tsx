import { KeyIcon, PlusIcon } from "@heroicons/react/24/outline"
import { useTranslation } from "react-i18next"

import { EmptyState } from "~/components/ui"
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

function LoadingSkeleton() {
  return (
    <div className="space-y-3">
      {[...Array(3)].map((_, i) => (
        <div
          key={i}
          className="border border-gray-200 dark:border-dark-bg-tertiary rounded-lg p-4 animate-pulse">
          <div className="h-4 bg-gray-200 dark:bg-dark-bg-tertiary rounded w-1/4 mb-2"></div>
          <div className="h-3 bg-gray-200 dark:bg-dark-bg-tertiary rounded w-1/2 mb-2"></div>
          <div className="h-3 bg-gray-200 dark:bg-dark-bg-tertiary rounded w-3/4"></div>
        </div>
      ))}
    </div>
  )
}

function TokenEmptyState({
  tokens,
  handleAddToken,
  displayData
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
        icon={<KeyIcon className="w-12 h-12" />}
        title={tokens.length === 0 ? t("noKeys") : t("noMatchingKeys")}
        description={t("pleaseAddAccount")}
      />
    )
  }

  // 如果没有密钥
  if (tokens.length === 0) {
    return (
      <EmptyState
        icon={<KeyIcon className="w-12 h-12" />}
        title={t("noKeys")}
        action={{
          label: t("createFirstKey"),
          onClick: handleAddToken,
          variant: "success",
          icon: <PlusIcon className="w-4 h-4" />
        }}
      />
    )
  }

  // 搜索无结果
  return (
    <EmptyState
      icon={<KeyIcon className="w-12 h-12" />}
      title={t("noMatchingKeys")}
    />
  )
}

export function TokenList({
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
  displayData
}: TokenListProps) {
  const { t } = useTranslation("keyManagement")

  if (!selectedAccount) {
    return (
      <EmptyState
        icon={<KeyIcon className="w-12 h-12" />}
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
    <div className="space-y-3">
      {filteredTokens.map((token) => (
        <TokenListItem
          key={`${token.accountName}-${token.id}`}
          token={token}
          visibleKeys={visibleKeys}
          toggleKeyVisibility={toggleKeyVisibility}
          copyKey={copyKey}
          handleEditToken={handleEditToken}
          handleDeleteToken={handleDeleteToken}
          account={
            displayData.find(
              (account) => account.name === token.accountName
            ) as DisplaySiteData
          }
        />
      ))}
    </div>
  )
}
