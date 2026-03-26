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
import {
  DATA_TYPE_BALANCE,
  DATA_TYPE_CONSUMPTION,
  DATA_TYPE_INCOME,
} from "~/constants"
import { SITE_TITLE_RULES } from "~/constants/siteType"
import { useUserPreferencesContext } from "~/contexts/UserPreferencesContext"
import { useAccountActionsContext } from "~/features/AccountManagement/hooks/AccountActionsContext"
import { useAccountDataContext } from "~/features/AccountManagement/hooks/AccountDataContext"
import {
  useAccountSearch,
  type SearchResultWithHighlight,
} from "~/features/AccountManagement/hooks/useAccountSearch"
import { getHealthStatusDisplay } from "~/features/AccountManagement/utils/healthStatusUtils"
import { useAddAccountHandler } from "~/hooks/useAddAccountHandler"
import { useIsDesktop, useIsSmallScreen } from "~/hooks/useMediaQuery"
import { cn } from "~/lib/utils"
import { getDayKeyFromUnixSeconds } from "~/services/history/usageHistory/core"
import type { DisplaySiteData, SortField } from "~/types"
import {
  calculateTotalBalanceForSites,
  calculateTotalConsumptionForSites,
} from "~/utils/core/formatters"
import { formatMoneyFixed } from "~/utils/core/money"

import CopyKeyDialog from "../CopyKeyDialog"
import DelAccountDialog from "../DelAccountDialog"
import { NewcomerSupportCard } from "../NewcomerSupportCard"
import AccountFilterBar from "./AccountFilterBar"
import AccountSearchInput from "./AccountSearchInput"
import SortableAccountListItem from "./SortableAccountListItem"

interface AccountListProps {
  initialSearchQuery?: string
}

type AccountListResultItem = {
  account: DisplaySiteData
  highlights?: SearchResultWithHighlight["highlights"]
}

type AccountDisabledFilterValue = "enabled" | "disabled"
type AccountRefreshFilterValue =
  | "never-synced"
  | "healthy"
  | "warning"
  | "error"
  | "unknown"
type AccountCheckInFilterValue =
  | "checked-in"
  | "not-checked-in"
  | "outdated"
  | "unsupported"

interface AccountListFilterState {
  disabledFilter: AccountDisabledFilterValue | null
  siteTypeFilter: string | null
  refreshStatusFilter: AccountRefreshFilterValue | null
  checkInFilter: AccountCheckInFilterValue | null
  selectedTagIds: string[]
}

const ACCOUNT_REFRESH_FILTER_OPTION_ORDER: AccountRefreshFilterValue[] = [
  "never-synced",
  "healthy",
  "warning",
  "error",
  "unknown",
]

const ACCOUNT_CHECK_IN_FILTER_OPTION_ORDER: AccountCheckInFilterValue[] = [
  "checked-in",
  "not-checked-in",
  "outdated",
  "unsupported",
]

/**
 * Checks whether a persisted site check-in detection timestamp belongs to today.
 */
function isCheckInStatusDetectedToday(detectedAt?: number): boolean {
  if (typeof detectedAt !== "number" || !Number.isFinite(detectedAt)) {
    return false
  }

  const todayKey = getDayKeyFromUnixSeconds(Math.floor(Date.now() / 1000))
  const detectedKey = getDayKeyFromUnixSeconds(Math.floor(detectedAt / 1000))
  return detectedKey === todayKey
}

/**
 * Maps persisted account sync metadata to a user-facing refresh-state filter bucket.
 */
function getAccountRefreshFilterValue(
  account: DisplaySiteData,
): AccountRefreshFilterValue {
  const hasSynced =
    typeof account.last_sync_time === "number" &&
    Number.isFinite(account.last_sync_time) &&
    account.last_sync_time > 0

  if (!hasSynced) {
    return "never-synced"
  }

  switch (account.health?.status) {
    case "healthy":
      return "healthy"
    case "warning":
      return "warning"
    case "error":
      return "error"
    case "unknown":
    default:
      return "unknown"
  }
}

