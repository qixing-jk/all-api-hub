import {
  ArrowPathIcon,
  ChevronDownIcon,
  ChevronUpIcon,
  ExclamationTriangleIcon,
  GlobeAltIcon,
  KeyIcon,
  PlusIcon,
} from "@heroicons/react/24/outline"
import { SendToBack } from "lucide-react"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useTranslation } from "react-i18next"

import { CCSwitchExportDialog } from "~/components/CCSwitchExportDialog"
import { ManagedSiteIcon } from "~/components/icons/ManagedSiteIcon"
import { Badge, Button, Card, Checkbox, EmptyState } from "~/components/ui"
import { useUserPreferencesContext } from "~/contexts/UserPreferencesContext"
import { cn } from "~/lib/utils"
import type { ManagedSiteTokenChannelStatus } from "~/services/managedSites/tokenChannelStatus"
import { getManagedSiteLabel } from "~/services/managedSites/utils/managedSite"
import type { AccountToken, DisplaySiteData } from "~/types"
import type {
  ManagedSiteTokenBatchExportExecutionResult,
  ManagedSiteTokenBatchExportItemInput,
} from "~/types/managedSiteTokenBatchExport"
import { createTab } from "~/utils/browser/browserApi"

import { KEY_MANAGEMENT_ALL_ACCOUNTS_VALUE } from "../constants"
import { buildTokenIdentityKey } from "../utils"
import { ManagedSiteTokenBatchExportDialog } from "./ManagedSiteTokenBatchExportDialog"
import { TokenListItem } from "./TokenListItem"

