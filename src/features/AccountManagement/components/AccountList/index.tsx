import { ChevronDown, Inbox, Info, Plus, SlidersHorizontal } from "lucide-react"
import { useId, useMemo, useState } from "react"
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
import { ACCOUNT_SITE_TITLE_RULES } from "~/constants/siteType"
import { useUserPreferencesContext } from "~/contexts/UserPreferencesContext"
import { NewcomerSponsorRecommendationsSection } from "~/features/AccountManagement/components/NewcomerSponsorRecommendationsSection"
import { useAccountActionsContext } from "~/features/AccountManagement/hooks/AccountActionsContext"
import { useAccountDataContext } from "~/features/AccountManagement/hooks/AccountDataContext"
import { useAccountSearch } from "~/features/AccountManagement/hooks/useAccountSearch"
import {
  ACCOUNT_MANAGEMENT_TEST_IDS,
  getAccountManagementSelectionCheckboxTestId,
} from "~/features/AccountManagement/testIds"
import { useAddAccountHandler } from "~/hooks/useAddAccountHandler"
import { cn } from "~/lib/utils"
import { getAccountSortGroup } from "~/services/preferences/utils/sortingPriority"
import { trackProductAnalyticsActionStarted } from "~/services/productAnalytics/actions"
import {
  PRODUCT_ANALYTICS_ACTION_IDS,
  PRODUCT_ANALYTICS_ENTRYPOINTS,
  PRODUCT_ANALYTICS_FEATURE_IDS,
  PRODUCT_ANALYTICS_SURFACE_IDS,
} from "~/services/productAnalytics/contracts"
import type { DisplaySiteData } from "~/types"
import {
  calculateTotalBalanceForSites,
  calculateTotalConsumption,
  calculateTotalIncomeForSites,
} from "~/utils/core/formatters"
import { formatMoneyFixed } from "~/utils/core/money"
import { getHealthStatusDisplay } from "~/utils/healthStatus"

