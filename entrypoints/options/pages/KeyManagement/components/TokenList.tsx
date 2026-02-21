import {
  ChevronDownIcon,
  ChevronUpIcon,
  KeyIcon,
  PlusIcon,
} from "@heroicons/react/24/outline"
import { useEffect, useMemo, useRef, useState } from "react"
import { useTranslation } from "react-i18next"

import { CCSwitchExportDialog } from "~/components/CCSwitchExportDialog"
import { Badge, Button, Card, EmptyState } from "~/components/ui"
import { cn } from "~/lib/utils"
import type { DisplaySiteData } from "~/types"

import { KEY_MANAGEMENT_ALL_ACCOUNTS_VALUE } from "../constants"
import { AccountToken } from "../type"
import { buildTokenIdentityKey } from "../utils"
import { TokenListItem } from "./TokenListItem"

interface TokenListProps {
  isLoading: boolean
  tokens: AccountToken[]
  filteredTokens: AccountToken[]
  visibleKeys: Set<string>
  toggleKeyVisibility: (identityKey: string) => void
  copyKey: (key: string, name: string) => void
  handleEditToken: (token: AccountToken) => void
  handleDeleteToken: (token: AccountToken) => void
  handleAddToken: () => void
  selectedAccount: string
  displayData: DisplaySiteData[]
  allAccountsFilterAccountId?: string | null
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
    allAccountsFilterAccountId,
  } = props
  const { t } = useTranslation("keyManagement")
  const [ccSwitchContext, setCCSwitchContext] = useState<{
    token: AccountToken
    account: DisplaySiteData
  } | null>(null)

  const isAllAccountsMode =
    selectedAccount === KEY_MANAGEMENT_ALL_ACCOUNTS_VALUE
  const [collapsedAccountIds, setCollapsedAccountIds] = useState<Set<string>>(
    () =>
      selectedAccount === KEY_MANAGEMENT_ALL_ACCOUNTS_VALUE
        ? new Set(displayData.map((account) => account.id))
        : new Set(),
  )
  const hasInitializedCollapseRef = useRef(isAllAccountsMode)

  useEffect(() => {
    if (!isAllAccountsMode) {
      hasInitializedCollapseRef.current = false
      setCollapsedAccountIds(new Set())
      return
    }

    if (hasInitializedCollapseRef.current) return
    hasInitializedCollapseRef.current = true
    setCollapsedAccountIds(new Set(displayData.map((account) => account.id)))
  }, [displayData, isAllAccountsMode])

  useEffect(() => {
    if (!isAllAccountsMode) return
    if (!allAccountsFilterAccountId) return

    // When the user filters to a single account via AccountSummaryBar, ensure the
    // corresponding group is expanded so the tokens are immediately visible.
    setCollapsedAccountIds((prev) => {
      if (!prev.has(allAccountsFilterAccountId)) return prev
      const next = new Set(prev)
      next.delete(allAccountsFilterAccountId)
      return next
    })
  }, [allAccountsFilterAccountId, isAllAccountsMode])

  const groupedTokens = useMemo(() => {
    if (!isAllAccountsMode) return null

    const totalTokensByAccountId = new Map<string, AccountToken[]>()
    for (const token of tokens) {
      const list = totalTokensByAccountId.get(token.accountId) ?? []
      list.push(token)
      totalTokensByAccountId.set(token.accountId, list)
    }

    const filteredTokensByAccountId = new Map<string, AccountToken[]>()
    for (const token of filteredTokens) {
      const list = filteredTokensByAccountId.get(token.accountId) ?? []
      list.push(token)
      filteredTokensByAccountId.set(token.accountId, list)
    }

    return displayData
      .filter((account) => filteredTokensByAccountId.has(account.id))
      .map((account) => {
        const total = totalTokensByAccountId.get(account.id) ?? []
        const filtered = filteredTokensByAccountId.get(account.id) ?? []
        return {
          account,
          totalTokens: total,
          filteredTokens: filtered,
          totalCount: total.length,
          enabledCount: total.filter((item) => item.status === 1).length,
          showingCount: filtered.length,
        }
      })
  }, [displayData, filteredTokens, isAllAccountsMode, tokens])

  const collapseAll = () => {
    if (!groupedTokens) return
    setCollapsedAccountIds(
      new Set(groupedTokens.map((group) => group.account.id)),
    )
  }

  const expandAll = () => {
    setCollapsedAccountIds(new Set())
  }

  const toggleGroup = (accountId: string) => {
    setCollapsedAccountIds((prev) => {
      const next = new Set(prev)
      if (next.has(accountId)) {
        next.delete(accountId)
      } else {
        next.add(accountId)
      }
      return next
    })
  }

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

  if (isLoading && (!isAllAccountsMode || tokens.length === 0)) {
    return <LoadingSkeleton />
  }

  if (filteredTokens.length === 0) {
    return (
      <>
        <TokenEmptyState
          tokens={tokens}
          handleAddToken={handleAddToken}
          displayData={displayData}
        />
      </>
    )
  }

  return (
    <>
      {isAllAccountsMode && groupedTokens && groupedTokens.length > 0 ? (
        <>
          <div className="mb-4 flex flex-wrap items-center justify-end gap-2">
            <Button
              size="sm"
              variant="outline"
              type="button"
              onClick={expandAll}
              leftIcon={<ChevronDownIcon className="h-4 w-4" />}
            >
              {t("actions.expandAll")}
            </Button>
            <Button
              size="sm"
              variant="outline"
              type="button"
              onClick={collapseAll}
              leftIcon={<ChevronUpIcon className="h-4 w-4" />}
            >
              {t("actions.collapseAll")}
            </Button>
          </div>

          <div className="space-y-3">
            {groupedTokens.map((group) => {
              const { account } = group
              const isCollapsed = collapsedAccountIds.has(account.id)
              const shouldShowShowingCount =
                group.showingCount !== group.totalCount

              return (
                <Card
                  key={account.id}
                  variant="outlined"
                  className="overflow-hidden"
                >
                  <button
                    type="button"
                    className={cn(
                      "dark:hover:bg-dark-bg-tertiary flex w-full items-center justify-between gap-3 px-3 py-2 text-left hover:bg-gray-50",
                      isCollapsed
                        ? "rounded-lg"
                        : "dark:border-dark-bg-tertiary border-b border-gray-200",
                    )}
                    onClick={() => toggleGroup(account.id)}
                    aria-expanded={!isCollapsed}
                  >
                    <div className="flex min-w-0 flex-1 items-center gap-2">
                      <span className="truncate font-medium">
                        {account.name}
                      </span>
                      <Badge variant="secondary" size="sm" className="shrink-0">
                        {t("accountSummary.keys", { count: group.totalCount })}
                      </Badge>
                      <Badge variant="outline" size="sm" className="shrink-0">
                        {t("enabledCount", { count: group.enabledCount })}
                      </Badge>
                      {shouldShowShowingCount ? (
                        <Badge variant="outline" size="sm" className="shrink-0">
                          {t("showingCount", { count: group.showingCount })}
                        </Badge>
                      ) : null}
                    </div>
                    <ChevronDownIcon
                      className={cn(
                        "dark:text-dark-text-tertiary h-4 w-4 shrink-0 text-gray-500 transition-transform",
                        isCollapsed ? "rotate-0" : "rotate-180",
                      )}
                    />
                  </button>

                  {!isCollapsed ? (
                    <div className="space-y-3 p-3">
                      {group.filteredTokens.map((token) => (
                        <TokenListItem
                          key={buildTokenIdentityKey(token.accountId, token.id)}
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
                      ))}
                    </div>
                  ) : null}
                </Card>
              )
            })}
          </div>
        </>
      ) : (
        <div className="space-y-3">
          {filteredTokens.map((token) => {
            const account = displayData.find(
              (item) => item.id === token.accountId,
            )
            if (!account) {
              return null
            }

            return (
              <TokenListItem
                key={buildTokenIdentityKey(token.accountId, token.id)}
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
      )}

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
