import {
  ChevronDownIcon,
  ChevronUpIcon,
  InboxIcon,
  PlusIcon
} from "@heroicons/react/24/outline"
import { useMemo, useState } from "react"
import { useTranslation } from "react-i18next"

import {
  Card,
  CardContent,
  CardList,
  EmptyState,
  IconButton
} from "~/components/ui"
import { DATA_TYPE_BALANCE, DATA_TYPE_CONSUMPTION } from "~/constants"
import { useAccountActionsContext } from "~/features/AccountManagement/hooks/AccountActionsContext"
import { useAccountDataContext } from "~/features/AccountManagement/hooks/AccountDataContext"
import { useDialogStateContext } from "~/features/AccountManagement/hooks/DialogStateContext"
import {
  useAccountSearch,
  type SearchResultWithHighlight
} from "~/features/AccountManagement/hooks/useAccountSearch"
import type { DisplaySiteData, SortField } from "~/types"

import CopyKeyDialog from "../CopyKeyDialog"
import DelAccountDialog from "../DelAccountDialog"
import AccountListItem from "./AccountListItem"
import AccountSearchInput from "./AccountSearchInput"

interface AccountListProps {
  initialSearchQuery?: string
}

export default function AccountList({ initialSearchQuery }: AccountListProps) {
  const { t } = useTranslation(["account", "common"])
  const { sortedData, displayData, handleSort, sortField, sortOrder } =
    useAccountDataContext()
  const { openAddAccount } = useDialogStateContext()
  const { handleDeleteAccount } = useAccountActionsContext()

  const [deleteDialogAccount, setDeleteDialogAccount] =
    useState<DisplaySiteData | null>(null)
  const [copyKeyDialogAccount, setCopyKeyDialogAccount] =
    useState<DisplaySiteData | null>(null)

  const { query, setQuery, clearSearch, searchResults, inSearchMode } =
    useAccountSearch(displayData, initialSearchQuery)

  const handleDeleteWithDialog = (site: DisplaySiteData) => {
    setDeleteDialogAccount(site)
  }

  const handleCopyKeyWithDialog = (site: DisplaySiteData) => {
    setCopyKeyDialogAccount(site)
  }

  const displayedResults = useMemo<
    Array<{
      account: DisplaySiteData
      highlights?: SearchResultWithHighlight["highlights"]
    }>
  >(() => {
    if (inSearchMode) {
      return searchResults.map((result) => ({
        account: result.account,
        highlights: result.highlights
      }))
    }

    return sortedData.map((account) => ({ account, highlights: undefined }))
  }, [inSearchMode, searchResults, sortedData])

  const hasAccounts = displayData.length > 0

  if (!hasAccounts) {
    return (
      <EmptyState
        icon={<InboxIcon className="h-12 w-12" />}
        title={t("account:emptyState")}
        action={{
          label: t("account:addFirstAccount"),
          onClick: openAddAccount,
          variant: "default",
          icon: <PlusIcon className="h-4 w-4" />
        }}
      />
    )
  }

  const renderSortButton = (field: SortField, label: string) => (
    <IconButton
      onClick={() => handleSort(field)}
      variant="ghost"
      size="none"
      disabled={inSearchMode}
      aria-label={`${t("account:list.sort")} ${label}`}
      className="space-x-0.5 text-[10px] font-medium sm:space-x-1 sm:text-xs">
      <span>{label}</span>
      {sortField === field &&
        (sortOrder === "asc" ? (
          <ChevronUpIcon className="h-2.5 w-2.5 sm:h-3 sm:w-3" />
        ) : (
          <ChevronDownIcon className="h-2.5 w-2.5 sm:h-3 sm:w-3" />
        ))}
    </IconButton>
  )

  return (
    <Card padding="none" className="flex flex-col overflow-hidden">
      <CardContent padding={"none"} spacing={"none"}>
        {/* Search Bar */}
        <div className="dark:border-dark-bg-tertiary dark:bg-dark-bg-primary border-b border-gray-200 bg-white px-3 py-2 sm:px-5 sm:py-3">
          <AccountSearchInput
            value={query}
            onChange={setQuery}
            onClear={clearSearch}
          />
        </div>

        {/* Header */}
        {
          <div className="dark:border-dark-bg-tertiary dark:bg-dark-bg-secondary sticky top-0 z-10 border-b border-gray-200 bg-gray-50 px-3 py-2 sm:px-5">
            <div className="flex items-center justify-between gap-2 sm:gap-4">
              {/* Account Name Column */}
              <div className="flex min-w-0 flex-1 gap-2">
                {renderSortButton("name", t("account:list.header.account"))}
                <span className="text-[10px] font-medium sm:text-xs">
                  {t("common:total") + ": " + displayedResults.length}
                </span>
              </div>

              {/* Balance & Consumption Column */}
              <div className="flex shrink-0 items-end gap-0.5">
                <div className="flex items-center">
                  {renderSortButton(
                    DATA_TYPE_BALANCE,
                    t("account:list.header.balance")
                  )}
                </div>
                <div className="dark:text-dark-text-tertiary text-[10px] text-gray-400 sm:text-xs">
                  /
                </div>
                <div className="dark:text-dark-text-tertiary flex items-center text-[9px] text-gray-400 sm:text-[10px]">
                  {renderSortButton(
                    DATA_TYPE_CONSUMPTION,
                    t("account:list.header.todayConsumption")
                  )}
                </div>
              </div>
            </div>
          </div>
        }

        {/* Account List or No Results */}
        {inSearchMode && displayedResults.length === 0 ? (
          <EmptyState
            icon={<InboxIcon className="h-12 w-12" />}
            title={t("account:search.noResults")}
          />
        ) : (
          <CardList>
            {displayedResults.map((item) => (
              <AccountListItem
                key={item.account.id}
                site={item.account}
                highlights={item.highlights}
                onDeleteWithDialog={handleDeleteWithDialog}
                onCopyKey={handleCopyKeyWithDialog}
              />
            ))}
          </CardList>
        )}
      </CardContent>

      {/* Dialogs */}
      <DelAccountDialog
        isOpen={deleteDialogAccount !== null}
        onClose={() => setDeleteDialogAccount(null)}
        account={deleteDialogAccount}
        onDeleted={() => {
          handleDeleteAccount(deleteDialogAccount!)
          setDeleteDialogAccount(null)
        }}
      />

      <CopyKeyDialog
        isOpen={copyKeyDialogAccount !== null}
        onClose={() => setCopyKeyDialogAccount(null)}
        account={copyKeyDialogAccount as DisplaySiteData}
      />
    </Card>
  )
}
