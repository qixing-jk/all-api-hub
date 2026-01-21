import {
  closestCenter,
  DndContext,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core"
import {
  arrayMove,
  SortableContext,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable"
import {
  ChevronDownIcon,
  ChevronUpIcon,
  InboxIcon,
  PlusIcon,
} from "@heroicons/react/24/outline"
import { useMemo, useState } from "react"
import { useTranslation } from "react-i18next"

import {
  Card,
  CardContent,
  CardList,
  EmptyState,
  IconButton,
  TagFilter,
} from "~/components/ui"
import { DATA_TYPE_BALANCE, DATA_TYPE_CONSUMPTION } from "~/constants"
import { useAccountActionsContext } from "~/features/AccountManagement/hooks/AccountActionsContext"
import { useAccountDataContext } from "~/features/AccountManagement/hooks/AccountDataContext"
import {
  useAccountSearch,
  type SearchResultWithHighlight,
} from "~/features/AccountManagement/hooks/useAccountSearch"
import { useAddAccountHandler } from "~/hooks/useAddAccountHandler"
import { useIsDesktop, useIsSmallScreen } from "~/hooks/useMediaQuery"
import { cn } from "~/lib/utils"
import type { DisplaySiteData, SortField } from "~/types"
import {
  calculateTotalBalanceForSites,
  calculateTotalConsumptionForSites,
} from "~/utils/formatters"
import { formatMoneyFixed } from "~/utils/money"

import CopyKeyDialog from "../CopyKeyDialog"
import DelAccountDialog from "../DelAccountDialog"
import { NewcomerSupportCard } from "../NewcomerSupportCard"
import AccountSearchInput from "./AccountSearchInput"
import SortableAccountListItem from "./SortableAccountListItem"

interface AccountListProps {
  initialSearchQuery?: string
}

/**
 * Master list view for user accounts, including search, tagging, sorting, filtering, and manual reordering controls.
 */
export default function AccountList({ initialSearchQuery }: AccountListProps) {
  const { t } = useTranslation(["account", "common"])
  const isSmallScreen = useIsSmallScreen()
  const isDesktop = useIsDesktop()
  const {
    sortedData,
    displayData,
    handleSort,
    sortField,
    sortOrder,
    handleReorder,
    tags,
    tagCountsById,
    isManualSortFeatureEnabled,
  } = useAccountDataContext()
  const { handleAddAccountClick } = useAddAccountHandler()
  const { handleDeleteAccount } = useAccountActionsContext()
  const { detectedAccount } = useAccountDataContext()

  const [deleteDialogAccount, setDeleteDialogAccount] =
    useState<DisplaySiteData | null>(null)
  const [copyKeyDialogAccount, setCopyKeyDialogAccount] =
    useState<DisplaySiteData | null>(null)
  const [selectedTagIds, setSelectedTagIds] = useState<string[]>([])

  const { query, setQuery, clearSearch, searchResults, inSearchMode } =
    useAccountSearch(displayData, initialSearchQuery)
  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor),
  )

  const handleDeleteWithDialog = (site: DisplaySiteData) => {
    setDeleteDialogAccount(site)
  }

  const handleCopyKeyWithDialog = (site: DisplaySiteData) => {
    setCopyKeyDialogAccount(site)
  }

  const tagFilterOptions = useMemo(() => {
    if (tags.length === 0) {
      return []
    }

    return tags.map((tag) => ({
      value: tag.id,
      label: tag.name,
      count: tagCountsById[tag.id] ?? 0,
    }))
  }, [tags, tagCountsById])

  const baseResults = useMemo<
    Array<{
      account: DisplaySiteData
      highlights?: SearchResultWithHighlight["highlights"]
    }>
  >(() => {
    if (inSearchMode) {
      return searchResults.map((result) => ({
        account: result.account,
        highlights: result.highlights,
      }))
    }

    return sortedData.map((account) => ({ account, highlights: undefined }))
  }, [inSearchMode, searchResults, sortedData])

  const displayedResults = useMemo(() => {
    if (selectedTagIds.length === 0) {
      return baseResults
    }
    return baseResults.filter(({ account }) => {
      const ids = account.tagIds || []
      return selectedTagIds.some((tagId) => ids.includes(tagId))
    })
  }, [baseResults, selectedTagIds])

  const filteredSites = useMemo(
    () => displayedResults.map((item) => item.account),
    [displayedResults],
  )

  const filteredBalance = useMemo(
    () => calculateTotalBalanceForSites(filteredSites),
    [filteredSites],
  )

  const filteredConsumption = useMemo(
    () => calculateTotalConsumptionForSites(filteredSites),
    [filteredSites],
  )

  const hasAccounts = displayData.length > 0
  const showFilteredSummary = inSearchMode || selectedTagIds.length > 0
  const dragDisabled = inSearchMode || !isManualSortFeatureEnabled
  const handleLabel = t("account:list.dragHandle")

  const sortedIds = useMemo(
    () => baseResults.map((item) => item.account.id),
    [baseResults],
  )

  const onDragEnd = (event: DragEndEvent) => {
    if (dragDisabled) return
    const { active, over } = event
    if (!over || active.id === over.id) return

    const oldIndex = sortedIds.indexOf(active.id as string)
    const newIndex = sortedIds.indexOf(over.id as string)
    if (oldIndex === -1 || newIndex === -1) return

    const newOrder = arrayMove(sortedIds, oldIndex, newIndex)
    void handleReorder(newOrder)
  }

  const maxTagFilterLines = isSmallScreen ? 2 : isDesktop ? 3 : 2

  if (!hasAccounts) {
    return (
      <div className="space-y-2">
        <NewcomerSupportCard />
        <EmptyState
          icon={<InboxIcon className="h-12 w-12" />}
          title={t("account:emptyState")}
          action={{
            label: t("account:addFirstAccount"),
            onClick: handleAddAccountClick,
            variant: "default",
            icon: <PlusIcon className="h-4 w-4" />,
          }}
        />
      </div>
    )
  }

  const renderSortButton = (field: SortField, label: string) => (
    <IconButton
      onClick={() => handleSort(field)}
      variant="ghost"
      size="none"
      disabled={inSearchMode}
      aria-label={`${t("account:list.sort")} ${label}`}
      className="space-x-0.5 text-[10px] font-medium sm:space-x-1 sm:text-xs"
    >
      <span>{label}</span>
      {sortField === field &&
        (sortOrder === "asc" ? (
          <ChevronUpIcon className="h-2.5 w-2.5 sm:h-3 sm:w-3" />
        ) : (
          <ChevronDownIcon className="h-2.5 w-2.5 sm:h-3 sm:w-3" />
        ))}
    </IconButton>
  )

  const listContent = (
    <CardList>
      {displayedResults.map((item) => (
        <SortableAccountListItem
          key={item.account.id}
          site={item.account}
          className={cn(
            detectedAccount?.id === item.account.id &&
              "rounded-lg border-l-4 border-l-blue-500 bg-blue-50 dark:border-l-blue-400 dark:bg-blue-900/50",
          )}
          highlights={item.highlights}
          onDeleteWithDialog={handleDeleteWithDialog}
          onCopyKey={handleCopyKeyWithDialog}
          isDragDisabled={dragDisabled}
          handleLabel={handleLabel}
          showHandle={isManualSortFeatureEnabled}
        />
      ))}
    </CardList>
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

        {/* Tag Filter */}
        <div className="dark:border-dark-bg-tertiary border-b border-gray-200 px-3 py-2 sm:px-5">
          <div className="flex flex-col gap-2">
            <TagFilter
              options={tagFilterOptions}
              value={selectedTagIds}
              onChange={setSelectedTagIds}
              maxVisibleLines={maxTagFilterLines}
              allLabel={t("account:filter.tagsAllLabel")}
              allCount={displayData.length}
            />
            {showFilteredSummary && (
              <div className="flex flex-wrap items-center gap-3 text-xs text-gray-600 dark:text-gray-300">
                <span>
                  {t("account:filter.summary", {
                    count: filteredSites.length,
                  })}
                </span>
                <div className="flex flex-wrap gap-3">
                  <span>
                    {t("account:filteredTotals.balance")}: USD{" "}
                    {formatMoneyFixed(filteredBalance.USD)} / CNY{" "}
                    {formatMoneyFixed(filteredBalance.CNY)}
                  </span>
                  <span>
                    {t("account:filteredTotals.consumption")}: USD{" "}
                    {formatMoneyFixed(filteredConsumption.USD)} / CNY{" "}
                    {formatMoneyFixed(filteredConsumption.CNY)}
                  </span>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Header */}
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
                  t("account:list.header.balance"),
                )}
              </div>
              <div className="dark:text-dark-text-tertiary text-[10px] text-gray-400 sm:text-xs">
                /
              </div>
              <div className="dark:text-dark-text-tertiary flex items-center text-[9px] text-gray-400 sm:text-[10px]">
                {renderSortButton(
                  DATA_TYPE_CONSUMPTION,
                  t("account:list.header.todayConsumption"),
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Account List or No Results */}
        {showFilteredSummary && displayedResults.length === 0 ? (
          <EmptyState
            icon={<InboxIcon className="h-12 w-12" />}
            title={t("account:search.noResults")}
          />
        ) : isManualSortFeatureEnabled ? (
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={onDragEnd}
          >
            <SortableContext
              items={sortedIds}
              strategy={verticalListSortingStrategy}
            >
              {listContent}
            </SortableContext>
          </DndContext>
        ) : (
          listContent
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
        account={copyKeyDialogAccount}
      />
    </Card>
  )
}
