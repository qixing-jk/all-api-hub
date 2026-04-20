import type { DragEndEvent } from "@dnd-kit/core"
import { arrayMove } from "@dnd-kit/sortable"
import {
  ChevronDownIcon,
  ChevronUpIcon,
  InboxIcon,
  PlusIcon,
} from "@heroicons/react/24/outline"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useTranslation } from "react-i18next"

import {
  Button,
  Card,
  CardContent,
  CardList,
  Checkbox,
  DestructiveConfirmDialog,
  EmptyState,
  IconButton,
  TagFilter,
} from "~/components/ui"
import {
  DATA_TYPE_BALANCE,
  DATA_TYPE_CONSUMPTION,
  DATA_TYPE_CREATED_AT,
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
import { ACCOUNT_MANAGEMENT_TEST_IDS } from "~/features/AccountManagement/testIds"
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
import { NonSortableAccountListItem } from "./AccountListBaseItem"
import { AccountListInitialLoadingState } from "./AccountListLoadingState"
import AccountSearchInput from "./AccountSearchInput"

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

interface AccountListFilterAggregation {
  displayedResults: AccountListResultItem[]
  disabledCounts: {
    enabled: number
    disabled: number
    total: number
  }
  siteTypeCounts: Map<string, number>
  refreshCounts: Map<AccountRefreshFilterValue, number>
  checkInCounts: Map<AccountCheckInFilterValue, number>
}

type DndLoadState = "inactive" | "loading" | "ready"
type RequestIdleCallbackHandle = number
type RequestIdleCallbackDeadline = {
  didTimeout: boolean
  timeRemaining: () => number
}
type RequestIdleCallbackFn = (
  callback: (deadline: RequestIdleCallbackDeadline) => void,
) => RequestIdleCallbackHandle
type CancelIdleCallbackFn = (handle: RequestIdleCallbackHandle) => void

/**
 * Lazily loads the account list drag-and-drop runtime for manual ordering mode.
 */
function loadAccountListDndRuntime() {
  return import("./AccountListDndRuntime")
}

type AccountListDndRuntime = Awaited<
  ReturnType<typeof loadAccountListDndRuntime>
>

const ACCOUNT_REFRESH_FILTER_OPTION_ORDER: AccountRefreshFilterValue[] = [
  "never-synced",
  "healthy",
  "warning",
  "error",
  "unknown",
]

const ACCOUNT_REFRESH_FILTER_OPTION_VALUE_SET =
  new Set<AccountRefreshFilterValue>(ACCOUNT_REFRESH_FILTER_OPTION_ORDER)

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
 * Guards runtime values coming back from Select so only known refresh buckets
 * flow into AccountRefreshFilterValue state.
 */
function isAccountRefreshFilterValue(
  value: string,
): value is AccountRefreshFilterValue {
  return ACCOUNT_REFRESH_FILTER_OPTION_VALUE_SET.has(
    value as AccountRefreshFilterValue,
  )
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

  switch (account.health.status) {
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

  // `siteCheckInEnabled`, `siteStatusKnown`, and `hasCustomCheckIn` can all be
  // false in two different ways:
  // 1) detection is off and there is no custom check-in configured
  // 2) detection is on but no device status has ever been detected, and there is
  //    still no custom check-in configured
  // Both cases should resolve to "unsupported", but for different reasons.
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
 * Aggregates displayed results and per-filter faceted counts in one pass.
 */
function aggregateAccountListFilters(
  results: AccountListResultItem[],
  filters: AccountListFilterState,
): AccountListFilterAggregation {
  const aggregation: AccountListFilterAggregation = {
    displayedResults: [],
    disabledCounts: {
      enabled: 0,
      disabled: 0,
      total: 0,
    },
    siteTypeCounts: new Map<string, number>(),
    refreshCounts: new Map<AccountRefreshFilterValue, number>(),
    checkInCounts: new Map<AccountCheckInFilterValue, number>(),
  }

  for (const result of results) {
    const { account } = result
    const refreshValue = getAccountRefreshFilterValue(account)
    const checkInValue = getAccountCheckInFilterValue(account)
    const accountTagIds = account.tagIds || []
    const matchesDisabled =
      filters.disabledFilter === null
        ? true
        : filters.disabledFilter === "disabled"
          ? account.disabled === true
          : account.disabled !== true
    const matchesSiteType =
      filters.siteTypeFilter === null
        ? true
        : account.siteType === filters.siteTypeFilter
    const matchesRefresh =
      filters.refreshStatusFilter === null
        ? true
        : refreshValue === filters.refreshStatusFilter
    const matchesCheckIn =
      filters.checkInFilter === null
        ? true
        : checkInValue === filters.checkInFilter
    const matchesTags =
      filters.selectedTagIds.length === 0
        ? true
        : filters.selectedTagIds.some((tagId) => accountTagIds.includes(tagId))

    if (matchesSiteType && matchesRefresh && matchesCheckIn && matchesTags) {
      aggregation.disabledCounts.total += 1
      if (account.disabled === true) {
        aggregation.disabledCounts.disabled += 1
      } else {
        aggregation.disabledCounts.enabled += 1
      }
    }

    if (matchesDisabled && matchesRefresh && matchesCheckIn && matchesTags) {
      aggregation.siteTypeCounts.set(
        account.siteType,
        (aggregation.siteTypeCounts.get(account.siteType) ?? 0) + 1,
      )
    }

    if (matchesDisabled && matchesSiteType && matchesCheckIn && matchesTags) {
      aggregation.refreshCounts.set(
        refreshValue,
        (aggregation.refreshCounts.get(refreshValue) ?? 0) + 1,
      )
    }

    if (matchesDisabled && matchesSiteType && matchesRefresh && matchesTags) {
      aggregation.checkInCounts.set(
        checkInValue,
        (aggregation.checkInCounts.get(checkInValue) ?? 0) + 1,
      )
    }

    if (
      matchesDisabled &&
      matchesSiteType &&
      matchesRefresh &&
      matchesCheckIn &&
      matchesTags
    ) {
      aggregation.displayedResults.push(result)
    }
  }

  return aggregation
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
    isInitialLoad,
    handleSort,
    sortField,
    sortOrder,
    handleReorder,
    tags,
    tagCountsById,
    isManualSortFeatureEnabled,
    detectedAccount,
  } = useAccountDataContext()
  const { handleAddAccountClick } = useAddAccountHandler()
  const {
    handleDeleteAccount,
    handleDeleteAccounts,
    handleSetAccountsDisabled,
  } = useAccountActionsContext()
  const [deleteDialogAccount, setDeleteDialogAccount] =
    useState<DisplaySiteData | null>(null)
  const [copyKeyDialogAccount, setCopyKeyDialogAccount] =
    useState<DisplaySiteData | null>(null)
  const [isBulkMode, setIsBulkMode] = useState(false)
  const [selectedAccountIds, setSelectedAccountIds] = useState<string[]>([])
  const [isBulkDeleting, setIsBulkDeleting] = useState(false)
  const [isBulkDisabling, setIsBulkDisabling] = useState(false)
  const [isBulkDeleteConfirmOpen, setIsBulkDeleteConfirmOpen] = useState(false)
  const [selectedTagIds, setSelectedTagIds] = useState<string[]>([])
  const [siteTypeFilter, setSiteTypeFilter] = useState<string | null>(null)
  const [refreshStatusFilter, setRefreshStatusFilter] =
    useState<AccountRefreshFilterValue | null>(null)
  const [checkInFilter, setCheckInFilter] =
    useState<AccountCheckInFilterValue | null>(null)
  const [disabledFilter, setDisabledFilter] =
    useState<AccountDisabledFilterValue | null>(null)
  const [dndLoadState, setDndLoadState] = useState<DndLoadState>("inactive")
  const dndLoadPromiseRef = useRef<Promise<AccountListDndRuntime> | null>(null)
  const dndRuntimeRef = useRef<AccountListDndRuntime | null>(null)
  const isMountedRef = useRef(true)

  const { query, setQuery, clearSearch, searchResults, inSearchMode } =
    useAccountSearch(displayData, initialSearchQuery)

  useEffect(() => {
    return () => {
      isMountedRef.current = false
    }
  }, [])

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

  const filterAggregation = useMemo(
    () => aggregateAccountListFilters(baseResults, filterState),
    [baseResults, filterState],
  )
  const displayedResults = filterAggregation.displayedResults

  const allAccountIdSet = useMemo(
    () => new Set(displayData.map((account) => account.id)),
    [displayData],
  )

  useEffect(() => {
    setSelectedAccountIds((previous) =>
      previous.filter((accountId) => allAccountIdSet.has(accountId)),
    )
  }, [allAccountIdSet])

  useEffect(() => {
    if (displayData.length === 0) {
      setIsBulkMode(false)
      setSelectedAccountIds([])
    }
  }, [displayData.length])

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
  const selectedIdSet = useMemo(
    () => new Set(selectedAccountIds),
    [selectedAccountIds],
  )
  const visibleAccountIds = useMemo(
    () => filteredSites.map((account) => account.id),
    [filteredSites],
  )
  const visibleAccountIdSet = useMemo(
    () => new Set(visibleAccountIds),
    [visibleAccountIds],
  )
  const selectedAccounts = useMemo(
    () => displayData.filter((account) => selectedIdSet.has(account.id)),
    [displayData, selectedIdSet],
  )
  const selectedVisibleCount = useMemo(
    () =>
      selectedAccounts.filter((account) => visibleAccountIdSet.has(account.id))
        .length,
    [selectedAccounts, visibleAccountIdSet],
  )
  const hiddenSelectedCount = selectedAccountIds.length - selectedVisibleCount
  const selectedEnabledAccounts = useMemo(
    () => selectedAccounts.filter((account) => account.disabled !== true),
    [selectedAccounts],
  )
  const bulkDeletePreviewAccounts = useMemo(
    () => selectedAccounts.slice(0, 6),
    [selectedAccounts],
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
  const dragDisabled = inSearchMode || !isManualSortFeatureEnabled || isBulkMode
  const handleLabel = t("account:list.dragHandle")
  const isBulkBusy = isBulkDeleting || isBulkDisabling
  const shouldRenderSortableList =
    isManualSortFeatureEnabled &&
    dndLoadState === "ready" &&
    dndRuntimeRef.current !== null

  const sortedIds = useMemo(
    () => baseResults.map((item) => item.account.id),
    [baseResults],
  )

  const updateSelectedAccountIds = (
    updater: (previous: string[]) => string[],
  ) => {
    setSelectedAccountIds((previous) => Array.from(new Set(updater(previous))))
  }

  const handleBulkModeExit = () => {
    if (isBulkBusy) return

    setIsBulkMode(false)
    setSelectedAccountIds([])
    setIsBulkDeleteConfirmOpen(false)
  }

  const handleToggleAccountSelection = (
    accountId: string,
    checked: boolean,
  ) => {
    updateSelectedAccountIds((previous) =>
      checked
        ? [...previous, accountId]
        : previous.filter((selectedId) => selectedId !== accountId),
    )
  }

  const handleSelectVisibleAccounts = () => {
    updateSelectedAccountIds((previous) => [...previous, ...visibleAccountIds])
  }

  const handleClearVisibleSelection = () => {
    if (visibleAccountIds.length === 0) return

    const visibleIds = new Set(visibleAccountIds)
    updateSelectedAccountIds((previous) =>
      previous.filter((selectedId) => !visibleIds.has(selectedId)),
    )
  }

  const handleClearAllSelection = () => {
    if (isBulkBusy) return
    setSelectedAccountIds([])
  }

  const handleBulkDisable = async () => {
    if (selectedEnabledAccounts.length === 0 || isBulkBusy) {
      return
    }

    setIsBulkDisabling(true)
    try {
      const { updatedIds } = await handleSetAccountsDisabled(
        selectedEnabledAccounts,
        true,
      )
      if (updatedIds.length > 0) {
        const updatedIdSet = new Set(updatedIds)
        setSelectedAccountIds((previous) =>
          previous.filter((accountId) => !updatedIdSet.has(accountId)),
        )
      }
    } finally {
      setIsBulkDisabling(false)
    }
  }

  const handleBulkDelete = async () => {
    if (selectedAccounts.length === 0 || isBulkBusy) {
      return
    }

    setIsBulkDeleting(true)
    try {
      const { deletedCount, deletedIds } =
        await handleDeleteAccounts(selectedAccounts)
      if (deletedIds.length > 0) {
        const deletedIdSet = new Set(deletedIds)
        setSelectedAccountIds((previous) =>
          previous.filter((accountId) => !deletedIdSet.has(accountId)),
        )
      }
      setIsBulkDeleteConfirmOpen(false)

      if (deletedCount > 0 && displayData.length - deletedCount <= 0) {
        setIsBulkMode(false)
      }
    } finally {
      setIsBulkDeleting(false)
    }
  }

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

  const ensureDndReady = useCallback(() => {
    if (!isManualSortFeatureEnabled) {
      return Promise.resolve(null)
    }

    if (dndRuntimeRef.current !== null) {
      if (dndLoadState !== "ready") {
        setDndLoadState("ready")
      }
      return Promise.resolve(dndRuntimeRef.current)
    }

    if (dndLoadPromiseRef.current !== null) {
      if (dndLoadState === "inactive") {
        setDndLoadState("loading")
      }
      return dndLoadPromiseRef.current
    }

    setDndLoadState("loading")

    const loadPromise = loadAccountListDndRuntime()
      .then((runtime) => {
        dndRuntimeRef.current = runtime
        dndLoadPromiseRef.current = Promise.resolve(runtime)
        if (isMountedRef.current) {
          setDndLoadState("ready")
        }
        return runtime
      })
      .catch((error) => {
        dndLoadPromiseRef.current = null
        if (isMountedRef.current) {
          setDndLoadState("inactive")
        }
        throw error
      })

    dndLoadPromiseRef.current = loadPromise
    return loadPromise
  }, [dndLoadState, isManualSortFeatureEnabled])

  const handleActivateDnd = useCallback(() => {
    if (dragDisabled || !isManualSortFeatureEnabled) {
      return
    }

    void ensureDndReady()
  }, [dragDisabled, ensureDndReady, isManualSortFeatureEnabled])

  useEffect(() => {
    if (
      !isManualSortFeatureEnabled ||
      dragDisabled ||
      !hasAccounts ||
      dndLoadState !== "inactive"
    ) {
      return
    }

    const requestIdleCallbackFn = (
      globalThis as typeof globalThis & {
        requestIdleCallback?: RequestIdleCallbackFn
      }
    ).requestIdleCallback
    const cancelIdleCallbackFn = (
      globalThis as typeof globalThis & {
        cancelIdleCallback?: CancelIdleCallbackFn
      }
    ).cancelIdleCallback

    if (typeof requestIdleCallbackFn === "function") {
      const idleHandle = requestIdleCallbackFn(() => {
        void ensureDndReady()
      })

      return () => {
        cancelIdleCallbackFn?.(idleHandle)
      }
    }

    const timeoutHandle = window.setTimeout(() => {
      void ensureDndReady()
    }, 0)

    return () => {
      window.clearTimeout(timeoutHandle)
    }
  }, [
    dndLoadState,
    dragDisabled,
    ensureDndReady,
    hasAccounts,
    isManualSortFeatureEnabled,
  ])

  const maxTagFilterLines = isSmallScreen ? 2 : isDesktop ? 3 : 2

  if (isInitialLoad) {
    return <AccountListInitialLoadingState label={t("common:status.loading")} />
  }

  if (!hasAccounts) {
    return (
      <div
        className="space-y-2"
        data-testid={ACCOUNT_MANAGEMENT_TEST_IDS.accountListView}
      >
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
      {displayedResults.map((item) => {
        const selectionControl = isBulkMode ? (
          <Checkbox
            checked={selectedIdSet.has(item.account.id)}
            onCheckedChange={(checked) =>
              handleToggleAccountSelection(item.account.id, Boolean(checked))
            }
            aria-label={t("account:bulk.selectAccount", {
              accountName: item.account.name,
            })}
            disabled={isBulkBusy}
          />
        ) : undefined

        if (shouldRenderSortableList && dndRuntimeRef.current !== null) {
          const { SortableAccountListItem } = dndRuntimeRef.current

          return (
            <SortableAccountListItem
              key={item.account.id}
              site={item.account}
              showCreatedAt={sortField === DATA_TYPE_CREATED_AT}
              className={cn(
                detectedAccount?.id === item.account.id &&
                  "rounded-lg border-l-4 border-l-blue-500 bg-blue-50 dark:border-l-blue-400 dark:bg-blue-900/50",
              )}
              highlights={item.highlights}
              onDeleteWithDialog={handleDeleteWithDialog}
              onCopyKey={handleCopyKeyWithDialog}
              isDragDisabled={dragDisabled}
              handleLabel={handleLabel}
              showHandle={isManualSortFeatureEnabled && !isBulkMode}
              selectionControl={selectionControl}
            />
          )
        }

        return (
          <NonSortableAccountListItem
            key={item.account.id}
            site={item.account}
            showCreatedAt={sortField === DATA_TYPE_CREATED_AT}
            className={cn(
              detectedAccount?.id === item.account.id &&
                "rounded-lg border-l-4 border-l-blue-500 bg-blue-50 dark:border-l-blue-400 dark:bg-blue-900/50",
            )}
            highlights={item.highlights}
            onDeleteWithDialog={handleDeleteWithDialog}
            onCopyKey={handleCopyKeyWithDialog}
            isDragDisabled={dragDisabled}
            handleLabel={handleLabel}
            showHandle={isManualSortFeatureEnabled && !isBulkMode}
            onActivateDnd={handleActivateDnd}
            selectionControl={selectionControl}
          />
        )
      })}
    </CardList>
  )
  const DndWrapper = dndRuntimeRef.current?.AccountListDndWrapper

  return (
    <Card
      padding="none"
      className="flex flex-col overflow-hidden"
      data-testid={ACCOUNT_MANAGEMENT_TEST_IDS.accountListView}
    >
      <CardContent padding={"none"} spacing={"none"}>
        {/* Search + Filters */}
        <div className="dark:border-dark-bg-tertiary dark:bg-dark-bg-primary border-b border-gray-200 bg-white px-2 py-2 sm:px-5 sm:py-3">
          <div className="flex flex-col gap-1.5 sm:gap-2">
            <div className="flex flex-col gap-1.5 sm:gap-2 lg:flex-row lg:items-center lg:gap-3">
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
            <TagFilter
              options={tagFilterOptions}
              value={selectedTagIds}
              onChange={setSelectedTagIds}
              maxVisibleLines={maxTagFilterLines}
              allLabel={t("account:filter.tagsAllLabel")}
              allCount={displayData.length}
            />
            {isBulkMode ? (
              <div className="dark:border-dark-bg-tertiary dark:bg-dark-bg-secondary/40 flex flex-col gap-2 rounded-lg border border-gray-200 bg-gray-50 p-3">
                <div className="flex flex-col gap-1 text-sm">
                  <span className="font-medium text-gray-800 dark:text-gray-100">
                    {t("account:bulk.selectedSummary", {
                      count: selectedAccountIds.length,
                      selected: selectedAccountIds.length,
                      visibleSelected: selectedVisibleCount,
                    })}
                  </span>
                  {hiddenSelectedCount > 0 ? (
                    <span className="text-xs text-gray-600 dark:text-gray-300">
                      {t("account:bulk.hiddenSelectedHint", {
                        count: hiddenSelectedCount,
                      })}
                    </span>
                  ) : null}
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={handleSelectVisibleAccounts}
                    disabled={visibleAccountIds.length === 0 || isBulkBusy}
                  >
                    {t("account:bulk.selectVisible")}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={handleClearVisibleSelection}
                    disabled={selectedVisibleCount === 0 || isBulkBusy}
                  >
                    {t("account:bulk.clearVisible")}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={handleClearAllSelection}
                    disabled={selectedAccountIds.length === 0 || isBulkBusy}
                  >
                    {t("account:bulk.clearAll")}
                  </Button>
                  <Button
                    type="button"
                    variant="warning"
                    size="sm"
                    onClick={() => void handleBulkDisable()}
                    disabled={
                      selectedEnabledAccounts.length === 0 || isBulkBusy
                    }
                    loading={isBulkDisabling}
                  >
                    {t("account:bulk.disableSelected")}
                  </Button>
                  <Button
                    type="button"
                    variant="destructive"
                    size="sm"
                    onClick={() => setIsBulkDeleteConfirmOpen(true)}
                    disabled={selectedAccountIds.length === 0 || isBulkBusy}
                  >
                    {t("account:bulk.deleteSelected")}
                  </Button>
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    onClick={handleBulkModeExit}
                    disabled={isBulkBusy}
                  >
                    {t("account:bulk.exit")}
                  </Button>
                </div>
              </div>
            ) : null}
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
            <div className="flex min-w-0 flex-1 items-center gap-2">
              <div className="flex min-w-0 items-center gap-0.5">
                {renderSortButton("name", t("account:list.header.account"))}
                <div className="dark:text-dark-text-tertiary text-[10px] text-gray-400 sm:text-xs">
                  /
                </div>
                <div className="dark:text-dark-text-tertiary flex items-center text-[9px] text-gray-400 sm:text-[10px]">
                  {renderSortButton(
                    DATA_TYPE_CREATED_AT,
                    t("account:list.header.createdAt"),
                  )}
                </div>
              </div>
              <span className="text-[10px] font-medium sm:text-xs">
                {t("common:total") + ": " + displayedResults.length}
              </span>
              <Button
                type="button"
                variant={isBulkMode ? "secondary" : "outline"}
                size="sm"
                className="h-7 shrink-0 px-2 text-xs"
                onClick={
                  isBulkMode ? handleBulkModeExit : () => setIsBulkMode(true)
                }
                disabled={isBulkBusy}
              >
                {isBulkMode ? t("account:bulk.exit") : t("account:bulk.manage")}
              </Button>
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
        ) : shouldRenderSortableList && DndWrapper ? (
          <DndWrapper sortedIds={sortedIds} onDragEnd={onDragEnd}>
            {listContent}
          </DndWrapper>
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

      <DestructiveConfirmDialog
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
        onConfirm={() => {
          void handleBulkDelete()
        }}
        isWorking={isBulkDeleting}
        size="md"
        details={
          <div className="space-y-3 text-sm">
            <div className="font-medium text-gray-900 dark:text-gray-100">
              {t("account:bulk.deletePreviewTitle")}
            </div>
            <div className="space-y-1 text-gray-600 dark:text-gray-300">
              {bulkDeletePreviewAccounts.map((account) => (
                <div key={account.id}>{account.name}</div>
              ))}
            </div>
            {selectedAccountIds.length > bulkDeletePreviewAccounts.length ? (
              <div className="text-xs text-gray-500 dark:text-gray-400">
                {t("account:bulk.deletePreviewRemainder", {
                  count:
                    selectedAccountIds.length -
                    bulkDeletePreviewAccounts.length,
                })}
              </div>
            ) : null}
            {hiddenSelectedCount > 0 ? (
              <div className="text-xs text-amber-700 dark:text-amber-300">
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
