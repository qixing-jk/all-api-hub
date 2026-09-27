import type { DragEndEvent } from "@dnd-kit/core"
import { ChevronDown, Inbox, Info, Plus, SlidersHorizontal } from "lucide-react"
import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react"
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
  getInviteLinkFailureAnalyticsCategory,
  getInviteLinkFailureSummary,
  getPrimaryInviteLinkFailureReason,
} from "~/features/AccountManagement/inviteLinkCopyFeedback"
import {
  BULK_INVITE_LINK_COPY_POLICY,
  INVITE_LINK_COPY_RESULTS,
  runInviteLinkCopyWorkflow,
} from "~/features/AccountManagement/inviteLinkCopyWorkflow"
import {
  ACCOUNT_MANAGEMENT_TEST_IDS,
  getAccountManagementSelectionCheckboxTestId,
} from "~/features/AccountManagement/testIds"
import { useAddAccountHandler } from "~/hooks/useAddAccountHandler"
import toast from "~/lib/notify"
import { cn } from "~/lib/utils"
import { getAccountSortGroup } from "~/services/preferences/utils/sortingPriority"
import {
  startProductAnalyticsAction,
  trackProductAnalyticsActionStarted,
} from "~/services/productAnalytics/actions"
import {
  PRODUCT_ANALYTICS_ACTION_IDS,
  PRODUCT_ANALYTICS_ENTRYPOINTS,
  PRODUCT_ANALYTICS_ERROR_CATEGORIES,
  PRODUCT_ANALYTICS_FAILURE_REASONS,
  PRODUCT_ANALYTICS_FEATURE_IDS,
  PRODUCT_ANALYTICS_RESULTS,
  PRODUCT_ANALYTICS_SOURCE_KINDS,
  PRODUCT_ANALYTICS_SURFACE_IDS,
} from "~/services/productAnalytics/contracts"
import type { DisplaySiteData, SortField } from "~/types"
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
  moveAccountId,
  projectAccountsByIdOrder,
  replaceVisibleAccountOrder,
  type AccountListDisplayItem,
  type AccountListResultItem,
} from "./accountListOrdering"
import AccountSearchInput from "./AccountSearchInput"
import {
  ACCOUNT_CHECK_IN_FILTER_OPTION_ORDER,
  type AccountCheckInFilterValue,
} from "./checkInFilter"
import { FilteredTodayMetric } from "./FilteredTodayMetric"
import * as accountListDndRuntimeLoader from "./loadAccountListDndRuntime"
import { VirtualizedAccountList } from "./VirtualizedAccountList"

interface AccountListProps {
  initialSearchQuery?: string
  onAddAccount?: () => void
  reorderUnavailableReason?: string
  showAddAccountAction?: boolean
  virtualScrollParent?: HTMLElement | null
}

type DndLoadState = "inactive" | "loading" | "ready"

type AccountListDndRuntime = Awaited<
  ReturnType<typeof accountListDndRuntimeLoader.loadAccountListDndRuntime>
>