/**
 * Maps combined site/custom check-in state into one stable filter bucket.
 */
function getAccountCheckInFilterValue(
  account: DisplaySiteData,
): AccountCheckInFilterValue {
  const hasCustomCheckIn =
    typeof account.checkIn?.customCheckIn?.url === "string" &&
    account.checkIn.customCheckIn.url.trim() !== ""
  const siteCheckInEnabled = account.checkIn?.enableDetection === true
  const siteCheckedInToday = account.checkIn?.siteStatus?.isCheckedInToday
  const siteStatusKnown = typeof siteCheckedInToday === "boolean"
  const siteStatusOutdated =
    siteCheckInEnabled &&
    siteStatusKnown &&
    !isCheckInStatusDetectedToday(account.checkIn?.siteStatus?.lastDetectedAt)
  const customCheckedIn =
    account.checkIn?.customCheckIn?.isCheckedInToday === true

  if (siteStatusOutdated) {
    return "outdated"
  }

  if (!siteCheckInEnabled && !hasCustomCheckIn) {
    return "unsupported"
  }

  if (!siteStatusKnown && !hasCustomCheckIn) {
    return "unsupported"
  }

  const siteFlowChecked = !siteStatusKnown || siteCheckedInToday === true
  const customFlowChecked = !hasCustomCheckIn || customCheckedIn

  return siteFlowChecked && customFlowChecked ? "checked-in" : "not-checked-in"
}

/**
 * Applies the account-list filters to a result set while allowing faceted counts
 * to ignore one dimension at a time.
 */
function applyAccountListFilters(
  results: AccountListResultItem[],
  filters: AccountListFilterState,
  options?: {
    skipDisabled?: boolean
    skipSiteType?: boolean
    skipRefresh?: boolean
    skipCheckIn?: boolean
    skipTags?: boolean
  },
) {
  const {
    skipDisabled = false,
    skipSiteType = false,
    skipRefresh = false,
    skipCheckIn = false,
    skipTags = false,
  } = options ?? {}

  const disabledFilteredResults =
    skipDisabled || filters.disabledFilter === null
      ? results
      : results.filter(({ account }) =>
          filters.disabledFilter === "disabled"
            ? account.disabled === true
            : account.disabled !== true,
        )

  const siteTypeFilteredResults =
    skipSiteType || filters.siteTypeFilter === null
      ? disabledFilteredResults
      : disabledFilteredResults.filter(
          ({ account }) => account.siteType === filters.siteTypeFilter,
        )

  const refreshFilteredResults =
    skipRefresh || filters.refreshStatusFilter === null
      ? siteTypeFilteredResults
      : siteTypeFilteredResults.filter(
          ({ account }) =>
            getAccountRefreshFilterValue(account) ===
            filters.refreshStatusFilter,
        )

  const checkInFilteredResults =
    skipCheckIn || filters.checkInFilter === null
      ? refreshFilteredResults
      : refreshFilteredResults.filter(
          ({ account }) =>
            getAccountCheckInFilterValue(account) === filters.checkInFilter,
        )

  if (skipTags || filters.selectedTagIds.length === 0) {
    return checkInFilteredResults
  }

  return checkInFilteredResults.filter(({ account }) => {
    const ids = account.tagIds || []
    return filters.selectedTagIds.some((tagId) => ids.includes(tagId))
  })
}

/**
 * Master list view for user accounts, including search, tagging, sorting, filtering, and manual reordering controls.
 */