interface TokenListProps {
  isLoading: boolean
  tokens: AccountToken[]
  filteredTokens: AccountToken[]
  visibleKeys: Set<string>
  resolvingVisibleKeys: Set<string>
  getVisibleTokenKey: (token: AccountToken) => string
  toggleKeyVisibility: (
    account: DisplaySiteData,
    token: AccountToken,
  ) => Promise<void>
  copyKey: (account: DisplaySiteData, token: AccountToken) => Promise<void>
  handleEditToken: (token: AccountToken) => void
  handleDeleteToken: (token: AccountToken) => void
  handleAddToken: () => void
  onAddAccount?: () => void
  onRequestAccountSelection?: () => void
  selectedAccount: string
  displayData: DisplaySiteData[]
  currentAccountLoadError?: string | null
  onRetryCurrentAccount?: () => void
  managedSiteTokenStatuses?: Record<
    string,
    {
      isChecking: boolean
      result?: ManagedSiteTokenChannelStatus
    }
  >
  onManagedSiteImportSuccess?: (token: AccountToken) => void | Promise<void>
  onManagedSiteVerificationRetry?: (
    token: AccountToken,
    managedSiteStatus: ManagedSiteTokenChannelStatus,
  ) => void | Promise<void>
  allAccountsFilterAccountIds?: string[]
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
 * @param props.selectedAccount Currently selected account identifier.
 * @param props.tokens All tokens for the current account.
 * @param props.handleAddToken Callback to open the add-token flow.
 * @param props.displayData Account display data used to determine empty states.
 * @param props.currentAccountLoadError Error message shown when the selected account fails to load.
 * @param props.onRetryCurrentAccount Optional callback to retry loading the selected account.
 * @param props.onAddAccount Optional callback to open the add-account flow.
 * @param props.onRequestAccountSelection Optional callback to focus the account selector.
 */
function TokenEmptyState({
  selectedAccount,
  tokens,
  handleAddToken,
  displayData,
  currentAccountLoadError,
  onRetryCurrentAccount,
  onAddAccount,
  onRequestAccountSelection,
}: {
  selectedAccount: string
  tokens: unknown[]
  handleAddToken: () => void
  displayData: DisplaySiteData[]
  currentAccountLoadError?: string | null
  onRetryCurrentAccount?: () => void
  onAddAccount?: () => void
  onRequestAccountSelection?: () => void
}) {
  const { t } = useTranslation(["keyManagement", "account"])
  const currentAccount =
    selectedAccount && selectedAccount !== KEY_MANAGEMENT_ALL_ACCOUNTS_VALUE
      ? displayData.find((account) => account.id === selectedAccount) ?? null
      : null

  const handleOpenCurrentAccountSite = () => {
    const baseUrl = currentAccount?.baseUrl?.trim()
    if (!baseUrl) return
    void createTab(baseUrl, true)
  }

  // 如果没有账户
  if (displayData.length === 0) {
    return (
      <EmptyState
        icon={<KeyIcon className="h-12 w-12" />}
        title={t("account:emptyState")}
        description={t("keyManagement:pleaseAddAccount")}
        action={
          onAddAccount
            ? {
                label: t("account:addFirstAccount"),
                onClick: onAddAccount,
                variant: "default",
                icon: <PlusIcon className="h-4 w-4" />,
              }
            : undefined
        }
      />
    )
  }

  if (!selectedAccount) {
    return (
      <EmptyState
        icon={<KeyIcon className="h-12 w-12" />}
        title={t("keyManagement:pleaseSelectAccount")}
        description={t("keyManagement:selectAccountToContinue")}
        action={
          onRequestAccountSelection
            ? {
                label: t("keyManagement:selectAccount"),
                onClick: onRequestAccountSelection,
                variant: "default",
              }
            : undefined
        }
      />
    )
  }

  if (currentAccountLoadError) {
    return (
      <EmptyState
        variant="destructive"
        icon={<ExclamationTriangleIcon className="h-12 w-12" />}
        title={t("loadError.title")}
        description={t("loadError.description", {
          error: currentAccountLoadError,
        })}
        descriptionClassName="max-w-xl whitespace-pre-line"
        className="mt-4"
        actions={[
          {
            label: t("refreshTokenList"),
            onClick: () => onRetryCurrentAccount?.(),
            variant: "default",
            icon: <ArrowPathIcon className="h-4 w-4" />,
            disabled: !onRetryCurrentAccount,
          },
          {
            label: t("loadError.openSite"),
            onClick: handleOpenCurrentAccountSite,
            variant: "outline",
            icon: <GlobeAltIcon className="h-4 w-4" />,
            disabled: !currentAccount?.baseUrl?.trim(),
          },
        ]}
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
 * @param props.resolvingVisibleKeys Set of token IDs currently resolving to a usable secret.
 * @param props.getVisibleTokenKey Returns the best available source value for a token key.
 * @param props.toggleKeyVisibility Toggles a token between visible/hidden states.
 * @param props.copyKey Copies the token value to the clipboard.
 * @param props.handleEditToken Opens the edit modal for the given token.
 * @param props.handleDeleteToken Removes the token after confirmation.
 * @param props.handleAddToken Opens the add-token dialog.
 * @param props.selectedAccount Currently selected account identifier.
 * @param props.displayData Account metadata used to render contextual info.
 * @param props.currentAccountLoadError Optional load error for the currently selected account.
 * @param props.onRetryCurrentAccount Optional retry handler for the current account load.
 * @param props.managedSiteTokenStatuses Optional managed-site channel status by token identity.
 * @param props.onManagedSiteImportSuccess Optional callback after a managed-site token import succeeds.
 * @param props.onManagedSiteVerificationRetry Optional callback to retry managed-site token verification.
 * @param props.allAccountsFilterAccountIds Optional account ID filters applied in all-accounts mode.
 */
export function TokenList(props: TokenListProps) {
  const {
    isLoading,
    tokens,
    filteredTokens,
    visibleKeys,
    resolvingVisibleKeys,
    getVisibleTokenKey,
    toggleKeyVisibility,
    copyKey,
    handleEditToken,
    handleDeleteToken,
    handleAddToken,
    onAddAccount,
    onRequestAccountSelection,
    selectedAccount,
    displayData,
    currentAccountLoadError,
    onRetryCurrentAccount,
    managedSiteTokenStatuses,
    onManagedSiteImportSuccess,
    onManagedSiteVerificationRetry,
    allAccountsFilterAccountIds = [],
  } = props
  const { t } = useTranslation(["keyManagement", "settings"])
  const { managedSiteType } = useUserPreferencesContext()
  const [ccSwitchContext, setCCSwitchContext] = useState<{
    token: AccountToken
    account: DisplaySiteData
  } | null>(null)
  const [batchExportOpen, setBatchExportOpen] = useState(false)
  const [batchExportItems, setBatchExportItems] = useState<
    ManagedSiteTokenBatchExportItemInput[]
  >([])
  const [selectedTokenIds, setSelectedTokenIds] = useState<Set<string>>(
    () => new Set(),
  )

  const accountById = useMemo(() => {
    return new Map(displayData.map((account) => [account.id, account]))
  }, [displayData])
  const managedSiteLabel = getManagedSiteLabel(t, managedSiteType)

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
    if (allAccountsFilterAccountIds.length === 0) return

    // When the user filters via AccountSummaryBar, ensure matching groups are
    // expanded so the tokens are immediately visible.
    setCollapsedAccountIds((prev) => {
      const next = new Set(prev)
      let didChange = false

      for (const accountId of allAccountsFilterAccountIds) {
        if (!next.has(accountId)) continue
        next.delete(accountId)
        didChange = true
      }

      if (!didChange) return prev
      return next
    })
  }, [allAccountsFilterAccountIds, isAllAccountsMode])

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

  const filteredTokenIds = useMemo(
    () =>
      new Set(
        filteredTokens.map((token) =>
          buildTokenIdentityKey(token.accountId, token.id),
        ),
      ),
    [filteredTokens],
  )
  const selectedVisibleCount = useMemo(
    () =>
      Array.from(selectedTokenIds).filter((tokenId) =>
        filteredTokenIds.has(tokenId),
      ).length,
    [filteredTokenIds, selectedTokenIds],
  )
  const allFilteredSelected =
    filteredTokens.length > 0 && selectedVisibleCount === filteredTokens.length
  const selectedBatchItems = useMemo(
    () =>
      tokens
        .filter((token) =>
          selectedTokenIds.has(
            buildTokenIdentityKey(token.accountId, token.id),
          ),
        )
        .map((token) => {
          const account = accountById.get(token.accountId)
          return account ? { account, token } : null
        })
        .filter(
          (item): item is { account: DisplaySiteData; token: AccountToken } =>
            item !== null,
        ),
    [accountById, selectedTokenIds, tokens],
  )

  useEffect(() => {
    const availableIds = new Set(
      tokens.map((token) => buildTokenIdentityKey(token.accountId, token.id)),
    )
    setSelectedTokenIds((prev) => {
      const next = new Set(
        Array.from(prev).filter((tokenId) => availableIds.has(tokenId)),
      )
      return next.size === prev.size ? prev : next
    })
  }, [tokens])

  const collapseAll = useCallback(() => {
    if (!groupedTokens) return
    setCollapsedAccountIds(
      new Set(groupedTokens.map((group) => group.account.id)),
    )
  }, [groupedTokens, setCollapsedAccountIds])

  const expandAll = useCallback(
    () => setCollapsedAccountIds(new Set()),
    [setCollapsedAccountIds],
  )

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

  const toggleTokenSelection = (token: AccountToken, checked: boolean) => {
    const tokenIdentityKey = buildTokenIdentityKey(token.accountId, token.id)
    setSelectedTokenIds((prev) => {
      const next = new Set(prev)
      if (checked) {
        next.add(tokenIdentityKey)
      } else {
        next.delete(tokenIdentityKey)
      }
      return next
    })
  }

  const toggleFilteredSelection = () => {
    setSelectedTokenIds((prev) => {
      const next = new Set(prev)
      for (const token of filteredTokens) {
        const tokenIdentityKey = buildTokenIdentityKey(
          token.accountId,
          token.id,
        )
        if (allFilteredSelected) {
          next.delete(tokenIdentityKey)
        } else {
          next.add(tokenIdentityKey)
        }
      }
      return next
    })
  }

  const clearSelection = () => {
    setSelectedTokenIds(new Set())
  }

  const openBatchExportDialog = () => {
    setBatchExportItems(selectedBatchItems)
    setBatchExportOpen(true)
  }

  const closeBatchExportDialog = () => {
    setBatchExportOpen(false)
    setBatchExportItems([])
  }

  const handleBatchExportCompleted = (
    result: ManagedSiteTokenBatchExportExecutionResult,
  ) => {
    if (!onManagedSiteImportSuccess) return

    const selectedTokenByIdentity = new Map(
      batchExportItems.map(({ token }) => [
        buildTokenIdentityKey(token.accountId, token.id),
        token,
      ]),
    )

    for (const item of result.items) {
      if (!item.success) continue
      const token = selectedTokenByIdentity.get(item.id)
      if (!token) continue
      void Promise.resolve(onManagedSiteImportSuccess(token))
    }
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

  if (isLoading && tokens.length === 0) {
    return <LoadingSkeleton />
  }

  if (filteredTokens.length === 0) {
    return (
      <TokenEmptyState
        selectedAccount={selectedAccount}
        tokens={tokens}
        handleAddToken={handleAddToken}
        displayData={displayData}
        currentAccountLoadError={currentAccountLoadError}
        onRetryCurrentAccount={onRetryCurrentAccount}
        onAddAccount={onAddAccount}
        onRequestAccountSelection={onRequestAccountSelection}
      />
    )
  }

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2 rounded-md border p-3">
        <label className="flex items-center gap-2 text-sm">
          <Checkbox
            checked={allFilteredSelected}
            disabled={filteredTokens.length === 0}
            onCheckedChange={toggleFilteredSelection}
          />
          {t("batchManagedSiteExport.selection.visible", {
            selected: selectedVisibleCount,
            total: filteredTokens.length,
          })}
        </label>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            type="button"
            disabled={selectedTokenIds.size === 0}
            onClick={clearSelection}
          >
            {t("batchManagedSiteExport.actions.clearSelection")}
          </Button>
          <Button
            size="sm"
            type="button"
            disabled={selectedBatchItems.length === 0}
            onClick={openBatchExportDialog}
            leftIcon={<SendToBack className="h-4 w-4" />}
          >
            <span className="inline-flex items-center gap-1">
              <ManagedSiteIcon siteType={managedSiteType} size="sm" />
              {t("batchManagedSiteExport.actions.open", {
                site: managedSiteLabel,
                selectedCount: selectedBatchItems.length,
              })}
            </span>
          </Button>
        </div>
      </div>

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
                      {group.filteredTokens.map((token) => {
                        const tokenIdentityKey = buildTokenIdentityKey(
                          token.accountId,
                          token.id,
                        )
                        const managedSiteStatusEntry =
                          managedSiteTokenStatuses?.[tokenIdentityKey]

                        return (
                          <TokenListItem
                            key={tokenIdentityKey}
                            token={token}
                            displayTokenKey={getVisibleTokenKey(token)}
                            visibleKeys={visibleKeys}
                            isKeyVisibilityLoading={resolvingVisibleKeys.has(
                              tokenIdentityKey,
                            )}
                            toggleKeyVisibility={toggleKeyVisibility}
                            copyKey={copyKey}
                            handleEditToken={handleEditToken}
                            handleDeleteToken={handleDeleteToken}
                            account={account}
                            managedSiteStatus={managedSiteStatusEntry?.result}
                            isManagedSiteStatusChecking={
                              managedSiteStatusEntry?.isChecking === true
                            }
                            onManagedSiteImportSuccess={
                              onManagedSiteImportSuccess
                            }
                            onManagedSiteVerificationRetry={
                              onManagedSiteVerificationRetry
                            }
                            isSelected={selectedTokenIds.has(tokenIdentityKey)}
                            onSelectionChange={(checked) =>
                              toggleTokenSelection(token, checked)
                            }
                            onOpenCCSwitchDialog={() =>
                              handleOpenCCSwitchDialog(token, account)
                            }
                          />
                        )
                      })}
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
            const account = accountById.get(token.accountId)
            if (!account) {
              return null
            }

            const tokenIdentityKey = buildTokenIdentityKey(
              token.accountId,
              token.id,
            )
            const managedSiteStatusEntry =
              managedSiteTokenStatuses?.[tokenIdentityKey]

            return (
              <TokenListItem
                key={tokenIdentityKey}
                token={token}
                displayTokenKey={getVisibleTokenKey(token)}
                visibleKeys={visibleKeys}
                isKeyVisibilityLoading={resolvingVisibleKeys.has(
                  tokenIdentityKey,
                )}
                toggleKeyVisibility={toggleKeyVisibility}
                copyKey={copyKey}
                handleEditToken={handleEditToken}
                handleDeleteToken={handleDeleteToken}
                account={account}
                managedSiteStatus={managedSiteStatusEntry?.result}
                isManagedSiteStatusChecking={
                  managedSiteStatusEntry?.isChecking === true
                }
                onManagedSiteImportSuccess={onManagedSiteImportSuccess}
                onManagedSiteVerificationRetry={onManagedSiteVerificationRetry}
                isSelected={selectedTokenIds.has(tokenIdentityKey)}
                onSelectionChange={(checked) =>
                  toggleTokenSelection(token, checked)
                }
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

      <ManagedSiteTokenBatchExportDialog
        isOpen={batchExportOpen}
        onClose={closeBatchExportDialog}
        items={batchExportItems}
        onCompleted={handleBatchExportCompleted}
      />
    </>
  )
}