const ACCOUNT_REORDER_TOAST_ID = "account-reorder"
const ACCOUNT_REORDER_BOUNDARY_TOAST_ID = "account-reorder-boundary"

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
    sortedData,
    displayData,
    isInitialLoad,
    handleSort,
    clearSortConfig,
    sortField,
    sortOrder,
    handleReorder,
    pinnedAccountIds,
    tags,
    tagCountsById,
    isManualSortFeatureEnabled,
    detectedAccount,
    getAccountContextBoost,
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
  const [isReorderMode, setIsReorderMode] = useState(false)
  const [isReorderSaving, setIsReorderSaving] = useState(false)
  const [reorderAccountIds, setReorderAccountIds] = useState<string[] | null>(
    null,
  )
  const [selectedAccountIds, setSelectedAccountIds] = useState<string[]>([])
  const [isBulkDeleting, setIsBulkDeleting] = useState(false)
  const [isBulkDisabling, setIsBulkDisabling] = useState(false)
  const [isBulkCopyingInviteLinks, setIsBulkCopyingInviteLinks] =
    useState(false)
  const [manualInviteLinkPayload, setManualInviteLinkPayload] = useState<
    string | null
  >(null)
  const [isBulkDeleteConfirmOpen, setIsBulkDeleteConfirmOpen] = useState(false)
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
  const [dndLoadState, setDndLoadState] = useState<DndLoadState>("inactive")
  const dndLoadPromiseRef = useRef<Promise<AccountListDndRuntime> | null>(null)
  const dndRuntimeRef = useRef<AccountListDndRuntime | null>(null)
  const isReorderSavingRef = useRef(false)
  const isMountedRef = useRef(true)
  const inviteLinkCopyAbortControllerRef = useRef<AbortController | null>(null)

  const { query, setQuery, clearSearch, searchResults, inSearchMode } =
    useAccountSearch(displayData, initialSearchQuery)

  useEffect(() => {
    isMountedRef.current = true
    return () => {
      isMountedRef.current = false
      inviteLinkCopyAbortControllerRef.current?.abort()
    }
  }, [])

  const handleDeleteWithDialog = (site: DisplaySiteData) => {
    setDeleteDialogAccount(site)
  }

  const handleCopyKeyWithDialog = (site: DisplaySiteData) => {
    setCopyKeyDialogAccount(site)
  }

  const accountsInDisplayOrder = useMemo(
    () =>
      reorderAccountIds === null
        ? sortedData
        : projectAccountsByIdOrder(displayData, reorderAccountIds),
    [displayData, reorderAccountIds, sortedData],
  )
  const pinnedAccountIdSet = useMemo(
    () => new Set(pinnedAccountIds),
    [pinnedAccountIds],
  )

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
      setIsReorderMode(false)
      setReorderAccountIds(null)
      setSelectedAccountIds([])
    }
  }, [displayData.length])

  useEffect(() => {
    if (inSearchMode || !isManualSortFeatureEnabled) {
      setIsReorderMode(false)
      setReorderAccountIds(null)
    }
  }, [inSearchMode, isManualSortFeatureEnabled])

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
  const dragDisabled =
    !isReorderMode ||
    inSearchMode ||
    !isManualSortFeatureEnabled ||
    isBulkMode ||
    isReorderSaving
  const handleLabel = t("account:list.dragHandle")
  const isBulkBusy =
    isBulkDeleting || isBulkDisabling || isBulkCopyingInviteLinks
  const shouldRenderSortableList =
    isReorderMode &&
    isManualSortFeatureEnabled &&
    dndLoadState === "ready" &&
    dndRuntimeRef.current !== null

  const resolvedReorderDisabledReason = isReorderMode
    ? null
    : reorderUnavailableReason ??
      (isBulkMode
        ? t("account:list.reorderUnavailableWhileBulk")
        : inSearchMode
          ? t("account:list.reorderUnavailableWhileSearch")
          : !isManualSortFeatureEnabled
            ? t("account:list.reorderUnavailableInSettings")
            : null)

  const sortedIds = useMemo(
    () => groupedDisplayItems.map((item) => item.result.account.id),
    [groupedDisplayItems],
  )

  const accountListAnalyticsBaseContext = {
    featureId: PRODUCT_ANALYTICS_FEATURE_IDS.AccountManagement,
    surfaceId: PRODUCT_ANALYTICS_SURFACE_IDS.OptionsAccountManagementPage,
    entrypoint: PRODUCT_ANALYTICS_ENTRYPOINTS.Options,
  }

  const updateSelectedAccountIds = (
    updater: (previous: string[]) => string[],
  ) => {
    setSelectedAccountIds((previous) => Array.from(new Set(updater(previous))))
  }

  const handleEmptyStateAddAccountClick = () => {
    void trackProductAnalyticsActionStarted({
      ...accountListAnalyticsBaseContext,
      actionId: PRODUCT_ANALYTICS_ACTION_IDS.OpenCreateAccountDialog,
    })
    const addAccount = onAddAccount ?? handleAddAccountClick
    addAccount()
  }

  const handleBulkModeEnter = () => {
    void trackProductAnalyticsActionStarted({
      ...accountListAnalyticsBaseContext,
      actionId: PRODUCT_ANALYTICS_ACTION_IDS.EnterAccountBulkMode,
    })
    setIsReorderMode(false)
    setReorderAccountIds(null)
    setIsBulkMode(true)
  }

  const handleBulkModeExit = () => {
    if (isBulkBusy) return

    void trackProductAnalyticsActionStarted({
      ...accountListAnalyticsBaseContext,
      actionId: PRODUCT_ANALYTICS_ACTION_IDS.ExitAccountBulkMode,
    })
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

    const itemCount = selectedEnabledAccounts.length
    const selectedCount = selectedAccountIds.length
    const analyticsContext = {
      ...accountListAnalyticsBaseContext,
      actionId: PRODUCT_ANALYTICS_ACTION_IDS.DisableSelectedAccounts,
    }
    const tracker = startProductAnalyticsAction(analyticsContext)

    setIsBulkDisabling(true)
    try {
      const { updatedCount, updatedIds } = await handleSetAccountsDisabled(
        selectedEnabledAccounts,
        true,
      )
      const failureCount = Math.max(0, itemCount - updatedCount)
      tracker.complete(
        failureCount > 0
          ? PRODUCT_ANALYTICS_RESULTS.Failure
          : PRODUCT_ANALYTICS_RESULTS.Success,
        {
          ...(failureCount > 0
            ? {
                errorCategory: PRODUCT_ANALYTICS_ERROR_CATEGORIES.Unknown,
              }
            : {}),
          insights: {
            itemCount,
            selectedCount,
            successCount: updatedCount,
            failureCount,
          },
        },
      )
      if (updatedIds.length > 0) {
        const updatedIdSet = new Set(updatedIds)
        setSelectedAccountIds((previous) =>
          previous.filter((accountId) => !updatedIdSet.has(accountId)),
        )
      }
    } catch (error) {
      tracker.complete(PRODUCT_ANALYTICS_RESULTS.Failure, {
        errorCategory: PRODUCT_ANALYTICS_ERROR_CATEGORIES.Unknown,
        insights: {
          itemCount,
          selectedCount,
          successCount: 0,
          failureCount: itemCount,
        },
      })
      throw error
    } finally {
      setIsBulkDisabling(false)
    }
  }

  const handleBulkCopyInviteLinks = async () => {
    if (isBulkCopyingInviteLinks || inviteLinkCopyAbortControllerRef.current) {
      return
    }

    const analyticsContext = {
      ...accountListAnalyticsBaseContext,
      actionId: PRODUCT_ANALYTICS_ACTION_IDS.CopySelectedAccountInviteLinks,
    }
    const tracker = startProductAnalyticsAction(analyticsContext)
    const controller = new AbortController()
    inviteLinkCopyAbortControllerRef.current = controller

    setIsBulkCopyingInviteLinks(true)
    try {
      const result = await runInviteLinkCopyWorkflow({
        accounts: selectedAccounts,
        format: "labeled",
        signal: controller.signal,
        ...BULK_INVITE_LINK_COPY_POLICY,
      })
      const insights = {
        itemCount: result.itemCount,
        selectedCount: result.selectedCount,
        successCount: result.successCount,
        failureCount: result.failureCount,
        skippedCount: result.skippedCount + result.unsupportedCount,
      }

      if (result.result === INVITE_LINK_COPY_RESULTS.Cancelled) {
        tracker.complete(PRODUCT_ANALYTICS_RESULTS.Cancelled, { insights })
        return
      }

      if (result.result === INVITE_LINK_COPY_RESULTS.ClipboardFailure) {
        setManualInviteLinkPayload(result.payload ?? null)
        tracker.complete(PRODUCT_ANALYTICS_RESULTS.Failure, {
          errorCategory: PRODUCT_ANALYTICS_ERROR_CATEGORIES.Permission,
          insights,
        })
        const hasOtherOutcomes =
          result.failureCount > 0 ||
          result.unsupportedCount > 0 ||
          result.skippedCount > 0
        toast.error(
          hasOtherOutcomes
            ? t("account:bulk.copyInviteLinksClipboardFailedWithReasons", {
                reasonSummary: getInviteLinkFailureSummary(t, result),
              })
            : t("account:bulk.copyInviteLinksClipboardFailed"),
        )
        return
      }

      if (result.result === INVITE_LINK_COPY_RESULTS.Unsupported) {
        tracker.complete(PRODUCT_ANALYTICS_RESULTS.Failure, {
          errorCategory: PRODUCT_ANALYTICS_ERROR_CATEGORIES.Unsupported,
          insights,
        })
        toast.error(t("account:bulk.copyInviteLinksUnsupported"))
        return
      }

      if (result.result === INVITE_LINK_COPY_RESULTS.Failure) {
        const primaryFailureReason = getPrimaryInviteLinkFailureReason(
          result.failureReasonCounts,
        )
        tracker.complete(PRODUCT_ANALYTICS_RESULTS.Failure, {
          errorCategory:
            getInviteLinkFailureAnalyticsCategory(primaryFailureReason),
          insights,
        })
        toast.error(
          t("account:bulk.copyInviteLinksFailedWithReasons", {
            reasonSummary: getInviteLinkFailureSummary(t, result),
          }),
        )
        return
      }

      const isPartial =
        result.result === INVITE_LINK_COPY_RESULTS.PartialSuccess
      const primaryFailureReason = getPrimaryInviteLinkFailureReason(
        result.failureReasonCounts,
      )
      tracker.complete(
        isPartial
          ? PRODUCT_ANALYTICS_RESULTS.Failure
          : PRODUCT_ANALYTICS_RESULTS.Success,
        {
          ...(isPartial
            ? {
                errorCategory:
                  result.failureCount > 0
                    ? getInviteLinkFailureAnalyticsCategory(
                        primaryFailureReason,
                      )
                    : PRODUCT_ANALYTICS_ERROR_CATEGORIES.Unsupported,
              }
            : {}),
          insights: {
            ...insights,
            ...(isPartial
              ? {
                  failureReason:
                    PRODUCT_ANALYTICS_FAILURE_REASONS.PartialSuccess,
                }
              : {}),
          },
        },
      )

      toast.success(
        !isPartial
          ? t("account:bulk.copyInviteLinksSuccess", {
              count: result.successCount,
            })
          : t("account:bulk.copyInviteLinksPartialSuccess", {
              successCount: result.successCount,
              reasonSummary: getInviteLinkFailureSummary(t, result),
            }),
      )
    } catch {
      tracker.complete(PRODUCT_ANALYTICS_RESULTS.Failure, {
        errorCategory: PRODUCT_ANALYTICS_ERROR_CATEGORIES.Unknown,
        insights: {
          itemCount: selectedEnabledAccounts.length,
          selectedCount: selectedAccountIds.length,
          successCount: 0,
          failureCount: selectedEnabledAccounts.length,
          skippedCount:
            selectedAccounts.length - selectedEnabledAccounts.length,
        },
      })
      toast.error(t("account:bulk.copyInviteLinksFailed"))
    } finally {
      if (inviteLinkCopyAbortControllerRef.current === controller) {
        inviteLinkCopyAbortControllerRef.current = null
        if (isMountedRef.current) setIsBulkCopyingInviteLinks(false)
      }
    }
  }

  const handleBulkDelete = async () => {
    if (selectedAccounts.length === 0 || isBulkBusy) {
      return
    }

    const itemCount = selectedAccounts.length
    const selectedCount = selectedAccountIds.length
    const analyticsContext = {
      ...accountListAnalyticsBaseContext,
      actionId: PRODUCT_ANALYTICS_ACTION_IDS.DeleteAccount,
    }
    const tracker = startProductAnalyticsAction(analyticsContext)

    setIsBulkDeleting(true)
    try {
      const { deletedCount, deletedIds } =
        await handleDeleteAccounts(selectedAccounts)
      const failureCount = Math.max(0, itemCount - deletedCount)
      tracker.complete(
        failureCount > 0
          ? PRODUCT_ANALYTICS_RESULTS.Failure
          : PRODUCT_ANALYTICS_RESULTS.Success,
        {
          ...(failureCount > 0
            ? {
                errorCategory: PRODUCT_ANALYTICS_ERROR_CATEGORIES.Unknown,
              }
            : {}),
          insights: {
            itemCount,
            selectedCount,
            successCount: deletedCount,
            failureCount,
          },
        },
      )
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
    } catch (error) {
      tracker.complete(PRODUCT_ANALYTICS_RESULTS.Failure, {
        errorCategory: PRODUCT_ANALYTICS_ERROR_CATEGORIES.Unknown,
        insights: {
          itemCount,
          selectedCount,
          successCount: 0,
          failureCount: itemCount,
        },
      })
      throw error
    } finally {
      setIsBulkDeleting(false)
    }
  }

  const onDragEnd = (event: DragEndEvent) => {
    if (
      dragDisabled ||
      reorderAccountIds === null ||
      isReorderSavingRef.current
    ) {
      return
    }
    const { active, over } = event
    if (!over || active.id === over.id) return

    const oldIndex = sortedIds.indexOf(active.id as string)
    const newIndex = sortedIds.indexOf(over.id as string)
    if (oldIndex === -1 || newIndex === -1) return

    const activeAccount = groupedDisplayItems[oldIndex]?.result.account
    const overAccount = groupedDisplayItems[newIndex]?.result.account
    const crossedGroupBoundary =
      activeAccount !== undefined &&
      overAccount !== undefined &&
      getAccountSortGroup(activeAccount, pinnedAccountIdSet) !==
        getAccountSortGroup(overAccount, pinnedAccountIdSet)

    if (crossedGroupBoundary) {
      toast.warning(t("account:list.reorderGroupBoundary"), {
        id: ACCOUNT_REORDER_BOUNDARY_TOAST_ID,
      })
      return
    }

    const itemCount = sortedIds.length
    const analyticsContext = {
      ...accountListAnalyticsBaseContext,
      actionId: PRODUCT_ANALYTICS_ACTION_IDS.ReorderAccounts,
    }
    const tracker = startProductAnalyticsAction(analyticsContext)
    const previousAccountIds = accountsInDisplayOrder.map(
      (account) => account.id,
    )
    const nextVisibleIds = moveAccountId(sortedIds, oldIndex, newIndex)
    const nextAccountIds = replaceVisibleAccountOrder(
      previousAccountIds,
      nextVisibleIds,
    )
    const clearsFieldSort = sortField !== null

    isReorderSavingRef.current = true
    setIsReorderSaving(true)
    setReorderAccountIds(nextAccountIds)

    void Promise.resolve(handleReorder(nextVisibleIds))
      .then(() => {
        if (clearsFieldSort) {
          clearSortConfig()
        }
        toast.success(
          t(
            clearsFieldSort
              ? "account:list.reorderSuccessFieldSortCleared"
              : "account:list.reorderSuccess",
          ),
          {
            id: ACCOUNT_REORDER_TOAST_ID,
          },
        )
        tracker.complete(PRODUCT_ANALYTICS_RESULTS.Success, {
          insights: {
            sourceKind: PRODUCT_ANALYTICS_SOURCE_KINDS.Manual,
            itemCount,
          },
        })
      })
      .catch(() => {
        setReorderAccountIds(previousAccountIds)
        toast.error(t("account:list.reorderFailed"), {
          id: ACCOUNT_REORDER_TOAST_ID,
        })
        tracker.complete(PRODUCT_ANALYTICS_RESULTS.Failure, {
          errorCategory: PRODUCT_ANALYTICS_ERROR_CATEGORIES.Unknown,
          insights: {
            sourceKind: PRODUCT_ANALYTICS_SOURCE_KINDS.Manual,
            itemCount,
          },
        })
      })
      .finally(() => {
        isReorderSavingRef.current = false
        if (isMountedRef.current) {
          setIsReorderSaving(false)
        }
      })
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

    const loadPromise = accountListDndRuntimeLoader
      .loadAccountListDndRuntime()
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

  const handleReorderModeEnter = useCallback(() => {
    if (resolvedReorderDisabledReason !== null) return

    setReorderAccountIds(sortedData.map((account) => account.id))
    setIsReorderMode(true)
    void ensureDndReady().catch(() => {
      if (isMountedRef.current) {
        setIsReorderMode(false)
        setReorderAccountIds(null)
        toast.error(t("account:list.reorderLoadFailed"))
      }
    })
  }, [ensureDndReady, resolvedReorderDisabledReason, sortedData, t])

  const handleReorderModeExit = useCallback(() => {
    if (isReorderSavingRef.current) return
    setIsReorderMode(false)
    setReorderAccountIds(null)
  }, [])

  const handleListSort = useCallback(
    (field: SortField) => {
      if (isReorderSavingRef.current) return
      setIsReorderMode(false)
      setReorderAccountIds(null)
      handleSort(field)
    },
    [handleSort],
  )

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
            <div className="bg-theme-50 text-theme-600 dark:bg-theme-900/40 dark:text-theme-300 py-density-2 shrink-0 rounded-md px-2">
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
        "bg-theme-50/80 opacity-100 hover:bg-theme-100/60 focus-within:bg-theme-100/60 dark:bg-theme-950/35 dark:hover:bg-theme-900/30 dark:focus-within:bg-theme-900/30",
      detectedAccount?.id === result.account.id &&
        "border-l-4 border-l-theme-500 bg-theme-50/70 dark:border-l-theme-400 dark:bg-theme-900/30",
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
    if (shouldRenderSortableList && dndRuntimeRef.current !== null) {
      const { SortableAccountListItem } = dndRuntimeRef.current

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
  const DndWrapper = dndRuntimeRef.current?.AccountListDndWrapper

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
                  <span className="bg-theme-50 text-theme-700 dark:bg-theme-950 dark:text-theme-300 rounded px-1">
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
            onDelete={() => setIsBulkDeleteConfirmOpen(true)}
            onExit={handleBulkModeExit}
          />
        )}

        {showGroupReorderHint ? (
          <div
            className="dark:border-border border-theme-100 bg-theme-50/80 text-theme-800 dark:bg-theme-950/40 dark:text-theme-200 gap-y-density-2 py-density-1-5 flex items-center gap-x-2 border-b px-3 text-xs leading-5"
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
          <DndWrapper sortedIds={sortedIds} onDragEnd={onDragEnd}>
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