export default function AccountList({ initialSearchQuery }: AccountListProps) {
  const { t } = useTranslation(["account", "common"])
  const isSmallScreen = useIsSmallScreen()
  const isDesktop = useIsDesktop()
  const { showTodayCashflow } = useUserPreferencesContext()
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
  const [siteTypeFilter, setSiteTypeFilter] = useState<string | null>(null)
  const [refreshStatusFilter, setRefreshStatusFilter] =
    useState<AccountRefreshFilterValue | null>(null)
  const [checkInFilter, setCheckInFilter] =
    useState<AccountCheckInFilterValue | null>(null)
  const [disabledFilter, setDisabledFilter] =
    useState<AccountDisabledFilterValue | null>(null)

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

  const baseResults = useMemo<AccountListResultItem[]>(() => {
    if (inSearchMode) {
      return searchResults.map((result) => ({
        account: result.account,
        highlights: result.highlights,
      }))
    }

    return sortedData.map((account) => ({ account, highlights: undefined }))
  }, [inSearchMode, searchResults, sortedData])

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

  const displayedResults = useMemo(
    () => applyAccountListFilters(baseResults, filterState),
    [baseResults, filterState],
  )

  const disabledCountResults = useMemo(
    () =>
      applyAccountListFilters(baseResults, filterState, { skipDisabled: true }),
    [baseResults, filterState],
  )

  const siteTypeCountResults = useMemo(
    () =>
      applyAccountListFilters(baseResults, filterState, { skipSiteType: true }),
    [baseResults, filterState],
  )

  const refreshCountResults = useMemo(
    () =>
      applyAccountListFilters(baseResults, filterState, { skipRefresh: true }),
    [baseResults, filterState],
  )

  const checkInCountResults = useMemo(
    () =>
      applyAccountListFilters(baseResults, filterState, { skipCheckIn: true }),
    [baseResults, filterState],
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
    const siteTypeCounts = siteTypeCountResults.reduce(
      (counts, { account }) => {
        counts.set(account.siteType, (counts.get(account.siteType) ?? 0) + 1)
        return counts
      },
      new Map<string, number>(),
    )

    const availableSiteTypes = Array.from(
      new Set(displayData.map((account) => account.siteType)),
    )
    const knownSiteTypes = SITE_TITLE_RULES.map((rule) => rule.name).filter(
      (siteType) => availableSiteTypes.includes(siteType),
    )
    const extraSiteTypes = availableSiteTypes
      .filter((siteType) => !knownSiteTypes.includes(siteType))
      .sort((a, b) => a.localeCompare(b))

    return [
      {
        value: "all",
        label: t("filter.siteType.all"),
        count: siteTypeCountResults.length,
      },
      ...[...knownSiteTypes, ...extraSiteTypes].map((siteType) => ({
        value: siteType,
        label: siteType,
        count: siteTypeCounts.get(siteType) ?? 0,
      })),
    ]
  }, [displayData, siteTypeCountResults, t])

  const refreshFilterOptions = useMemo(() => {
    const refreshCounts = refreshCountResults.reduce((counts, { account }) => {
      const refreshStatus = getAccountRefreshFilterValue(account)
      counts.set(refreshStatus, (counts.get(refreshStatus) ?? 0) + 1)
      return counts
    }, new Map<AccountRefreshFilterValue, number>())

    return [
      {
        value: "all",
        label: t("filter.refresh.all"),
        count: refreshCountResults.length,
      },
      ...ACCOUNT_REFRESH_FILTER_OPTION_ORDER.map((refreshStatus) => ({
        value: refreshStatus,
        label:
          refreshStatus === "never-synced"
            ? t("account:filter.refresh.neverSynced")
            : getHealthStatusDisplay(refreshStatus, t).text,
        count: refreshCounts.get(refreshStatus) ?? 0,
      })),
    ]
  }, [refreshCountResults, t])

  const checkInFilterOptions = useMemo(() => {
    const checkInCounts = checkInCountResults.reduce((counts, { account }) => {
      const checkInStatus = getAccountCheckInFilterValue(account)
      counts.set(checkInStatus, (counts.get(checkInStatus) ?? 0) + 1)
      return counts
    }, new Map<AccountCheckInFilterValue, number>())

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
        case "unsupported":
        default:
          return t("filter.checkIn.unsupported")
      }
    }

    return [
      {
        value: "all",
        label: t("filter.checkIn.all"),
        count: checkInCountResults.length,
      },
      ...ACCOUNT_CHECK_IN_FILTER_OPTION_ORDER.map((checkInStatus) => ({
        value: checkInStatus,
        label: getCheckInFilterLabel(checkInStatus),
        count: checkInCounts.get(checkInStatus) ?? 0,
      })),
    ]
  }, [checkInCountResults, t])

  const disabledFilterOptions = useMemo(() => {
    const enabledCount = disabledCountResults.filter(
      ({ account }) => account.disabled !== true,
    ).length
    const disabledCount = disabledCountResults.length - enabledCount

    return [
      {
        value: "all",
        label: t("filter.disabled.all"),
        count: disabledCountResults.length,
      },
      {
        value: "enabled",
        label: t("common:status.enabled"),
        count: enabledCount,
      },
      {
        value: "disabled",
        label: t("common:status.disabled"),
        count: disabledCount,
      },
    ]
  }, [disabledCountResults, t])

  const filteredSites = useMemo(
    () => displayedResults.map((item) => item.account),
    [displayedResults],
  )

  const filteredBalance = useMemo(
    () => calculateTotalBalanceForSites(filteredSites),
    [filteredSites],
  )

  const filteredConsumption = useMemo(
    () =>
      showTodayCashflow
        ? calculateTotalConsumptionForSites(filteredSites)
        : { USD: 0, CNY: 0 },
    [filteredSites, showTodayCashflow],
  )

  const hasAccounts = displayData.length > 0
  const showFilteredSummary =
    inSearchMode ||
    selectedTagIds.length > 0 ||
    checkInFilter !== null ||
    siteTypeFilter !== null ||
    refreshStatusFilter !== null ||
    disabledFilter !== null
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
      <div className="space-y-2" data-testid="account-list-view">
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
    <Card
      padding="none"
      className="flex flex-col overflow-hidden"
      data-testid="account-list-view"
    >
      <CardContent padding={"none"} spacing={"none"}>
        {/* Search + Filters */}
        <div className="dark:border-dark-bg-tertiary dark:bg-dark-bg-primary border-b border-gray-200 bg-white px-3 py-2 sm:px-5 sm:py-3">
          <div className="flex flex-col gap-2">
            <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:gap-3">
              <div className="min-w-0 lg:w-72 lg:shrink-0 xl:w-80">
                <AccountSearchInput
                  value={query}
                  onChange={setQuery}
                  onClear={clearSearch}
                />
              </div>
              <div className="min-w-0 flex-1">
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
                        : (value as AccountRefreshFilterValue),
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
                  {showTodayCashflow && (
                    <span>
                      {t("account:filteredTotals.consumption")}: USD{" "}
                      {formatMoneyFixed(filteredConsumption.USD)} / CNY{" "}
                      {formatMoneyFixed(filteredConsumption.CNY)}
                    </span>
                  )}
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
              {showTodayCashflow && (
                <>
                  <div className="dark:text-dark-text-tertiary text-[10px] text-gray-400 sm:text-xs">
                    /
                  </div>
                  <div className="dark:text-dark-text-tertiary flex items-center text-[9px] text-gray-400 sm:text-[10px]">
                    {renderSortButton(
                      DATA_TYPE_CONSUMPTION,
                      t("account:list.header.todayConsumption"),
                    )}
                  </div>
                  <div className="dark:text-dark-text-tertiary text-[10px] text-gray-400 sm:text-xs">
                    /
                  </div>
                  <div className="dark:text-dark-text-tertiary flex items-center text-[9px] text-gray-400 sm:text-[10px]">
                    {renderSortButton(
                      DATA_TYPE_INCOME,
                      t("account:list.header.todayIncome"),
                    )}
                  </div>
                </>
              )}
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
