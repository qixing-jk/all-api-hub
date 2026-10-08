import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react"
import { useTranslation } from "react-i18next" // 1. 定义 Context 的值类型

import { useUserPreferencesContext } from "~/contexts/UserPreferencesContext"
import toast from "~/lib/notify"
import { accountRefresh } from "~/services/accounts/accountStorage/accountRefresh"
import { type AccountContextBoost } from "~/services/preferences/utils/sortingPriority"
import {
  createAutomaticProtectionBypassExecution,
  withProtectionBypassUserCommand,
} from "~/services/protectionBypass/client"
import {
  PROTECTION_BYPASS_AUTOMATIC_TRIGGERS,
  PROTECTION_BYPASS_FEATURES,
  PROTECTION_BYPASS_USER_COMMANDS,
  type ProtectionBypassExecution,
} from "~/services/protectionBypass/contracts"
import type {
  AccountStats,
  ActiveSortField,
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
import { getCurrentTempWindowRequestSource } from "~/utils/browser/tempWindowRequestSource"
import { createLogger } from "~/utils/core/logger"

import { useAccountBrowsingContext } from "./useAccountBrowsingContext"
import { useAccountEntryLayout } from "./useAccountEntryLayout"
import { useAccountSnapshot } from "./useAccountSnapshot"

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
  isRefreshingDisabledAccounts: boolean
  prevTotalConsumption: CurrencyAmount
  todayIncomeEstimateTotals: {
    trusted: CurrencyAmount
    estimated: CurrencyAmount | null
    availableAccounts: number
    totalAccounts: number
  }
  prevBalances: CurrencyAmountMap
  /**
   * Accounts that share the same origin with the current active tab (site-level match).
   *
   * This indicates "having an account on this site", regardless of which user is currently logged in.
   */
  detectedSiteAccounts: SiteAccount[]
  /**
   * The specific account that matches the currently logged-in website user (user-level match).
   *
   * This is stricter than {@link detectedSiteAccounts} and requires verifying the website user ID.
   */
  detectedAccount: SiteAccount | null
  getAccountContextBoost: (id: string) => AccountContextBoost | undefined
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
  reloadAccountsById: (accountIds: string[]) => Promise<void>
  handleRefresh: (force?: boolean) => Promise<{
    success: number
    failed: number
    latestSyncTime?: number
    refreshedCount: number
  }>
  handleRefreshDisabledAccounts: (force?: boolean) => Promise<{
    processedCount: number
    failedCount: number
    reEnabledCount: number
    latestSyncTime?: number
  }>
  handleSort: (field: SortField) => void
  clearSortConfig: () => void
  sortField: ActiveSortField
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
  const { refreshOnOpen, preferences } = useUserPreferencesContext()
  const estimatedTodayIncomeEnabled =
    preferences.balanceHistory?.estimatedTodayIncome?.enabled === true
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [isRefreshingDisabledAccounts, setIsRefreshingDisabledAccounts] =
    useState(false)
  const refreshCommandRef = useRef<{
    promise: ReturnType<typeof accountRefresh.refreshAllAccounts>
    force: boolean
  } | null>(null)
  const refreshDisabledCommandRef = useRef<{
    promise: ReturnType<typeof accountRefresh.refreshDisabledAccounts>
    force: boolean
  } | null>(null)
  const isPinFeatureEnabled = true
  const isManualSortFeatureEnabled = true
  const {
    accounts,
    bookmarks,
    displayData,
    stats,
    lastUpdateTime,
    hasLoadedAccountData,
    prevTotalConsumption,
    todayIncomeEstimateTotals,
    prevBalances,
    tagStore,
    tags,
    tagCountsById,
    entryLayoutSnapshot,
    createTag,
    renameTag,
    deleteTag,
    loadAccountData,
    reloadAccountsById,
    recordRefreshTime,
  } = useAccountSnapshot({ estimatedTodayIncomeEnabled, refreshKey })

  const {
    detectedSiteAccounts,
    detectedAccount,
    isDetecting,
    matchedTabTiers,
    hasResolvedInitialOpenTabs,
  } = useAccountBrowsingContext({
    accounts,
    displayData,
    enabled: hasLoadedAccountData,
  })

  const {
    orderedAccountIds,
    pinnedAccountIds,
    sortedData,
    getAccountContextBoost,
    sortField,
    sortOrder,
    handleSort,
    clearSortConfig,
    handleReorder,
    handleBookmarkReorder,
    isAccountPinned,
    pinAccount,
    unpinAccount,
    togglePinAccount,
  } = useAccountEntryLayout({
    displayData,
    bookmarks,
    detectedAccount,
    matchedTabTiers,
    snapshot: entryLayoutSnapshot,
  })

  // Passive browser identity checks must not hold the saved-account list behind
  // a network request. Its optional current-account ordering can settle later.
  const isInitialLoad = !hasLoadedAccountData || !hasResolvedInitialOpenTabs

  const refreshAccounts = useCallback(
    async (
      execution: ProtectionBypassExecution,
      force: boolean = false,
      tempWindowRequestSource = getCurrentTempWindowRequestSource(),
    ) => {
      setIsRefreshing(true)
      try {
        const refreshResult = await accountRefresh.refreshAllAccounts(force, {
          tempWindowRequestSource,
          protectionBypassExecution: execution,
        })
        await loadAccountData()
        recordRefreshTime(refreshResult.latestSyncTime)
        return refreshResult
      } catch (error) {
        logger.error("Failed to refresh data", error)
        await loadAccountData()
        throw error
      } finally {
        setIsRefreshing(false)
      }
    },
    [loadAccountData, recordRefreshTime],
  )

  const handleRefresh = useCallback(
    async (force: boolean = false) => {
      while (refreshCommandRef.current) {
        const activeRefresh = refreshCommandRef.current
        if (!force || activeRefresh.force) {
          return await activeRefresh.promise
        }
        try {
          await activeRefresh.promise
        } catch {
          // A forced user request still gets its own attempt after an earlier failure.
        }
      }

      const tempWindowRequestSource = getCurrentTempWindowRequestSource()
      setIsRefreshing(true)
      const refreshPromise = withProtectionBypassUserCommand(
        PROTECTION_BYPASS_USER_COMMANDS.RefreshAllAccounts,
        tempWindowRequestSource,
        async (execution) =>
          await refreshAccounts(execution, force, tempWindowRequestSource),
      )
      refreshCommandRef.current = { promise: refreshPromise, force }
      try {
        return await refreshPromise
      } finally {
        if (refreshCommandRef.current?.promise === refreshPromise) {
          refreshCommandRef.current = null
          setIsRefreshing(false)
        }
      }
    },
    [refreshAccounts],
  )

  const handleRefreshDisabledAccounts = useCallback(
    async (force: boolean = false) => {
      while (refreshDisabledCommandRef.current) {
        const activeRefresh = refreshDisabledCommandRef.current
        if (!force || activeRefresh.force) {
          return await activeRefresh.promise
        }
        try {
          await activeRefresh.promise
        } catch {
          // A forced user request still gets its own attempt after an earlier failure.
        }
      }

      const tempWindowRequestSource = getCurrentTempWindowRequestSource()
      setIsRefreshingDisabledAccounts(true)
      const refreshPromise = withProtectionBypassUserCommand(
        PROTECTION_BYPASS_USER_COMMANDS.RefreshDisabledAccounts,
        tempWindowRequestSource,
        async (execution) => {
          setIsRefreshingDisabledAccounts(true)
          try {
            const refreshResult = await accountRefresh.refreshDisabledAccounts(
              force,
              {
                tempWindowRequestSource,
                protectionBypassExecution: execution,
              },
            )
            await loadAccountData()
            recordRefreshTime(refreshResult.latestSyncTime)
            return refreshResult
          } catch (error) {
            logger.error("Failed to refresh disabled accounts", error)
            await loadAccountData()
            throw error
          } finally {
            setIsRefreshingDisabledAccounts(false)
          }
        },
      )
      refreshDisabledCommandRef.current = { promise: refreshPromise, force }
      try {
        return await refreshPromise
      } finally {
        if (refreshDisabledCommandRef.current?.promise === refreshPromise) {
          refreshDisabledCommandRef.current = null
          setIsRefreshingDisabledAccounts(false)
        }
      }
    },
    [loadAccountData, recordRefreshTime],
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
          const tempWindowRequestSource = getCurrentTempWindowRequestSource()
          const execution = createAutomaticProtectionBypassExecution(
            PROTECTION_BYPASS_FEATURES.AccountRefresh,
            PROTECTION_BYPASS_AUTOMATIC_TRIGGERS.UiLifecycle,
            tempWindowRequestSource,
          )
          if (toast) {
            await toast.promise(
              refreshAccounts(execution, false, tempWindowRequestSource),
              {
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
              },
            )
          } else {
            await refreshAccounts(execution, false, tempWindowRequestSource)
          }
        } catch (error) {
          logger.error("打开插件时自动刷新失败", error)
        }
      }
    }

    handleRefreshOnOpen()
  }, [refreshAccounts, refreshOnOpen, t])

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
      isRefreshingDisabledAccounts,
      prevTotalConsumption,
      todayIncomeEstimateTotals,
      prevBalances,
      detectedSiteAccounts,
      detectedAccount,
      getAccountContextBoost,
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
      reloadAccountsById,
      handleRefresh,
      handleRefreshDisabledAccounts,
      handleSort,
      clearSortConfig,
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
      isRefreshingDisabledAccounts,
      prevTotalConsumption,
      todayIncomeEstimateTotals,
      prevBalances,
      detectedSiteAccounts,
      detectedAccount,
      getAccountContextBoost,
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
      reloadAccountsById,
      handleRefresh,
      handleRefreshDisabledAccounts,
      handleSort,
      clearSortConfig,
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