import CopyKeyDialog from "../CopyKeyDialog"
import DelAccountDialog from "../DelAccountDialog"
import { InviteLinkManualCopyDialog } from "../InviteLinkManualCopyDialog"
import { AccountBulkToolbar } from "./AccountBulkToolbar"
import AccountFilterBar from "./AccountFilterBar"
import { NonSortableAccountListItem } from "./AccountListBaseItem"
import {
  ACCOUNT_REFRESH_FILTER_OPTION_ORDER,
  aggregateAccountListFilters,
  isAccountRefreshFilterValue,
  type AccountDisabledFilterValue,
  type AccountListFilterState,
  type AccountRefreshFilterValue,
} from "./accountListFilters"
import { AccountListHeader } from "./AccountListHeader"
import { AccountListInitialLoadingState } from "./AccountListLoadingState"
import {
  groupAccountListResults,
  type AccountListDisplayItem,
  type AccountListResultItem,
} from "./accountListOrdering"
import AccountSearchInput from "./AccountSearchInput"
import {
  ACCOUNT_CHECK_IN_FILTER_OPTION_ORDER,
  type AccountCheckInFilterValue,
} from "./checkInFilter"
import { FilteredTodayMetric } from "./FilteredTodayMetric"
import { useAccountListBulkActions } from "./useAccountListBulkActions"
import { useAccountListReordering } from "./useAccountListReordering"
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
  const { showTodayCashflow } = useUserPreferencesContext()
  const {
    displayData,
    isInitialLoad,
    clearSortConfig,
    sortField,
    sortOrder,
    tags,
    tagCountsById,
    detectedAccount,
    getAccountContextBoost,
  } = useAccountDataContext()
  const { handleAddAccountClick } = useAddAccountHandler()
  const { handleDeleteAccount } = useAccountActionsContext()
  const [deleteDialogAccount, setDeleteDialogAccount] =
    useState<DisplaySiteData | null>(null)
  const [copyKeyDialogAccount, setCopyKeyDialogAccount] =
    useState<DisplaySiteData | null>(null)
  const [isBulkMode, setIsBulkMode] = useState(false)
  const [filtersOpen, setFiltersOpen] = useState(false)
  const filterPanelId = useId()
  const [selectedTagIds, setSelectedTagIds] = useState<string[]>([])
  const [siteTypeFilter, setSiteTypeFilter] = useState<string | null>(null)
  const [refreshStatusFilter, setRefreshStatusFilter] =
    useState<AccountRefreshFilterValue | null>(null)
  const [checkInFilter, setCheckInFilter] =
    useState<AccountCheckInFilterValue | null>(null)
  const [disabledFilter, setDisabledFilter] =
    useState<AccountDisabledFilterValue | null>(null)

  const { query, setQuery, clearSearch, searchResults, inSearchMode } =
    useAccountSearch(displayData, initialSearchQuery)

  const {
    accountsInDisplayOrder,
    pinnedAccountIdSet,
    isReorderMode,
    isReorderSaving,
    dndLoadState,
    dndRuntime,
    dragDisabled,
    shouldRenderSortableList,
    resolvedReorderDisabledReason,
    onDragEnd,
    handleReorderModeEnter,
    handleReorderModeExit,
    handleListSort,
    resetReorderMode,
  } = useAccountListReordering({
    inSearchMode,
    isBulkMode,
    reorderUnavailableReason,
  })

  const handleDeleteWithDialog = (site: DisplaySiteData) => {
    setDeleteDialogAccount(site)
  }

  const handleCopyKeyWithDialog = (site: DisplaySiteData) => {
    setCopyKeyDialogAccount(site)
  }

  const baseResults = useMemo<AccountListResultItem[]>(() => {
    if (inSearchMode) {
      return searchResults.map((result) => ({
        account: result.account,
        highlights: result.highlights,
      }))
    }

    return accountsInDisplayOrder.map((account) => ({
      account,
      highlights: undefined,
    }))
  }, [accountsInDisplayOrder, inSearchMode, searchResults])

  const filterState = useMemo<AccountListFilterState>(
    () => ({
      disabledFilter,
      siteTypeFilter,
      refreshStatusFilter,
      checkInFilter,
      selectedTagIds,
    }),
    [
      checkInFilter,
      disabledFilter,
      refreshStatusFilter,
      siteTypeFilter,
      selectedTagIds,
    ],
  )

  const filterAggregation = useMemo(
    () => aggregateAccountListFilters(baseResults, filterState),
    [baseResults, filterState],
  )
  const displayedResults = filterAggregation.displayedResults
  const groupedDisplayItems = useMemo(
    () =>
      groupAccountListResults(
        displayedResults,
        pinnedAccountIdSet,
        inSearchMode || isReorderMode ? undefined : getAccountContextBoost,
      ),
    [
      displayedResults,
      pinnedAccountIdSet,
      getAccountContextBoost,
      inSearchMode,
      isReorderMode,
    ],
  )

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

  const siteTypeFilterOptions = useMemo(() => {
    const availableSiteTypes = Array.from(
      new Set(displayData.map((account) => account.siteType)),
    )
    const knownSiteTypes = ACCOUNT_SITE_TITLE_RULES.map(
      (rule) => rule.name,
    ).filter((siteType) => availableSiteTypes.includes(siteType))
    const extraSiteTypes = availableSiteTypes
      .filter((siteType) => !knownSiteTypes.includes(siteType))
      .sort((a, b) => a.localeCompare(b))

    return [
      {
        value: "all",
        label: t("filter.siteType.all"),
        count: Array.from(filterAggregation.siteTypeCounts.values()).reduce(
          (sum, count) => sum + count,
          0,
        ),
      },
      ...[...knownSiteTypes, ...extraSiteTypes].map((siteType) => ({
        value: siteType,
        label: siteType,
        count: filterAggregation.siteTypeCounts.get(siteType) ?? 0,
      })),
    ]
  }, [displayData, filterAggregation.siteTypeCounts, t])

  const refreshFilterOptions = useMemo(() => {
    return [
      {
        value: "all",
        label: t("filter.refresh.all"),
        count: Array.from(filterAggregation.refreshCounts.values()).reduce(
          (sum, count) => sum + count,
          0,
        ),
      },
      ...ACCOUNT_REFRESH_FILTER_OPTION_ORDER.map((refreshStatus) => ({
        value: refreshStatus,
        label:
          refreshStatus === "never-synced"
            ? t("account:filter.refresh.neverSynced")
            : getHealthStatusDisplay(refreshStatus, t).text,
        count: filterAggregation.refreshCounts.get(refreshStatus) ?? 0,
      })),
    ]
  }, [filterAggregation.refreshCounts, t])

  const checkInFilterOptions = useMemo(() => {
    const getCheckInFilterLabel = (
      checkInStatus: AccountCheckInFilterValue,
    ) => {
      switch (checkInStatus) {
        case "checked-in":
          return t("filter.checkIn.checked-in")
        case "not-checked-in":
          return t("filter.checkIn.not-checked-in")
        case "outdated":
          return t("filter.checkIn.outdated")
        case "status-unavailable":
          return t("filter.checkIn.status-unavailable")
        case "unsupported":
        default:
          return t("filter.checkIn.unsupported")
      }
    }

    return [
      {
        value: "all",
        label: t("filter.checkIn.all"),
        count: Array.from(filterAggregation.checkInCounts.values()).reduce(
          (sum, count) => sum + count,
          0,
        ),
      },
      ...ACCOUNT_CHECK_IN_FILTER_OPTION_ORDER.map((checkInStatus) => ({
        value: checkInStatus,
        label: getCheckInFilterLabel(checkInStatus),
        count: filterAggregation.checkInCounts.get(checkInStatus) ?? 0,
      })),
    ]
  }, [filterAggregation.checkInCounts, t])

  const disabledFilterOptions = useMemo(() => {
    return [
      {
        value: "all",
        label: t("filter.disabled.all"),
        count: filterAggregation.disabledCounts.total,
      },
      {
        value: "enabled",
        label: t("common:status.enabled"),
        count: filterAggregation.disabledCounts.enabled,
      },
      {
        value: "disabled",
        label: t("common:status.disabled"),
        count: filterAggregation.disabledCounts.disabled,
      },
    ]
  }, [filterAggregation.disabledCounts, t])

  const filteredSites = useMemo(
    () => displayedResults.map((item) => item.account),
    [displayedResults],
  )
  const {
    selectedAccountIds,
    selectedIdSet,
    selectedAccounts,
    visibleAccountIdSet,
    hiddenSelectedCount,
    bulkDeletePreviewAccounts,
    isBulkBusy,
    isBulkDeleting,
    isBulkDisabling,
    isBulkCopyingInviteLinks,
    manualInviteLinkPayload,
    isBulkDeleteConfirmOpen,
    setManualInviteLinkPayload,
    setIsBulkDeleteConfirmOpen,
    handleBulkModeEnter,
    handleBulkModeExit,
    handleToggleAccountSelection,
    handleSelectVisibleAccounts,
    handleClearVisibleSelection,
    handleClearAllSelection,
    handleBulkDisable,
    handleBulkCopyInviteLinks,
    handleBulkCopySiteUrls,
    handleBulkDelete,
  } = useAccountListBulkActions({
    displayData,
    filteredSites,
    groupedDisplayItems,
    setIsBulkMode,
    onEnterBulkMode: resetReorderMode,
  })

  const filteredBalance = useMemo(
    () => calculateTotalBalanceForSites(filteredSites),
    [filteredSites],
  )

  const filteredConsumption = useMemo(
    () => calculateTotalConsumption(filteredSites),
    [filteredSites],
  )
  const filteredIncome = useMemo(
    () => calculateTotalIncomeForSites(filteredSites),
    [filteredSites],
  )

  const hasAccounts = displayData.length > 0
  const showFilteredSummary =
    inSearchMode ||
    selectedTagIds.length > 0 ||
    checkInFilter !== null ||
    siteTypeFilter !== null ||
    refreshStatusFilter !== null ||
    disabledFilter !== null
  const showGroupReorderHint =
    isReorderMode &&
    new Set(
      filteredSites.map((account) =>
        getAccountSortGroup(account, pinnedAccountIdSet),
      ),
    ).size > 1
  const handleLabel = t("account:list.dragHandle")
  const sortedIds = useMemo(
    () => groupedDisplayItems.map((item) => item.result.account.id),
    [groupedDisplayItems],
  )

  const accountListAnalyticsBaseContext = {
    featureId: PRODUCT_ANALYTICS_FEATURE_IDS.AccountManagement,
    surfaceId: PRODUCT_ANALYTICS_SURFACE_IDS.OptionsAccountManagementPage,
    entrypoint: PRODUCT_ANALYTICS_ENTRYPOINTS.Options,
  }

  const handleEmptyStateAddAccountClick = () => {
    void trackProductAnalyticsActionStarted({
      ...accountListAnalyticsBaseContext,
      actionId: PRODUCT_ANALYTICS_ACTION_IDS.OpenCreateAccountDialog,
    })
    const addAccount = onAddAccount ?? handleAddAccountClick
    addAccount()
  }

  const activeStatusFilterCount = [
    disabledFilter,
    siteTypeFilter,
    refreshStatusFilter,
    checkInFilter,
  ].filter(Boolean).length

  if (isInitialLoad) {
    return <AccountListInitialLoadingState />
  }

  if (!hasAccounts) {
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
              onClick={handleEmptyStateAddAccountClick}
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
    const selectionControl = isBulkMode ? (
      <Checkbox
        data-testid={getAccountManagementSelectionCheckboxTestId(
          result.account.id,
        )}
        checked={selectedIdSet.has(result.account.id)}
        onCheckedChange={(checked) =>
          handleToggleAccountSelection(result.account.id, Boolean(checked))
        }
        aria-label={t("account:bulk.selectAccount", {
          accountName: result.account.name,
        })}
        disabled={isBulkBusy}
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
      isBulkMode &&
        selectedIdSet.has(result.account.id) &&
        "bg-primary-soft opacity-100 hover:bg-primary-soft-hover focus-within:bg-primary-soft-hover",
      detectedAccount?.id === result.account.id &&
        "border-l-4 border-l-primary bg-primary-soft",
    )
    const rowProps = {
      site: result.account,
      showCreatedAt: sortField === DATA_TYPE_CREATED_AT,
      showContextBoost: !inSearchMode && !isReorderMode,
      className: rowClassName,
      highlights: result.highlights,
      onDeleteWithDialog: handleDeleteWithDialog,
      onCopyKey: handleCopyKeyWithDialog,
      handleLabel,
      selectionControl,
    }
    if (shouldRenderSortableList && dndRuntime !== null) {
      const { SortableAccountListItem } = dndRuntime

      return (
        <SortableAccountListItem
          key={result.account.id}
          {...rowProps}
          isDragDisabled={dragDisabled}
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
      {groupedDisplayItems.map(renderAccountListItem)}
    </CardList>
  )
  const DndWrapper = dndRuntime?.AccountListDndWrapper

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
                  disabled={isReorderMode}
                  value={query}
                  onChange={setQuery}
                  onClear={clearSearch}
                />
              </div>

              <Button
                type="button"
                variant="outline"
                size="sm"
                className="gap-y-density-1-5 min-h-(--density-control-lg) shrink-0 gap-x-1.5 px-2.5 text-xs shadow-none [@container(min-width:40rem)]:hidden"
                aria-expanded={filtersOpen}
                aria-controls={filterPanelId}
                onClick={() => setFiltersOpen((previous) => !previous)}
              >
                <SlidersHorizontal aria-hidden="true" className="size-3.5" />
                {t("account:filter.toggle")}
                {activeStatusFilterCount > 0 && (
                  <span className="bg-primary-soft text-primary-soft-foreground rounded px-1">
                    {activeStatusFilterCount}
                  </span>
                )}
                <ChevronDown
                  aria-hidden="true"
                  className={cn("size-3", filtersOpen && "rotate-180")}
                />
              </Button>
              <div
                id={filterPanelId}
                className={cn(
                  "col-span-full min-w-0 [@container(min-width:40rem)]:block [@container(min-width:68rem)]:col-span-1",
                  !filtersOpen && "hidden",
                )}
              >
                <AccountFilterBar
                  disabledValue={disabledFilter ?? "all"}
                  siteTypeValue={siteTypeFilter ?? "all"}
                  refreshValue={refreshStatusFilter ?? "all"}
                  checkInValue={checkInFilter ?? "all"}
                  disabledOptions={disabledFilterOptions}
                  siteTypeOptions={siteTypeFilterOptions}
                  refreshOptions={refreshFilterOptions}
                  checkInOptions={checkInFilterOptions}
                  onDisabledChange={(value) =>
                    setDisabledFilter(
                      value === "enabled" || value === "disabled"
                        ? value
                        : null,
                    )
                  }
                  onSiteTypeChange={(value) =>
                    setSiteTypeFilter(value === "all" ? null : value)
                  }
                  onRefreshChange={(value) =>
                    setRefreshStatusFilter(
                      value === "all"
                        ? null
                        : isAccountRefreshFilterValue(value)
                          ? value
                          : null,
                    )
                  }
                  onCheckInChange={(value) =>
                    setCheckInFilter(
                      value === "all"
                        ? null
                        : (value as AccountCheckInFilterValue),
                    )
                  }
                />
              </div>
            </div>
            {tagFilterOptions.length > 0 && (
              <CompactTagFilter
                options={tagFilterOptions}
                value={selectedTagIds}
                onChange={setSelectedTagIds}
                allLabel={t("account:filter.tagsAllLabel")}
              />
            )}
            {showFilteredSummary && (
              <div className="text-muted-foreground dark:text-secondary-foreground gap-y-density-3 flex flex-wrap items-center gap-x-3 text-xs">
                <span>
                  {t("account:filter.summary", {
                    count: filteredSites.length,
                  })}
                </span>
                <div className="gap-y-density-3 flex flex-wrap gap-x-3">
                  <span>
                    {t("account:filteredTotals.balance")}: USD{" "}
                    {formatMoneyFixed(filteredBalance.USD)} / CNY{" "}
                    {formatMoneyFixed(filteredBalance.CNY)}
                  </span>
                  {showTodayCashflow && (
                    <>
                      <span>
                        {t("account:filteredTotals.consumption")}:{" "}
                        <FilteredTodayMetric
                          total={filteredConsumption}
                          t={t}
                        />
                      </span>
                      <span>
                        {t("account:filteredTotals.income")}:{" "}
                        <FilteredTodayMetric total={filteredIncome} t={t} />
                      </span>
                    </>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>

        <AccountListHeader
          displayedResultCount={displayedResults.length}
          inSearchMode={inSearchMode}
          isBulkBusy={isBulkBusy}
          isBulkMode={isBulkMode}
          isReorderLoading={
            isReorderMode && (dndLoadState === "loading" || isReorderSaving)
          }
          isReorderMode={isReorderMode}
          onBulkModeEnter={handleBulkModeEnter}
          onClearSort={clearSortConfig}
          onReorderModeEnter={handleReorderModeEnter}
          onReorderModeExit={handleReorderModeExit}
          onSort={handleListSort}
          reorderDisabledReason={resolvedReorderDisabledReason}
          showTodayCashflow={showTodayCashflow}
          sortField={sortField}
          sortOrder={sortOrder}
        />

        {isBulkMode && (
          <AccountBulkToolbar
            selectedAccounts={selectedAccounts}
            visibleAccountIds={visibleAccountIdSet}
            isBusy={isBulkBusy}
            isDisabling={isBulkDisabling}
            isCopying={isBulkCopyingInviteLinks}
            onSelectVisible={handleSelectVisibleAccounts}
            onClearVisible={handleClearVisibleSelection}
            onClearAll={handleClearAllSelection}
            onDeselect={(id) => handleToggleAccountSelection(id, false)}
            onDisable={() => void handleBulkDisable()}
            onCopy={() => void handleBulkCopyInviteLinks()}
            onCopySiteUrls={() => void handleBulkCopySiteUrls()}
            onDelete={() => setIsBulkDeleteConfirmOpen(true)}
            onExit={handleBulkModeExit}
          />
        )}

        {showGroupReorderHint ? (
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
        {showFilteredSummary && displayedResults.length === 0 ? (
          <EmptyState
            icon={<Inbox className="h-12 w-12" />}
            title={t("account:search.noResults")}
          />
        ) : shouldRenderSortableList && DndWrapper ? (
          <DndWrapper
            sortedIds={sortedIds}
            onDragEnd={(event) => onDragEnd(event, groupedDisplayItems)}
          >
            {renderUnvirtualizedList()}
          </DndWrapper>
        ) : isReorderMode ? (
          renderUnvirtualizedList()
        ) : (
          <VirtualizedAccountList
            getItemKey={(item) => item.result.account.id}
            items={groupedDisplayItems}
            renderItem={renderAccountListItem}
            scrollParent={virtualScrollParent}
          />
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

      <InviteLinkManualCopyDialog
        payload={manualInviteLinkPayload}
        onClose={() => setManualInviteLinkPayload(null)}
      />

      <ConfirmDialog
        intent="destructive"
        isOpen={isBulkDeleteConfirmOpen}
        onClose={() => {
          if (!isBulkDeleting) {
            setIsBulkDeleteConfirmOpen(false)
          }
        }}
        title={t("account:bulk.deleteConfirmTitle")}
        warningTitle={t("account:bulk.deleteConfirmWarningTitle")}
        description={t("account:bulk.deleteConfirmDescription", {
          count: selectedAccountIds.length,
        })}
        cancelLabel={t("common:actions.cancel")}
        confirmLabel={t("account:bulk.deleteConfirmAction")}
        workingLabel={t("account:bulk.deleting", {
          count: selectedAccountIds.length,
        })}
        onConfirm={() => {
          void handleBulkDelete()
        }}
        isWorking={isBulkDeleting}
        size="md"
        details={
          <div className="space-y-density-3 text-sm">
            <div className="text-foreground font-medium">
              {t("account:bulk.deletePreviewTitle")}
            </div>
            <div className="text-muted-foreground dark:text-secondary-foreground space-y-density-1">
              {bulkDeletePreviewAccounts.map((account) => (
                <div key={account.id}>{account.name}</div>
              ))}
            </div>
            {selectedAccountIds.length > bulkDeletePreviewAccounts.length ? (
              <div className="text-muted-foreground text-xs">
                {t("account:bulk.deletePreviewRemainder", {
                  count:
                    selectedAccountIds.length -
                    bulkDeletePreviewAccounts.length,
                })}
              </div>
            ) : null}
            {hiddenSelectedCount > 0 ? (
              <div className="text-warning-text text-xs">
                {t("account:bulk.deleteHiddenSelectedHint", {
                  count: hiddenSelectedCount,
                })}
              </div>
            ) : null}
          </div>
        }
      />
    </Card>
  )
}
