import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useTranslation } from "react-i18next"

import { useUserPreferencesContext } from "~/contexts/UserPreferencesContext"
import { useManagedSiteModelSyncCommands } from "~/features/ManagedSiteModelSync/commands/useManagedSiteModelSyncCommands"
import type { ManagedSiteModelSyncProps } from "~/features/ManagedSiteModelSync/contracts"
import { useManagedSiteModelSyncData } from "~/features/ManagedSiteModelSync/data/useManagedSiteModelSyncData"
import { useModelSyncExclusions } from "~/features/ManagedSiteModelSync/exclusions/useModelSyncExclusions"
import { getModelSyncHistoryItemKey } from "~/features/ManagedSiteModelSync/results/executionIdentity"
import {
  MODEL_SYNC_FILTER_STATUSES,
  type FilterStatus,
} from "~/features/ManagedSiteModelSync/results/FilterBar"
import {
  actionBarAnalyticsScope,
  manualPanelAnalyticsScope,
  resultsTableAnalyticsScope,
  useModelSyncAnalytics,
} from "~/features/ManagedSiteModelSync/workspace/modelSyncAnalytics"
import {
  filterExecutionItems,
  getStatusKindFromFilterStatus,
  TAB_INDEX,
} from "~/features/ManagedSiteModelSync/workspace/modelSyncWorkspace"
import type { ManagedResourceRef } from "~/services/apiAdapters/contracts/managedResourceNative"
import {
  getManagedSiteRuntimeConfigFingerprint,
  hasValidManagedSiteConfig,
  resolveManagedSiteRuntimeConfigForType,
} from "~/services/managedSites/configuration/runtimeConfig"
import {
  getManagedResourceRefKey,
  isManagedResourceRefForSite,
  parseManagedResourceRef,
} from "~/services/managedSites/managedResourceIdentity"
import { supportsManagedSiteModelSync } from "~/services/managedSites/utils/managedSite"
import {
  PRODUCT_ANALYTICS_ACTION_IDS,
  PRODUCT_ANALYTICS_MODE_IDS,
  PRODUCT_ANALYTICS_SOURCE_KINDS,
} from "~/services/productAnalytics/contracts"
import type { ExecutionItemResult } from "~/types/managedSiteModelSync"
import { normalizeManagedUpstreamResourceScopeKey } from "~/types/managedUpstreamResource"

