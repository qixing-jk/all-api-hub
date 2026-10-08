import { ChevronDown, Inbox, Info, Plus, SlidersHorizontal } from "lucide-react"
import { useTranslation } from "react-i18next"

import {
  Button,
  Card,
  CardContent,
  CardList,
  Checkbox,
  CompactTagFilter,
  ConfirmDialog,
  EmptyState,
} from "~/components/ui"
import { DATA_TYPE_CREATED_AT } from "~/constants"
import { NewcomerSponsorRecommendationsSection } from "~/features/AccountManagement/components/NewcomerSponsorRecommendationsSection"
import {
  ACCOUNT_MANAGEMENT_TEST_IDS,
  getAccountManagementSelectionCheckboxTestId,
} from "~/features/AccountManagement/testIds"
import { cn } from "~/lib/utils"
import { formatMoneyFixed } from "~/utils/core/money"

import CopyKeyDialog from "../CopyKeyDialog"
import DelAccountDialog from "../DelAccountDialog"
import { InviteLinkManualCopyDialog } from "../InviteLinkManualCopyDialog"
import { AccountBulkToolbar } from "./AccountBulkToolbar"
import AccountFilterBar from "./AccountFilterBar"
import { NonSortableAccountListItem } from "./AccountListBaseItem"
import { ACCOUNT_LIST_ALL_FILTER_VALUE } from "./accountListFilters"
import { AccountListHeader } from "./AccountListHeader"
import { AccountListInitialLoadingState } from "./AccountListLoadingState"
import { type AccountListDisplayItem } from "./accountListOrdering"
import AccountSearchInput from "./AccountSearchInput"
import { FilteredTodayMetric } from "./FilteredTodayMetric"
import { useAccountListViewModel } from "./useAccountListViewModel"
import { VirtualizedAccountList } from "./VirtualizedAccountList"

interface AccountListProps {
  initialSearchQuery?: string
  onAddAccount?: () => void
  reorderUnavailableReason?: string
  showAddAccountAction?: boolean
  virtualScrollParent?: HTMLElement | null
}

/**
 * Master list view for user accounts, including search, tagging, sorting, filtering, and manual reordering controls.
 */
