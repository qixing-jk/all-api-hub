import {
  createContext,
  ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react"
import toast from "react-hot-toast"
import { useTranslation } from "react-i18next" // 1. 定义 Context 的值类型

import {
  DATA_TYPE_BALANCE,
  DATA_TYPE_CONSUMPTION,
  DATA_TYPE_INCOME,
} from "~/constants"
import { RuntimeActionIds } from "~/constants/runtimeActions"
import { useUserPreferencesContext } from "~/contexts/UserPreferencesContext"
import { accountStorage } from "~/services/accountStorage"
import { tagStorage } from "~/services/accountTags/tagStorage"
import { searchAccounts } from "~/services/search/accountSearch"
import type {
  AccountStats,
  CurrencyAmount,
  CurrencyAmountMap,
  DisplaySiteData,
  SiteAccount,
  SiteBookmark,
  SortField,
  SortOrder,
  Tag,
  TagStore,
} from "~/types"
import { SortingCriteriaType } from "~/types/sorting"
import {
  getActiveTabs,
  getAllTabs,
  onRuntimeMessage,
  onTabActivated,
  onTabRemoved,
  onTabUpdated,
} from "~/utils/browserApi"
import { createLogger } from "~/utils/logger"
import { createDynamicSortComparator } from "~/utils/sortingPriority"

/**
 * Unified logger scoped to account data context and refresh orchestration.
 */
const logger = createLogger("AccountDataContext")

// 1. 定义 Context 的值类型
interface AccountDataContextType {
  accounts: SiteAccount[]
  bookmarks: SiteBookmark[]
  displayData: DisplaySiteData[]
  sortedData: DisplaySiteData[]
  orderedAccountIds: string[]
  stats: AccountStats
  lastUpdateTime: Date | undefined
  isInitialLoad: boolean
  isRefreshing: boolean
  prevTotalConsumption: CurrencyAmount
  prevBalances: CurrencyAmountMap
  detectedAccount: SiteAccount | null
  isDetecting: boolean
  pinnedAccountIds: string[]
  tagStore: TagStore
  tags: Tag[]
  tagCountsById: Record<string, number>
  createTag: (name: string) => Promise<Tag>
  renameTag: (tagId: string, name: string) => Promise<Tag>
  deleteTag: (tagId: string) => Promise<{ updatedAccounts: number }>
  handleReorder: (ids: string[]) => Promise<void>
  handleBookmarkReorder: (ids: string[]) => Promise<void>
  isAccountPinned: (id: string) => boolean
  pinAccount: (id: string) => Promise<boolean>
  unpinAccount: (id: string) => Promise<boolean>
  togglePinAccount: (id: string) => Promise<boolean>
  loadAccountData: () => Promise<void>
  handleRefresh: (
    force?: boolean,
  ) => Promise<{ success: number; failed: number; latestSyncTime?: number }>
  handleSort: (field: SortField) => void
  sortField: SortField
  sortOrder: SortOrder
  isPinFeatureEnabled: boolean
  isManualSortFeatureEnabled: boolean
}

// 2. 创建 Context
const AccountDataContext = createContext<AccountDataContextType | undefined>(
  undefined,
)

// 3. 创建 Provider 组件
export const AccountDataProvider = ({
  children,
  refreshKey,
}: {
  children: ReactNode
  refreshKey?: number
}) => {
  const { t } = useTranslation("account")
  const {
    currencyType,
    showTodayCashflow,
    sortField: initialSortField,
    sortOrder: initialSortOrder,
    updateSortConfig,
    sortingPriorityConfig,
    refreshOnOpen,
  } = useUserPreferencesContext()
  const [accounts, setAccounts] = useState<SiteAccount[]>([])
  const [bookmarks, setBookmarks] = useState<SiteBookmark[]>([])
  const [displayData, setDisplayData] = useState<DisplaySiteData[]>([])
  const [orderedAccountIds, setOrderedAccountIds] = useState<string[]>([])
  const [stats, setStats] = useState<AccountStats>({
    total_quota: 0,
    today_total_consumption: 0,
    today_total_requests: 0,
    today_total_prompt_tokens: 0,
    today_total_completion_tokens: 0,
    today_total_income: 0,
  })
  const [lastUpdateTime, setLastUpdateTime] = useState<Date>()
  const [isInitialLoad, setIsInitialLoad] = useState(true)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [prevTotalConsumption, setPrevTotalConsumption] =
    useState<CurrencyAmount>({ USD: 0, CNY: 0 })
  const [prevBalances, setPrevBalances] = useState<CurrencyAmountMap>({})
  const [sortField, setSortField] = useState<SortField>(initialSortField)
  const [sortOrder, setSortOrder] = useState<SortOrder>(initialSortOrder)
  const [detectedAccount, setDetectedAccount] = useState<SiteAccount | null>(
    null,
  )
  const [isDetecting, setIsDetecting] = useState(true)
  const [pinnedAccountIds, setPinnedAccountIds] = useState<string[]>([])
  const [tagStore, setTagStore] = useState<TagStore>({
    version: 1,
    tagsById: {},
  })
  const [tags, setTags] = useState<Tag[]>([])

  const isPinFeatureEnabled = useMemo(
    () =>
      sortingPriorityConfig.criteria.some(
        (item) =>
          item.id === SortingCriteriaType.PINNED && item.enabled === true,
      ),
    [sortingPriorityConfig],
  )

  const isManualSortFeatureEnabled = useMemo(
    () =>
      sortingPriorityConfig.criteria.some(
        (item) =>
          item.id === SortingCriteriaType.MANUAL_ORDER && item.enabled === true,
      ),
    [sortingPriorityConfig],
  )

  const checkCurrentTab = useCallback(async () => {
    setIsDetecting(true)
    try {
      const tabs = await getActiveTabs()

      if (tabs && tabs.length > 0 && tabs[0]?.url) {
        const existingAccount = await accountStorage.checkUrlExists(tabs[0].url)
        setDetectedAccount(existingAccount)
      } else {
        setDetectedAccount(null)
      }
    } catch (error) {
      logger.error("Error detecting current tab account", error)
      setDetectedAccount(null)
    } finally {
      setIsDetecting(false)
    }
    // 确保展示数据刷新时，会重新检测
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [displayData])

  const loadAccountData = useCallback(async () => {
    try {
      logger.debug("Loading account data")
      await accountStorage.resetExpiredCheckIns()
      const allAccounts = await accountStorage.getAllAccounts()
      const allBookmarks = await accountStorage.getAllBookmarks()
      const storedOrderedIds = await accountStorage.getOrderedList()
      const accountStats = await accountStorage.getAccountStats()
      const currentTagStore = await tagStorage.getTagStore()
      const displaySiteData = (
        accountStorage.convertToDisplayData(allAccounts) as DisplaySiteData[]
      ).map((site) => {
        const tagIds = site.tagIds ?? []
        const resolvedNames = tagIds
          .map((id) => currentTagStore.tagsById[id]?.name)
          .filter((name): name is string => Boolean(name))
        return {
          ...site,
          tagIds,
          tags: resolvedNames.length > 0 ? resolvedNames : site.tags,
        }
      })

      setTagStore(currentTagStore)
      setTags(
        Object.values(currentTagStore.tagsById).sort((a, b) =>
          a.name.localeCompare(b.name, undefined, { sensitivity: "base" }),
        ),
      )

      if (!isInitialLoad) {
        setPrevTotalConsumption(prevTotalConsumption)
        setPrevBalances(prevBalances)
      }

      setAccounts(allAccounts)
      setBookmarks(allBookmarks)
      setStats(accountStats)
      setDisplayData(displaySiteData)

      const entryIdSet = new Set<string>([
        ...displaySiteData.map((site) => site.id),
        ...allBookmarks.map((bookmark) => bookmark.id),
      ])

      setOrderedAccountIds(storedOrderedIds.filter((id) => entryIdSet.has(id)))

      const pinnedIds = await accountStorage.getPinnedList()
      setPinnedAccountIds(pinnedIds.filter((id) => entryIdSet.has(id)))

      if (allAccounts.length > 0) {
        const latestSyncTime = Math.max(
          ...allAccounts.map((acc) => acc.last_sync_time),
        )
        if (latestSyncTime > 0) {
          setLastUpdateTime(new Date(latestSyncTime))
        }
      }

      if (isInitialLoad) {
        setIsInitialLoad(false)
      }
    } catch (error) {
      logger.error("Failed to load account data", error)
    }
  }, [isInitialLoad, prevTotalConsumption, prevBalances])

  /**
   * Tag CRUD actions exposed to UIs (AccountDialog, filters).
   *
   * These delegate to tagStorage, then reload account/tag data so all views stay
   * consistent across global rename/delete operations.
   */
  const createTag = useCallback(
    async (name: string) => {
      const created = await tagStorage.createTag(name)
      await loadAccountData()
      return created
    },
    [loadAccountData],
  )

  const renameTag = useCallback(
    async (tagId: string, name: string) => {
      const updated = await tagStorage.renameTag(tagId, name)
      await loadAccountData()
      return updated
    },
    [loadAccountData],
  )

  const deleteTag = useCallback(
    async (tagId: string) => {
      const result = await tagStorage.deleteTag(tagId)
      await loadAccountData()
      return result
    },
    [loadAccountData],
  )

  const handleRefresh = useCallback(
    async (force: boolean = false) => {
      setIsRefreshing(true)
      try {
        const refreshResult = await accountStorage.refreshAllAccounts(force)
        await loadAccountData()
        if (refreshResult.latestSyncTime > 0) {
          setLastUpdateTime(new Date(refreshResult.latestSyncTime))
        }
        return refreshResult
      } catch (error) {
        logger.error("Failed to refresh data", error)
        await loadAccountData()
        throw error
      } finally {
        setIsRefreshing(false)
      }
    },
    [loadAccountData],
  )

  const hasRefreshedOnOpen = useRef(false)

  // 处理打开插件时自动刷新
  useEffect(() => {
    const handleRefreshOnOpen = async () => {
      // 如果已经执行过，直接返回
      if (hasRefreshedOnOpen.current) {
        return
      }

      // 检查是否启用了打开插件时自动刷新
      if (refreshOnOpen) {
        hasRefreshedOnOpen.current = true // 标记已执行
        logger.info("打开插件时自动刷新已启用，开始刷新")
        try {
          if (toast) {
            await toast.promise(handleRefresh(false), {
              loading: t("refresh.refreshingAll"),
              success: (result) => {
                if (result.failed > 0) {
                  return t("refresh.refreshComplete", {
                    success: result.success,
                    failed: result.failed,
                  })
                }
                const sum = result.success + result.failed

                // 避免无账号时，进行成功提示
                if (sum === 0) {
                  return null
                }

                const { refreshedCount } = result
                if (refreshedCount < sum) {
                  return t("refresh.refreshPartialSkipped", {
                    success: refreshedCount,
                    skipped: sum - refreshedCount,
                  })
                }
                logger.debug("打开插件时自动刷新完成")
                return t("refresh.refreshSuccess")
              },
              error: t("refresh.refreshFailed"),
            })
          } else {
            await handleRefresh(false)
          }
        } catch (error) {
          logger.error("打开插件时自动刷新失败", error)
        }
      }
    }

    handleRefreshOnOpen()
  }, [handleRefresh, refreshOnOpen, t])

  useEffect(() => {
    loadAccountData()
  }, [loadAccountData, refreshKey])

  useEffect(() => {
    // 打开 popup 时立即检测一次
    checkCurrentTab()

    // Tab 激活变化时检测
    const cleanupActivated = onTabActivated(() => {
      checkCurrentTab()
    })

    // Tab URL 或状态更新时检测（只对当前 tab）
    const cleanupUpdated = onTabUpdated(async (tabId) => {
      const tabs = await getActiveTabs()
      if (tabs[0]?.id === tabId) {
        checkCurrentTab()
      }
    })

    // 清理监听器
    return () => {
      cleanupActivated()
      cleanupUpdated()
    }
  }, [checkCurrentTab])

  // 监听后台自动刷新的更新通知
  useEffect(() => {
    const reloadAccountsById = async (accountIds: string[]) => {
      const uniqueIds = Array.from(
        new Set(
          accountIds.filter(
            (id): id is string => typeof id === "string" && id.length > 0,
          ),
        ),
      )

      if (uniqueIds.length === 0) {
        return
      }

      try {
        const reloadedAccounts = await Promise.all(
          uniqueIds.map(async (accountId) => {
            const account = await accountStorage.getAccountById(accountId)
            if (!account) {
              throw new Error(`Account not found: ${accountId}`)
            }
            return account
          }),
        )

        const reloadedById = Object.fromEntries(
          reloadedAccounts.map((account) => [account.id, account]),
        )

        const displayUpdates = accountStorage.convertToDisplayData(
          reloadedAccounts,
        ) as DisplaySiteData[]
        const displayById = Object.fromEntries(
          displayUpdates.map((display) => [display.id, display]),
        )

        setAccounts((prev) =>
          prev.map((account) => reloadedById[account.id] ?? account),
        )
        setDisplayData((prev) =>
          prev.map((display) => displayById[display.id] ?? display),
        )
      } catch (error) {
        logger.warn(
          "Account-scoped reload failed; falling back to full reload",
          {
            accountIds: uniqueIds,
            error,
          },
        )
        await loadAccountData()
      }
    }

    return onRuntimeMessage((message: any) => {
      if (
        message.type === "AUTO_REFRESH_UPDATE" &&
        message.payload.type === "refresh_completed"
      ) {
        logger.debug("Background refresh completed, reloading data")
        loadAccountData()
      }
      if (message.type === "TAG_STORE_UPDATE") {
        logger.debug("Tag store updated, reloading data")
        loadAccountData()
      }

      if (message?.action === RuntimeActionIds.AutoCheckinRunCompleted) {
        const updatedAccountIds = Array.isArray(message.updatedAccountIds)
          ? message.updatedAccountIds
          : []
        void reloadAccountsById(updatedAccountIds)
      }
    })
  }, [loadAccountData])

  const handleSort = useCallback(
    (field: SortField) => {
      if (
        showTodayCashflow === false &&
        (field === DATA_TYPE_CONSUMPTION || field === DATA_TYPE_INCOME)
      ) {
        return
      }

      let newOrder: SortOrder
      if (sortField === field) {
        newOrder = sortOrder === "asc" ? "desc" : "asc"
        setSortOrder(newOrder)
      } else {
        newOrder = "asc"
        setSortField(field)
        setSortOrder(newOrder)
      }
      updateSortConfig(field, newOrder)
    },
    [showTodayCashflow, sortField, sortOrder, updateSortConfig],
  )

  useEffect(() => {
    if (showTodayCashflow !== false) return

    if (sortField !== DATA_TYPE_CONSUMPTION && sortField !== DATA_TYPE_INCOME) {
      return
    }

    const fallbackField: SortField = DATA_TYPE_BALANCE
    setSortField(fallbackField)
    void updateSortConfig(fallbackField, sortOrder)
  }, [showTodayCashflow, sortField, sortOrder, updateSortConfig])

  const handleReorder = useCallback(
    async (ids: string[]) => {
      // Ensure pinned accounts stay at top but allow pinned relative order to follow ids
      const pinnedSet = new Set(pinnedAccountIds)
      const accountIdSet = new Set(ids)
      const pinnedSegment = ids.filter((id) => pinnedSet.has(id))
      const nonPinnedSegment = ids.filter((id) => !pinnedSet.has(id))
      const merged = [...pinnedSegment, ...nonPinnedSegment]

      // Check if pinned order has changed
      const pinnedAccountsInState = pinnedAccountIds.filter((id) =>
        accountIdSet.has(id),
      )
      const shouldUpdatePinnedOrder =
        pinnedSegment.length > 0 &&
        pinnedSegment.length === pinnedAccountsInState.length &&
        pinnedSegment.some((id, index) => id !== pinnedAccountsInState[index])

      if (shouldUpdatePinnedOrder) {
        await accountStorage.setPinnedListSubset({
          entryType: "account",
          ids: pinnedSegment,
        })
      }

      // Update overall order
      await accountStorage.setOrderedListSubset({
        entryType: "account",
        ids: merged,
      })

      const [nextPinnedIds, nextOrderedIds] = await Promise.all([
        accountStorage.getPinnedList(),
        accountStorage.getOrderedList(),
      ])

      setPinnedAccountIds(nextPinnedIds)
      setOrderedAccountIds(nextOrderedIds)
    },
    [pinnedAccountIds],
  )

  const handleBookmarkReorder = useCallback(
    async (ids: string[]) => {
      const pinnedSet = new Set(pinnedAccountIds)
      const bookmarkIdSet = new Set(ids)
      const pinnedSegment = ids.filter((id) => pinnedSet.has(id))
      const nonPinnedSegment = ids.filter((id) => !pinnedSet.has(id))
      const merged = [...pinnedSegment, ...nonPinnedSegment]

      const pinnedBookmarksInState = pinnedAccountIds.filter((id) =>
        bookmarkIdSet.has(id),
      )

      const shouldUpdatePinnedOrder =
        pinnedSegment.length > 0 &&
        pinnedSegment.length === pinnedBookmarksInState.length &&
        pinnedSegment.some((id, index) => id !== pinnedBookmarksInState[index])

      if (shouldUpdatePinnedOrder) {
        await accountStorage.setPinnedListSubset({
          entryType: "bookmark",
          ids: pinnedSegment,
        })
      }

      await accountStorage.setOrderedListSubset({
        entryType: "bookmark",
        ids: merged,
      })

      const [nextPinnedIds, nextOrderedIds] = await Promise.all([
        accountStorage.getPinnedList(),
        accountStorage.getOrderedList(),
      ])

      setPinnedAccountIds(nextPinnedIds)
      setOrderedAccountIds(nextOrderedIds)
    },
    [pinnedAccountIds],
  )

  // State to hold matched account scores from open tabs
  const [matchedAccountScores, setMatchedAccountScores] = useState<
    Record<string, number>
  >({})

  // Check and match open tabs with accounts
  const checkOpenTabs = useCallback(async () => {
    try {
      const tabs = await getAllTabs()
      if (!tabs || tabs.length === 0 || displayData.length === 0) {
        setMatchedAccountScores({})
        return
      }

      const scores: Record<string, number> = {}

      // For each tab, try to match with accounts
      for (const tab of tabs) {
        if (!tab.url && !tab.title) continue

        // Combine URL and title for search query
        for (const searchQuery of [tab.url, tab.title]) {
          if (!searchQuery) continue

          // Search accounts using the combined query
          const results = searchAccounts(displayData, searchQuery)

          // Accumulate scores for matched accounts
          results.forEach((result) => {
            const accountId = result.account.id
            scores[accountId] = (scores[accountId] || 0) + result.score
          })
        }
      }

      setMatchedAccountScores(scores)
    } catch (error) {
      logger.error("Error matching open tabs", error)
      setMatchedAccountScores({})
    }
  }, [displayData])

  // Update matched scores when displayData changes or tabs change
  useEffect(() => {
    void checkOpenTabs()

    // Listen for tab changes
    const cleanupActivated = onTabActivated(() => {
      void checkOpenTabs()
    })

    const cleanupUpdated = onTabUpdated(() => {
      void checkOpenTabs()
    })

    const cleanupRemoved = onTabRemoved(() => {
      void checkOpenTabs()
    })

    return () => {
      cleanupActivated()
      cleanupUpdated()
      cleanupRemoved()
    }
  }, [checkOpenTabs])

  const isAccountPinned = useCallback(
    (id: string) => pinnedAccountIds.includes(id),
    [pinnedAccountIds],
  )

  const pinAccount = useCallback(async (id: string) => {
    const success = await accountStorage.pinAccount(id)
    if (success) {
      setPinnedAccountIds((prev) => [
        id,
        ...prev.filter((pinnedId) => pinnedId !== id),
      ])
    }
    return success
  }, [])

  const unpinAccount = useCallback(async (id: string) => {
    const success = await accountStorage.unpinAccount(id)
    if (success) {
      setPinnedAccountIds((prev) => prev.filter((pinnedId) => pinnedId !== id))
    }
    return success
  }, [])

  const togglePinAccount = useCallback(
    async (id: string) => {
      if (isAccountPinned(id)) {
        return unpinAccount(id)
      }
      return pinAccount(id)
    },
    [isAccountPinned, pinAccount, unpinAccount],
  )

  const sortedData = useMemo(() => {
    const manualOrderIndices: Record<string, number> = {}
    orderedAccountIds.forEach((id, index) => {
      manualOrderIndices[id] = index
    })
    const comparator = createDynamicSortComparator(
      sortingPriorityConfig,
      detectedAccount,
      sortField,
      currencyType,
      sortOrder,
      matchedAccountScores,
      pinnedAccountIds,
      manualOrderIndices,
    )
    return [...displayData].sort(comparator)
  }, [
    displayData,
    sortingPriorityConfig,
    detectedAccount,
    sortField,
    currencyType,
    sortOrder,
    matchedAccountScores,
    pinnedAccountIds,
    orderedAccountIds,
  ])

  const tagCountsById = useMemo(() => {
    const counts: Record<string, number> = {}

    for (const item of displayData) {
      const ids = item.tagIds || []
      for (const id of ids) {
        if (!id) continue
        counts[id] = (counts[id] ?? 0) + 1
      }
    }

    return counts
  }, [displayData])

  const value = useMemo(
    () => ({
      accounts,
      bookmarks,
      displayData,
      sortedData,
      orderedAccountIds,
      stats,
      lastUpdateTime,
      isInitialLoad,
      isRefreshing,
      prevTotalConsumption,
      prevBalances,
      detectedAccount,
      isDetecting,
      pinnedAccountIds,
      tagStore,
      tags,
      tagCountsById,
      createTag,
      renameTag,
      deleteTag,
      handleReorder,
      handleBookmarkReorder,
      isAccountPinned,
      pinAccount,
      unpinAccount,
      togglePinAccount,
      loadAccountData,
      handleRefresh,
      handleSort,
      sortField,
      sortOrder,
      isPinFeatureEnabled,
      isManualSortFeatureEnabled,
    }),
    [
      accounts,
      bookmarks,
      displayData,
      sortedData,
      orderedAccountIds,
      stats,
      lastUpdateTime,
      isInitialLoad,
      isRefreshing,
      prevTotalConsumption,
      prevBalances,
      detectedAccount,
      isDetecting,
      pinnedAccountIds,
      tagStore,
      tags,
      tagCountsById,
      createTag,
      renameTag,
      deleteTag,
      handleReorder,
      handleBookmarkReorder,
      isAccountPinned,
      pinAccount,
      unpinAccount,
      togglePinAccount,
      loadAccountData,
      handleRefresh,
      handleSort,
      sortField,
      sortOrder,
      isPinFeatureEnabled,
      isManualSortFeatureEnabled,
    ],
  )

  return (
    <AccountDataContext.Provider value={value}>
      {children}
    </AccountDataContext.Provider>
  )
}

// 4. 创建自定义 Hook
export const useAccountDataContext = () => {
  const context = useContext(AccountDataContext)
  if (
    context === undefined ||
    !context.loadAccountData ||
    !context.handleRefresh ||
    !context.handleSort
  ) {
    throw new Error(
      "useAccountDataContext must be used within a AccountDataProvider and have all required functions",
    )
  }
  return context
}