/** Compose target-scoped data and commands with history/manual workspace selection. */
export function useManagedSiteModelSyncViewModel({
  refreshKey,
  routeParams,
}: ManagedSiteModelSyncProps) {
  const { t } = useTranslation([
    "managedSiteModelSync",
    "settings",
    "messages",
    "common",
  ])
  const { managedSiteType, preferences } = useUserPreferencesContext()
  const hasInitializedTab = useRef(false)
  const historySearchAnalyticsKey = useRef<string | null>(null)
  const manualSearchAnalyticsKey = useRef<string | null>(null)
  const isConfigMissing = !hasValidManagedSiteConfig(
    preferences,
    managedSiteType,
  )
  const isModelSyncUnsupported = !supportsManagedSiteModelSync(managedSiteType)
  const selectedTarget = useMemo(
    () => resolveManagedSiteRuntimeConfigForType(preferences, managedSiteType),
    [preferences, managedSiteType],
  )
  const selectedScopeKey = normalizeManagedUpstreamResourceScopeKey(
    selectedTarget?.config.baseUrl ?? "",
  )
  const managedSiteConfigFingerprint = useMemo(
    () => getManagedSiteRuntimeConfigFingerprint(preferences, managedSiteType),
    [managedSiteType, preferences],
  )
  const canUseResource = useCallback(
    (ref: ManagedResourceRef) =>
      Boolean(
        selectedTarget && isManagedResourceRefForSite(ref, selectedTarget),
      ),
    [selectedTarget],
  )
  const exclusions = useModelSyncExclusions(
    isModelSyncUnsupported ? null : selectedTarget,
    managedSiteConfigFingerprint,
  )
  const routedResourceRef = useMemo(
    () => parseManagedResourceRef(routeParams?.resourceRef),
    [routeParams?.resourceRef],
  )
  const routeResourceUnavailable = Boolean(
    routeParams?.resourceRef &&
      (!routedResourceRef || !canUseResource(routedResourceRef)),
  )
  const [filterStatus, setFilterStatus] = useState<FilterStatus>(
    MODEL_SYNC_FILTER_STATUSES.All,
  )
  const [searchKeyword, setSearchKeyword] = useState("")
  const [historySelectedKeys, setHistorySelectedKeys] = useState<Set<string>>(
    new Set(),
  )
  const [manualSelectedKeys, setManualSelectedKeys] = useState<Set<string>>(
    new Set(),
  )

  const [selectedTab, setSelectedTab] = useState<number>(TAB_INDEX.history)
  const [manualExcludedOnly, setManualExcludedOnly] = useState(false)
  const data = useManagedSiteModelSyncData({
    isConfigMissing,
    isModelSyncUnsupported,
    managedSiteConfigFingerprint,
    managedSiteType,
    refreshKey,
  })
  const {
    lastExecution,
    progress,
    nextScheduledAt,
    isAutoSyncEnabled,
    intervalMs,
    isLoading,
    isManualRefreshPending,
    channels,
    isChannelsLoading,
    isManualChannelRefresh,
    channelsError,
    hasAttemptedChannelsLoad,
    loadChannels,
    handleManualChannelRefresh,
    handleRefresh,
  } = data
  const { trackInstantModelSyncAction } = useModelSyncAnalytics(managedSiteType)
  const {
    activeAction,
    runningResourceKey,
    retryableFailedRefs,
    handleRetryFailed,
    handleRunAll,
    handleRunSelected,
    handleRunSingle,
  } = useManagedSiteModelSyncCommands({
    data,
    canUseResource,
    managedSiteType,
    managedSiteConfigFingerprint,
    isConfigMissing,
    isModelSyncUnsupported,
    selection: {
      historySelectedKeys,
      manualSelectedKeys,
      setHistorySelectedKeys,
      setManualSelectedKeys,
    },
  })
  useEffect(() => {
    hasInitializedTab.current = false
    setHistorySelectedKeys(new Set())
    setManualSelectedKeys(new Set())
    setManualExcludedOnly(false)
  }, [isConfigMissing, isModelSyncUnsupported, managedSiteConfigFingerprint])
  const [manualSearchKeyword, setManualSearchKeyword] = useState("")
  useEffect(() => {
    if (isLoading || hasInitializedTab.current) {
      return
    }

    hasInitializedTab.current = true
    setSelectedTab(
      lastExecution?.items?.length ? TAB_INDEX.history : TAB_INDEX.manual,
    )
  }, [isLoading, lastExecution?.items?.length])

  useEffect(() => {
    if (
      !isConfigMissing &&
      !isModelSyncUnsupported &&
      selectedTab === TAB_INDEX.manual &&
      channels.length === 0 &&
      !isChannelsLoading &&
      !hasAttemptedChannelsLoad
    ) {
      void loadChannels()
    }
  }, [
    channels.length,
    hasAttemptedChannelsLoad,
    isConfigMissing,
    isModelSyncUnsupported,
    isChannelsLoading,
    loadChannels,
    selectedTab,
  ])

  useEffect(() => {
    if (isConfigMissing || isModelSyncUnsupported) {
      return
    }

    const channelIdRaw = routeParams?.channelId?.trim()
    const selectedRef =
      routedResourceRef &&
      isManagedResourceRefForSite(routedResourceRef, {
        siteType: managedSiteType,
        config: { baseUrl: selectedScopeKey },
      })
        ? routedResourceRef
        : null
    const requestedTab = routeParams?.tab?.trim()

    if (routeParams?.resourceRef || channelIdRaw) {
      hasInitializedTab.current = true
      setSelectedTab(TAB_INDEX.manual)
      setManualSearchKeyword(
        routedResourceRef?.resourceId ?? channelIdRaw ?? "",
      )
      setManualSelectedKeys(
        new Set(selectedRef ? [getManagedResourceRefKey(selectedRef)] : []),
      )
      return
    }

    if (requestedTab === "history" || requestedTab === "manual") {
      hasInitializedTab.current = true
      setSelectedTab(TAB_INDEX[requestedTab])
    }

    const search = routeParams?.search?.trim()
    if (search) {
      setSearchKeyword(search)
      setManualSearchKeyword(search)
    }
  }, [
    isConfigMissing,
    isModelSyncUnsupported,
    managedSiteConfigFingerprint,
    managedSiteType,
    routeParams?.channelId,
    routeParams?.resourceRef,
    routedResourceRef,
    selectedScopeKey,
    routeParams?.search,
    routeParams?.tab,
  ])

  const handleHistorySelectAll = (checked: boolean) => {
    const itemCount = filteredItems?.length ?? 0
    if (checked && filteredItems) {
      setHistorySelectedKeys(
        new Set(
          filteredItems
            .filter(
              (item) => item.resourceRef && canUseResource(item.resourceRef),
            )
            .map(getModelSyncHistoryItemKey),
        ),
      )
    } else {
      setHistorySelectedKeys(new Set())
    }
    trackInstantModelSyncAction(
      {
        ...resultsTableAnalyticsScope,
        actionId:
          PRODUCT_ANALYTICS_ACTION_IDS.SelectAllManagedSiteModelSyncChannels,
      },
      {
        mode: PRODUCT_ANALYTICS_MODE_IDS.Selected,
        sourceKind: PRODUCT_ANALYTICS_SOURCE_KINDS.History,
        selectedCount: checked ? itemCount : 0,
        itemCount,
      },
    )
  }

  const handleHistorySelectItem = (resourceKey: string, checked: boolean) => {
    const newSelected = new Set(historySelectedKeys)
    if (checked) {
      newSelected.add(resourceKey)
    } else {
      newSelected.delete(resourceKey)
    }
    setHistorySelectedKeys(newSelected)
    trackInstantModelSyncAction(
      {
        ...resultsTableAnalyticsScope,
        actionId:
          PRODUCT_ANALYTICS_ACTION_IDS.SelectAllManagedSiteModelSyncChannels,
      },
      {
        mode: PRODUCT_ANALYTICS_MODE_IDS.Single,
        sourceKind: PRODUCT_ANALYTICS_SOURCE_KINDS.History,
        selectedCount: newSelected.size,
        itemCount: filteredItems?.length ?? 0,
      },
    )
  }

  const filteredItems = lastExecution
    ? filterExecutionItems(lastExecution.items, filterStatus, searchKeyword)
    : undefined

  const { isExcluded } = exclusions
  const manualItems: ExecutionItemResult[] = useMemo(() => {
    const keyword = manualSearchKeyword.toLowerCase().trim()
    const source = keyword
      ? channels.filter(
          (channel) =>
            channel.name.toLowerCase().includes(keyword) ||
            channel.ref.resourceId.toLowerCase().includes(keyword),
        )
      : channels

    return source
      .filter((channel) => !manualExcludedOnly || isExcluded(channel.ref))
      .map((channel) => ({
        resourceRef: channel.ref,
        channelName: channel.name,
        ok: true,
        attempts: 0,
        finishedAt: 0,
      }))
  }, [channels, manualSearchKeyword, manualExcludedOnly, isExcluded])

  const manualExcludedCount = channels.filter((channel) =>
    isExcluded(channel.ref),
  ).length

  const handleTabChange = (index: number) => {
    setSelectedTab(index)
    trackInstantModelSyncAction(
      {
        ...actionBarAnalyticsScope,
        actionId: PRODUCT_ANALYTICS_ACTION_IDS.SelectManagedSiteModelSyncTab,
      },
      {
        sourceKind:
          index === TAB_INDEX.manual
            ? PRODUCT_ANALYTICS_SOURCE_KINDS.Manual
            : PRODUCT_ANALYTICS_SOURCE_KINDS.History,
      },
    )
  }

  const handleHistoryStatusChange = (status: FilterStatus) => {
    if (status === filterStatus) {
      return
    }

    const nextItems = lastExecution
      ? filterExecutionItems(lastExecution.items, status, searchKeyword)
      : []
    setFilterStatus(status)
    trackInstantModelSyncAction(
      {
        ...resultsTableAnalyticsScope,
        actionId:
          PRODUCT_ANALYTICS_ACTION_IDS.FilterManagedSiteModelSyncResults,
      },
      {
        sourceKind: PRODUCT_ANALYTICS_SOURCE_KINDS.History,
        statusKind: getStatusKindFromFilterStatus(status),
        itemCount: nextItems.length,
      },
    )
  }

  const handleHistorySearchChange = (keyword: string) => {
    setSearchKeyword(keyword)
  }

  const handleManualSearchChange = (keyword: string) => {
    setManualSearchKeyword(keyword)
  }

  useEffect(() => {
    const normalizedKeyword = searchKeyword.trim()
    const resultCount = filteredItems?.length ?? 0
    const analyticsKey = normalizedKeyword
      ? `history:${normalizedKeyword}:${resultCount}`
      : "history:empty"

    if (historySearchAnalyticsKey.current === analyticsKey) {
      return
    }

    historySearchAnalyticsKey.current = analyticsKey

    if (!normalizedKeyword) {
      return
    }

    trackInstantModelSyncAction(
      {
        ...resultsTableAnalyticsScope,
        actionId:
          PRODUCT_ANALYTICS_ACTION_IDS.SearchManagedSiteModelSyncChannels,
      },
      {
        sourceKind: PRODUCT_ANALYTICS_SOURCE_KINDS.History,
        itemCount: resultCount,
      },
    )
  }, [filteredItems?.length, searchKeyword, trackInstantModelSyncAction])

  useEffect(() => {
    const normalizedKeyword = manualSearchKeyword.trim()
    const resultCount = manualItems.length
    const analyticsKey = normalizedKeyword
      ? `manual:${normalizedKeyword}:${resultCount}`
      : "manual:empty"

    if (manualSearchAnalyticsKey.current === analyticsKey) {
      return
    }

    manualSearchAnalyticsKey.current = analyticsKey

    if (!normalizedKeyword) {
      return
    }

    trackInstantModelSyncAction(
      {
        ...manualPanelAnalyticsScope,
        actionId:
          PRODUCT_ANALYTICS_ACTION_IDS.SearchManagedSiteModelSyncChannels,
      },
      {
        sourceKind: PRODUCT_ANALYTICS_SOURCE_KINDS.Manual,
        itemCount: resultCount,
      },
    )
  }, [manualItems.length, manualSearchKeyword, trackInstantModelSyncAction])

  const isInitialLoading = isLoading && lastExecution === null

  const hasHistory = !!(lastExecution && lastExecution.items.length > 0)
  const hasResults = !!(filteredItems && filteredItems.length > 0)
  const manualHasResults = manualItems.length > 0
  const historyTabLabel = t("execution.tabs.history")
  const manualTabLabel = t("execution.tabs.manual")

  const handleManualSelectAll = (checked: boolean) => {
    const itemCount = manualItems.length
    if (checked) {
      setManualSelectedKeys(
        new Set(manualItems.map(getModelSyncHistoryItemKey)),
      )
    } else {
      setManualSelectedKeys(new Set())
    }
    trackInstantModelSyncAction(
      {
        ...resultsTableAnalyticsScope,
        actionId:
          PRODUCT_ANALYTICS_ACTION_IDS.SelectAllManagedSiteModelSyncChannels,
      },
      {
        mode: PRODUCT_ANALYTICS_MODE_IDS.Selected,
        sourceKind: PRODUCT_ANALYTICS_SOURCE_KINDS.Manual,
        selectedCount: checked ? itemCount : 0,
        itemCount,
      },
    )
  }

  const handleManualSelectItem = (resourceKey: string, checked: boolean) => {
    const newSelected = new Set(manualSelectedKeys)
    if (checked) {
      newSelected.add(resourceKey)
    } else {
      newSelected.delete(resourceKey)
    }
    setManualSelectedKeys(newSelected)
    trackInstantModelSyncAction(
      {
        ...resultsTableAnalyticsScope,
        actionId:
          PRODUCT_ANALYTICS_ACTION_IDS.SelectAllManagedSiteModelSyncChannels,
      },
      {
        mode: PRODUCT_ANALYTICS_MODE_IDS.Single,
        sourceKind: PRODUCT_ANALYTICS_SOURCE_KINDS.Manual,
        selectedCount: newSelected.size,
        itemCount: manualItems.length,
      },
    )
  }

  const isAnySyncPending =
    exclusions.hasPendingSave ||
    activeAction !== null ||
    runningResourceKey !== null ||
    (progress?.isRunning ?? false)

  return {
    exclusions,
    manualExcludedOnly,
    setManualExcludedOnly,
    manualExcludedCount,
    selectedTab,
    handleTabChange,
    historyTabLabel,
    manualTabLabel,
    routeResourceUnavailable,
    isAnySyncPending,
    isLoading,
    isManualRefreshPending,
    activeAction,
    historySelectedKeys,
    retryableFailedRefs,
    handleRunAll,
    handleRunSelected,
    handleRetryFailed,
    handleRefresh,
    hasHistory,
    lastExecution,
    filterStatus,
    searchKeyword,
    handleHistoryStatusChange,
    handleHistorySearchChange,
    hasResults,
    filteredItems,
    handleHistorySelectAll,
    handleHistorySelectItem,
    handleRunSingle,
    runningResourceKey,
    canUseResource,
    manualSearchKeyword,
    handleManualSearchChange,
    isManualChannelRefresh,
    manualSelectedKeys,
    handleManualChannelRefresh,
    isChannelsLoading,
    manualHasResults,
    manualItems,
    handleManualSelectAll,
    handleManualSelectItem,
    channelsError,
    loadChannels,
    isInitialLoading,
    isModelSyncUnsupported,
    isConfigMissing,
    managedSiteType,
    isAutoSyncEnabled,
    intervalMs,
    nextScheduledAt,
    progress,
  }
}
