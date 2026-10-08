import { useId, useMemo, useState } from "react"
import { useTranslation } from "react-i18next"

import { ACCOUNT_SITE_TITLE_RULES } from "~/constants/siteType"
import { useUserPreferencesContext } from "~/contexts/UserPreferencesContext"
import { useAccountActionsContext } from "~/features/AccountManagement/actions/AccountActionsContext"
import { useAccountListBulkActions } from "~/features/AccountManagement/components/AccountList/bulk/useAccountListBulkActions"
import {
  ACCOUNT_DISABLED_FILTER_VALUES,
  ACCOUNT_LIST_ALL_FILTER_VALUE,
  ACCOUNT_REFRESH_FILTER_OPTION_ORDER,
  ACCOUNT_REFRESH_FILTER_VALUES,
  aggregateAccountListFilters,
  isAccountRefreshFilterValue,
  type AccountDisabledFilterValue,
  type AccountListFilterState,
  type AccountRefreshFilterValue,
} from "~/features/AccountManagement/components/AccountList/filtering/accountListFilters"
import {
  ACCOUNT_CHECK_IN_FILTER_OPTION_ORDER,
  ACCOUNT_CHECK_IN_FILTER_VALUES,
  type AccountCheckInFilterValue,
} from "~/features/AccountManagement/components/AccountList/filtering/checkInFilter"
import { useAccountSearch } from "~/features/AccountManagement/components/AccountList/filtering/useAccountSearch"
import {
  groupAccountListResults,
  type AccountListResultItem,
} from "~/features/AccountManagement/components/AccountList/ordering/accountListOrdering"
import {
  DND_LOAD_STATES,
  useAccountListReordering,
} from "~/features/AccountManagement/components/AccountList/ordering/useAccountListReordering"
import { useAccountDataContext } from "~/features/AccountManagement/data/AccountDataContext"
import { useAddAccountHandler } from "~/features/AccountManagement/opening/useAddAccountHandler"
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
import { getHealthStatusDisplay } from "~/utils/healthStatus"

export interface AccountListViewModelOptions {
  initialSearchQuery?: string
  onAddAccount?: () => void
  reorderUnavailableReason?: string
}

/** Compose list filtering, summaries and existing selection/reorder owners for the view. */
export function useAccountListViewModel({
  initialSearchQuery,
  onAddAccount,
  reorderUnavailableReason,
}: AccountListViewModelOptions) {
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

  const reordering = useAccountListReordering({
    inSearchMode,
    isBulkMode,
    reorderUnavailableReason,
  })
  const {
    accountsInDisplayOrder,
    pinnedAccountIdSet,
    isReorderMode,
    isReorderSaving,
    dndLoadState,
    resetReorderMode,
  } = reordering

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
        value: ACCOUNT_LIST_ALL_FILTER_VALUE,
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
        value: ACCOUNT_LIST_ALL_FILTER_VALUE,
        label: t("filter.refresh.all"),
        count: Array.from(filterAggregation.refreshCounts.values()).reduce(
          (sum, count) => sum + count,
          0,
        ),
      },
      ...ACCOUNT_REFRESH_FILTER_OPTION_ORDER.map((refreshStatus) => ({
        value: refreshStatus,
        label:
          refreshStatus === ACCOUNT_REFRESH_FILTER_VALUES.NeverSynced
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
        case ACCOUNT_CHECK_IN_FILTER_VALUES.CheckedIn:
          return t("filter.checkIn.checked-in")
        case ACCOUNT_CHECK_IN_FILTER_VALUES.NotCheckedIn:
          return t("filter.checkIn.not-checked-in")
        case ACCOUNT_CHECK_IN_FILTER_VALUES.Outdated:
          return t("filter.checkIn.outdated")
        case ACCOUNT_CHECK_IN_FILTER_VALUES.StatusUnavailable:
          return t("filter.checkIn.status-unavailable")
        case ACCOUNT_CHECK_IN_FILTER_VALUES.Unsupported:
        default:
          return t("filter.checkIn.unsupported")
      }
    }

    return [
      {
        value: ACCOUNT_LIST_ALL_FILTER_VALUE,
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
        value: ACCOUNT_LIST_ALL_FILTER_VALUE,
        label: t("filter.disabled.all"),
        count: filterAggregation.disabledCounts.total,
      },
      {
        value: ACCOUNT_DISABLED_FILTER_VALUES.Enabled,
        label: t("common:status.enabled"),
        count: filterAggregation.disabledCounts.enabled,
      },
      {
        value: ACCOUNT_DISABLED_FILTER_VALUES.Disabled,
        label: t("common:status.disabled"),
        count: filterAggregation.disabledCounts.disabled,
      },
    ]
  }, [filterAggregation.disabledCounts, t])

  const filteredSites = useMemo(
    () => displayedResults.map((item) => item.account),
    [displayedResults],
  )
  const bulk = useAccountListBulkActions({
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

  const onDisabledChange = (value: string) =>
    setDisabledFilter(
      value === ACCOUNT_DISABLED_FILTER_VALUES.Enabled ||
        value === ACCOUNT_DISABLED_FILTER_VALUES.Disabled
        ? value
        : null,
    )
  const onSiteTypeChange = (value: string) =>
    setSiteTypeFilter(value === ACCOUNT_LIST_ALL_FILTER_VALUE ? null : value)
  const onRefreshChange = (value: string) =>
    setRefreshStatusFilter(
      value === ACCOUNT_LIST_ALL_FILTER_VALUE
        ? null
        : isAccountRefreshFilterValue(value)
          ? value
          : null,
    )
  const onCheckInChange = (value: string) =>
    setCheckInFilter(
      value === ACCOUNT_LIST_ALL_FILTER_VALUE
        ? null
        : (value as AccountCheckInFilterValue),
    )
  return {
    status: { isInitialLoad, hasAccounts },
    display: {
      groupedDisplayItems,
      sortField,
      sortOrder,
      detectedAccount,
      handleLabel,
      sortedIds,
      showTodayCashflow,
      displayedResultCount: displayedResults.length,
      filteredSiteCount: filteredSites.length,
    },
    filters: {
      query,
      setQuery,
      clearSearch,
      inSearchMode,
      filtersOpen,
      filterPanelId,
      togglePanel: () => setFiltersOpen((previous) => !previous),
      selectedTagIds,
      setSelectedTagIds,
      disabledFilter,
      siteTypeFilter,
      refreshStatusFilter,
      checkInFilter,
      disabledFilterOptions,
      siteTypeFilterOptions,
      refreshFilterOptions,
      checkInFilterOptions,
      tagFilterOptions,
      activeStatusFilterCount,
      onDisabledChange,
      onSiteTypeChange,
      onRefreshChange,
      onCheckInChange,
    },
    totals: {
      showFilteredSummary,
      filteredBalance,
      filteredConsumption,
      filteredIncome,
    },
    reordering: {
      ...reordering,
      clearSortConfig,
      showGroupReorderHint,
      isReorderLoading:
        isReorderMode &&
        (dndLoadState === DND_LOAD_STATES.Loading || isReorderSaving),
    },
    bulk: { ...bulk, isBulkMode },
    dialogs: {
      deleteDialogAccount,
      setDeleteDialogAccount,
      copyKeyDialogAccount,
      setCopyKeyDialogAccount,
      handleDeleteAccount,
      handleDeleteWithDialog,
      handleCopyKeyWithDialog,
    },
    handleEmptyStateAddAccountClick,
  }
}
