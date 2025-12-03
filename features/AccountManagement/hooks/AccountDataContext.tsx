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

import { useUserPreferencesContext } from "~/contexts/UserPreferencesContext"
import { accountStorage } from "~/services/accountStorage"
import { searchAccounts } from "~/services/search/accountSearch"
import type {
  AccountStats,
  CurrencyAmount,
  CurrencyAmountMap,
  DisplaySiteData,
  SiteAccount,
  SortField,
  SortOrder,
} from "~/types"
import {
  getActiveTabs,
  getAllTabs,
  onRuntimeMessage,
  onTabActivated,
  onTabRemoved,
  onTabUpdated,
} from "~/utils/browserApi"
import { createDynamicSortComparator } from "~/utils/sortingPriority"

// 1. 定义 Context 的值类型
interface AccountDataContextType {
  accounts: SiteAccount[]
  displayData: DisplaySiteData[]
  sortedData: DisplaySiteData[]
  stats: AccountStats
  lastUpdateTime: Date | undefined
  isInitialLoad: boolean
  isRefreshing: boolean
  prevTotalConsumption: CurrencyAmount
  prevBalances: CurrencyAmountMap
  detectedAccount: SiteAccount | null
  isDetecting: boolean
  pinnedAccountIds: string[]
  availableTags: string[]
  tagCounts: Record<string, number>
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
    sortField: initialSortField,
    sortOrder: initialSortOrder,
    updateSortConfig,
    sortingPriorityConfig,
    refreshOnOpen,
  } = useUserPreferencesContext()
  const [accounts, setAccounts] = useState<SiteAccount[]>([])
  const [displayData, setDisplayData] = useState<DisplaySiteData[]>([])
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
      console.error("Error detecting current tab account:", error)
      setDetectedAccount(null)
    } finally {
      setIsDetecting(false)
    }
    // 确保展示数据刷新时，会重新检测
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [displayData])

  const loadAccountData = useCallback(async () => {
    try {
      console.log("[AccountContext] Loading account data...")
      await accountStorage.resetExpiredCheckIns()
      const allAccounts = await accountStorage.getAllAccounts()
      const accountStats = await accountStorage.getAccountStats()
      const displaySiteData = accountStorage.convertToDisplayData(
        allAccounts,
      ) as DisplaySiteData[]

      if (!isInitialLoad) {
        setPrevTotalConsumption(prevTotalConsumption)
        setPrevBalances(prevBalances)
      }

      setAccounts(allAccounts)
      setStats(accountStats)
      setDisplayData(displaySiteData)

      const pinnedIds = await accountStorage.getPinnedList()
      const validPinnedIds = pinnedIds.filter((id) =>
        displaySiteData.some((site) => site.id === id),
      )
      setPinnedAccountIds(validPinnedIds)

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
      console.error("Failed to load account data:", error)
    }
  }, [isInitialLoad, prevTotalConsumption, prevBalances])

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
        console.error("Failed to refresh data:", error)
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
        console.log("[Popup] 打开插件时自动刷新已启用，开始刷新")
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
                console.log("[Popup] 打开插件时自动刷新完成")
                return t("refresh.refreshSuccess")
              },
              error: t("refresh.refreshFailed"),
            })
          } else {
            await handleRefresh(false)
          }
        } catch (error) {
          console.error("[Popup] 打开插件时自动刷新失败:", error)
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
    return onRuntimeMessage((message: any) => {
      if (
        message.type === "AUTO_REFRESH_UPDATE" &&
        message.payload.type === "refresh_completed"
      ) {
        console.log(
          "[AccountContext] Background refresh completed, reloading data.",
        )
        loadAccountData()
      }
    })
  }, [loadAccountData])

  const handleSort = useCallback(
    (field: SortField) => {
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
    [sortField, sortOrder, updateSortConfig],
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
      console.error("Error matching open tabs:", error)
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
    const comparator = createDynamicSortComparator(
      sortingPriorityConfig,
      detectedAccount,
      sortField,
      currencyType,
      sortOrder,
      matchedAccountScores,
      pinnedAccountIds,
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
  ])

  const { availableTags, tagCounts } = useMemo(() => {
    const counts: Record<string, number> = {}

    for (const item of displayData) {
      const tags = item.tags || []
      for (const tag of tags) {
        if (!tag) continue
        counts[tag] = (counts[tag] ?? 0) + 1
      }
    }

    return {
      availableTags: Object.keys(counts),
      tagCounts: counts,
    }
  }, [displayData])

  const value = useMemo(
    () => ({
      accounts,
      displayData,
      sortedData,
      stats,
      lastUpdateTime,
      isInitialLoad,
      isRefreshing,
      prevTotalConsumption,
      prevBalances,
      detectedAccount,
      isDetecting,
      pinnedAccountIds,
      availableTags,
      tagCounts,
      isAccountPinned,
      pinAccount,
      unpinAccount,
      togglePinAccount,
      loadAccountData,
      handleRefresh,
      handleSort,
      sortField,
      sortOrder,
    }),
    [
      accounts,
      displayData,
      sortedData,
      stats,
      lastUpdateTime,
      isInitialLoad,
      isRefreshing,
      prevTotalConsumption,
      prevBalances,
      detectedAccount,
      isDetecting,
      pinnedAccountIds,
      availableTags,
      tagCounts,
      isAccountPinned,
      pinAccount,
      unpinAccount,
      togglePinAccount,
      loadAccountData,
      handleRefresh,
      handleSort,
      sortField,
      sortOrder,
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