export default function AccountList({
  initialSearchQuery,
  onAddAccount,
  reorderUnavailableReason,
  showAddAccountAction = true,
  virtualScrollParent,
}: AccountListProps) {
  const { t } = useTranslation(["account", "common"])
  const model = useAccountListViewModel({
    initialSearchQuery,
    onAddAccount,
    reorderUnavailableReason,
  })

  if (model.status.isInitialLoad) {
    return <AccountListInitialLoadingState />
  }

  if (!model.status.hasAccounts) {
    return (
      <Card
        aria-label={t("account:emptyState")}
        className="mb-density-2"
        data-testid={ACCOUNT_MANAGEMENT_TEST_IDS.accountListView}
        padding="md"
        role="region"
      >
        <div className="gap-y-density-4 flex flex-col gap-x-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="gap-y-density-3 flex items-start gap-x-3">
            <div className="bg-primary-soft text-primary-soft-foreground py-density-2 shrink-0 rounded-md px-2">
              <Inbox className="h-5 w-5" />
            </div>
            <div className="space-y-density-1">
              <h2 className="text-foreground text-sm font-medium">
                {t("account:emptyState")}
              </h2>
              <p className="dark:text-secondary-foreground text-muted-foreground max-w-2xl text-sm leading-6">
                {t("account:emptyStateDescription")}
              </p>
            </div>
          </div>
          {showAddAccountAction && (
            <Button
              className="w-full shrink-0 sm:w-auto"
              data-testid={ACCOUNT_MANAGEMENT_TEST_IDS.addAccountButton}
              leftIcon={<Plus className="h-4 w-4" />}
              onClick={model.handleEmptyStateAddAccountClick}
              size="sm"
            >
              {t("account:addFirstAccount")}
            </Button>
          )}
        </div>
        <NewcomerSponsorRecommendationsSection />
      </Card>
    )
  }

  const renderAccountListItem = (item: AccountListDisplayItem) => {
    const result = item.result
    const selectionControl = model.bulk.isBulkMode ? (
      <Checkbox
        data-testid={getAccountManagementSelectionCheckboxTestId(
          result.account.id,
        )}
        checked={model.bulk.selectedIdSet.has(result.account.id)}
        onCheckedChange={(checked) =>
          model.bulk.handleToggleAccountSelection(
            result.account.id,
            Boolean(checked),
          )
        }
        aria-label={t("account:bulk.selectAccount", {
          accountName: result.account.name,
        })}
        disabled={model.bulk.isBulkBusy}
      />
    ) : undefined
    const rowClassName = cn(
      "relative transition-colors hover:bg-surface-subtle/80 focus-within:bg-surface-subtle/80 dark:hover:bg-foreground/[0.035] dark:focus-within:bg-foreground/[0.035]",
      !item.isLastInGroup &&
        "after:absolute after:right-4 after:bottom-0 after:left-4 after:h-px after:bg-muted after:content-[''] dark:after:bg-foreground/[0.06]",
      item.startsNewGroup &&
        "border-t-4 border-border-subtle dark:border-border-subtle/45",
      item.group === "pinned" &&
        "bg-surface-subtle hover:bg-muted/80 dark:bg-secondary/45 dark:hover:bg-secondary/55",
      item.group === "disabled" &&
        "bg-surface-subtle/50 opacity-40 hover:opacity-80 focus-within:opacity-80 dark:bg-overlay/10",
      model.bulk.isBulkMode &&
        model.bulk.selectedIdSet.has(result.account.id) &&
        "bg-primary-soft opacity-100 hover:bg-primary-soft-hover focus-within:bg-primary-soft-hover",
      model.display.detectedAccount?.id === result.account.id &&
        "border-l-4 border-l-primary bg-primary-soft",
    )
    const rowProps = {
      site: result.account,
      showCreatedAt: model.display.sortField === DATA_TYPE_CREATED_AT,
      showContextBoost:
        !model.filters.inSearchMode && !model.reordering.isReorderMode,
      className: rowClassName,
      highlights: result.highlights,
      onDeleteWithDialog: model.dialogs.handleDeleteWithDialog,
      onCopyKey: model.dialogs.handleCopyKeyWithDialog,
      handleLabel: model.display.handleLabel,
      selectionControl,
    }
    if (
      model.reordering.shouldRenderSortableList &&
      model.reordering.dndRuntime !== null
    ) {
      const { SortableAccountListItem } = model.reordering.dndRuntime

      return (
        <SortableAccountListItem
          key={result.account.id}
          {...rowProps}
          isDragDisabled={model.reordering.dragDisabled}
          showHandle
        />
      )
    }

    return (
      <NonSortableAccountListItem
        key={result.account.id}
        {...rowProps}
        isDragDisabled
        showHandle={false}
      />
    )
  }

  const renderUnvirtualizedList = () => (
    <CardList dividers={false} className="space-y-0">
      {model.display.groupedDisplayItems.map(renderAccountListItem)}
    </CardList>
  )
  const DndWrapper = model.reordering.dndRuntime?.AccountListDndWrapper

  return (
    <Card
      padding="none"
      className="border-border/80 [container-type:inline-size] flex flex-col overflow-hidden rounded-lg border shadow-none"
      data-testid={ACCOUNT_MANAGEMENT_TEST_IDS.accountListView}
    >
      <CardContent padding={"none"} spacing={"none"}>
        {/* Search + Filters */}
        <div className="dark:border-border dark:bg-background bg-card py-density-3 sm:py-density-4 px-3 sm:px-4">
          <div className="gap-y-density-3 flex flex-col gap-x-3">
            <div className="gap-y-density-2 grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-x-2 [@container(min-width:40rem)]:grid-cols-1 [@container(min-width:68rem)]:grid-cols-[minmax(15rem,1fr)_minmax(0,2fr)]">
              <div className="min-w-0">
                <AccountSearchInput
                  disabled={model.reordering.isReorderMode}
                  value={model.filters.query}
                  onChange={model.filters.setQuery}
                  onClear={model.filters.clearSearch}
                />
              </div>

              <Button
                type="button"
                variant="outline"
                size="sm"
                className="gap-y-density-1-5 min-h-(--density-control-lg) shrink-0 gap-x-1.5 px-2.5 text-xs shadow-none [@container(min-width:40rem)]:hidden"
                aria-expanded={model.filters.filtersOpen}
                aria-controls={model.filters.filterPanelId}
                onClick={model.filters.togglePanel}
              >
                <SlidersHorizontal aria-hidden="true" className="size-3.5" />
                {t("account:filter.toggle")}
                {model.filters.activeStatusFilterCount > 0 && (
                  <span className="bg-primary-soft text-primary-soft-foreground rounded px-1">
                    {model.filters.activeStatusFilterCount}
                  </span>
                )}
                <ChevronDown
                  aria-hidden="true"
                  className={cn(
                    "size-3",
                    model.filters.filtersOpen && "rotate-180",
                  )}
                />
              </Button>
              <div
                id={model.filters.filterPanelId}
                className={cn(
                  "col-span-full min-w-0 [@container(min-width:40rem)]:block [@container(min-width:68rem)]:col-span-1",
                  !model.filters.filtersOpen && "hidden",
                )}
              >
                <AccountFilterBar
                  disabledValue={
                    model.filters.disabledFilter ??
                    ACCOUNT_LIST_ALL_FILTER_VALUE
                  }
                  siteTypeValue={
                    model.filters.siteTypeFilter ??
                    ACCOUNT_LIST_ALL_FILTER_VALUE
                  }
                  refreshValue={
                    model.filters.refreshStatusFilter ??
                    ACCOUNT_LIST_ALL_FILTER_VALUE
                  }
                  checkInValue={
                    model.filters.checkInFilter ?? ACCOUNT_LIST_ALL_FILTER_VALUE
                  }
                  disabledOptions={model.filters.disabledFilterOptions}
                  siteTypeOptions={model.filters.siteTypeFilterOptions}
                  refreshOptions={model.filters.refreshFilterOptions}
                  checkInOptions={model.filters.checkInFilterOptions}
                  onDisabledChange={model.filters.onDisabledChange}
                  onSiteTypeChange={model.filters.onSiteTypeChange}
                  onRefreshChange={model.filters.onRefreshChange}
                  onCheckInChange={model.filters.onCheckInChange}
                />
              </div>
            </div>
            {model.filters.tagFilterOptions.length > 0 && (
              <CompactTagFilter
                options={model.filters.tagFilterOptions}
                value={model.filters.selectedTagIds}
                onChange={model.filters.setSelectedTagIds}
                allLabel={t("account:filter.tagsAllLabel")}
              />
            )}
            {model.totals.showFilteredSummary && (
              <div className="text-muted-foreground dark:text-secondary-foreground gap-y-density-3 flex flex-wrap items-center gap-x-3 text-xs">
                <span>
                  {t("account:filter.summary", {
                    count: model.display.filteredSiteCount,
                  })}
                </span>
                <div className="gap-y-density-3 flex flex-wrap gap-x-3">
                  <span>
                    {t("account:filteredTotals.balance")}: USD{" "}
                    {formatMoneyFixed(model.totals.filteredBalance.USD)} / CNY{" "}
                    {formatMoneyFixed(model.totals.filteredBalance.CNY)}
                  </span>
                  {model.display.showTodayCashflow && (
                    <>
                      <span>
                        {t("account:filteredTotals.consumption")}:{" "}
                        <FilteredTodayMetric
                          total={model.totals.filteredConsumption}
                          t={t}
                        />
                      </span>
                      <span>
                        {t("account:filteredTotals.income")}:{" "}
                        <FilteredTodayMetric
                          total={model.totals.filteredIncome}
                          t={t}
                        />
                      </span>
                    </>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>

        <AccountListHeader
          displayedResultCount={model.display.displayedResultCount}
          inSearchMode={model.filters.inSearchMode}
          isBulkBusy={model.bulk.isBulkBusy}
          isBulkMode={model.bulk.isBulkMode}
          isReorderLoading={model.reordering.isReorderLoading}
          isReorderMode={model.reordering.isReorderMode}
          onBulkModeEnter={model.bulk.handleBulkModeEnter}
          onClearSort={model.reordering.clearSortConfig}
          onReorderModeEnter={model.reordering.handleReorderModeEnter}
          onReorderModeExit={model.reordering.handleReorderModeExit}
          onSort={model.reordering.handleListSort}
          reorderDisabledReason={model.reordering.resolvedReorderDisabledReason}
          showTodayCashflow={model.display.showTodayCashflow}
          sortField={model.display.sortField}
          sortOrder={model.display.sortOrder}
        />

        {model.bulk.isBulkMode && (
          <AccountBulkToolbar
            selectedAccounts={model.bulk.selectedAccounts}
            visibleAccountIds={model.bulk.visibleAccountIdSet}
            isBusy={model.bulk.isBulkBusy}
            isDisabling={model.bulk.isBulkDisabling}
            isCopying={model.bulk.isBulkCopyingInviteLinks}
            onSelectVisible={model.bulk.handleSelectVisibleAccounts}
            onClearVisible={model.bulk.handleClearVisibleSelection}
            onClearAll={model.bulk.handleClearAllSelection}
            onDeselect={(id) =>
              model.bulk.handleToggleAccountSelection(id, false)
            }
            onDisable={() => void model.bulk.handleBulkDisable()}
            onCopy={() => void model.bulk.handleBulkCopyInviteLinks()}
            onCopySiteUrls={() => void model.bulk.handleBulkCopySiteUrls()}
            onDelete={() => model.bulk.setIsBulkDeleteConfirmOpen(true)}
            onExit={model.bulk.handleBulkModeExit}
          />
        )}

        {model.reordering.showGroupReorderHint ? (
          <div
            className="border-primary-soft-border bg-primary-soft text-primary-soft-foreground gap-y-density-2 py-density-1-5 flex items-center gap-x-2 border-b px-3 text-xs leading-5"
            role="note"
          >
            <Info
              aria-hidden="true"
              className="text-theme-600 dark:text-theme-400 size-3.5 shrink-0"
            />
            <span>{t("account:list.reorderGroupHint")}</span>
          </div>
        ) : null}

        {/* Account List or No Results */}
        {model.totals.showFilteredSummary &&
        model.display.displayedResultCount === 0 ? (
          <EmptyState
            icon={<Inbox className="h-12 w-12" />}
            title={t("account:search.noResults")}
          />
        ) : model.reordering.shouldRenderSortableList && DndWrapper ? (
          <DndWrapper
            sortedIds={model.display.sortedIds}
            onDragEnd={(event) =>
              model.reordering.onDragEnd(
                event,
                model.display.groupedDisplayItems,
              )
            }
          >
            {renderUnvirtualizedList()}
          </DndWrapper>
        ) : model.reordering.isReorderMode ? (
          renderUnvirtualizedList()
        ) : (
          <VirtualizedAccountList
            getItemKey={(item) => item.result.account.id}
            items={model.display.groupedDisplayItems}
            renderItem={renderAccountListItem}
            scrollParent={virtualScrollParent}
          />
        )}
      </CardContent>

      {/* Dialogs */}
      <DelAccountDialog
        isOpen={model.dialogs.deleteDialogAccount !== null}
        onClose={() => model.dialogs.setDeleteDialogAccount(null)}
        account={model.dialogs.deleteDialogAccount}
        onDeleted={() => {
          model.dialogs.handleDeleteAccount(model.dialogs.deleteDialogAccount!)
          model.dialogs.setDeleteDialogAccount(null)
        }}
      />

      <CopyKeyDialog
        isOpen={model.dialogs.copyKeyDialogAccount !== null}
        onClose={() => model.dialogs.setCopyKeyDialogAccount(null)}
        account={model.dialogs.copyKeyDialogAccount}
      />

      <InviteLinkManualCopyDialog
        payload={model.bulk.manualInviteLinkPayload}
        onClose={() => model.bulk.setManualInviteLinkPayload(null)}
      />

      <ConfirmDialog
        intent="destructive"
        isOpen={model.bulk.isBulkDeleteConfirmOpen}
        onClose={() => {
          if (!model.bulk.isBulkDeleting) {
            model.bulk.setIsBulkDeleteConfirmOpen(false)
          }
        }}
        title={t("account:bulk.deleteConfirmTitle")}
        warningTitle={t("account:bulk.deleteConfirmWarningTitle")}
        description={t("account:bulk.deleteConfirmDescription", {
          count: model.bulk.selectedAccountIds.length,
        })}
        cancelLabel={t("common:actions.cancel")}
        confirmLabel={t("account:bulk.deleteConfirmAction")}
        workingLabel={t("account:bulk.deleting", {
          count: model.bulk.selectedAccountIds.length,
        })}
        onConfirm={() => {
          void model.bulk.handleBulkDelete()
        }}
        isWorking={model.bulk.isBulkDeleting}
        size="md"
        details={
          <div className="space-y-density-3 text-sm">
            <div className="text-foreground font-medium">
              {t("account:bulk.deletePreviewTitle")}
            </div>
            <div className="text-muted-foreground dark:text-secondary-foreground space-y-density-1">
              {model.bulk.bulkDeletePreviewAccounts.map((account) => (
                <div key={account.id}>{account.name}</div>
              ))}
            </div>
            {model.bulk.selectedAccountIds.length >
            model.bulk.bulkDeletePreviewAccounts.length ? (
              <div className="text-muted-foreground text-xs">
                {t("account:bulk.deletePreviewRemainder", {
                  count:
                    model.bulk.selectedAccountIds.length -
                    model.bulk.bulkDeletePreviewAccounts.length,
                })}
              </div>
            ) : null}
            {model.bulk.hiddenSelectedCount > 0 ? (
              <div className="text-warning-text text-xs">
                {t("account:bulk.deleteHiddenSelectedHint", {
                  count: model.bulk.hiddenSelectedCount,
                })}
              </div>
            ) : null}
          </div>
        }
      />
    </Card>
  )
}
