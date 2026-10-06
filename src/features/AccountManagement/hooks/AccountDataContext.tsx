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

import { RuntimeActionIds } from "~/constants/runtimeActions"
import { useUserPreferencesContext } from "~/contexts/UserPreferencesContext"
import toast from "~/lib/notify"
import { accountCheckInState } from "~/services/accounts/accountStorage/accountCheckInState"
import { accountPresentation } from "~/services/accounts/accountStorage/accountPresentation"
import { accountQueries } from "~/services/accounts/accountStorage/accountQueries"
import { accountReadModels } from "~/services/accounts/accountStorage/accountReadModels"
import { accountRefresh } from "~/services/accounts/accountStorage/accountRefresh"
import { createEmptyAccountStats } from "~/services/accounts/accountTodayStats"
import { dailyBalanceHistoryStorage } from "~/services/history/dailyBalanceHistory/storage"
import {
  buildEstimatedTodayIncomeMoneyTotals,
  convertQuotaToMoney,
  estimateTodayIncomeForAccount,
} from "~/services/history/dailyBalanceHistory/todayIncomeEstimate"
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
import { tagStorage } from "~/services/tags/tagStorage"
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
import { TODAY_INCOME_ESTIMATE_STATUS } from "~/types/dailyBalanceHistory"
import { onRuntimeMessage } from "~/utils/browser/browserApi"
import { getCurrentTempWindowRequestSource } from "~/utils/browser/tempWindowRequestSource"
import { getDayKeyFromUnixSeconds } from "~/utils/core/dayKey"
import { createLogger } from "~/utils/core/logger"

import { useAccountBrowsingContext } from "./useAccountBrowsingContext"
import { useAccountEntryLayout } from "./useAccountEntryLayout"

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
  const [accounts, setAccounts] = useState<SiteAccount[]>([])
  const [bookmarks, setBookmarks] = useState<SiteBookmark[]>([])
  const [displayData, setDisplayData] = useState<DisplaySiteData[]>([])
  const [stats, setStats] = useState<AccountStats>(createEmptyAccountStats)
  const [lastUpdateTime, setLastUpdateTime] = useState<Date>()
  const [hasLoadedAccountData, setHasLoadedAccountData] = useState(false)
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
  const [prevTotalConsumption, setPrevTotalConsumption] =
    useState<CurrencyAmount>({ USD: 0, CNY: 0 })
  const [todayIncomeEstimateTotals, setTodayIncomeEstimateTotals] = useState<
    AccountDataContextType["todayIncomeEstimateTotals"]
  >({
    trusted: { USD: 0, CNY: 0 },
    estimated: null,
    availableAccounts: 0,
    totalAccounts: 0,
  })
  const [prevBalances, setPrevBalances] = useState<CurrencyAmountMap>({})
  const [tagStore, setTagStore] = useState<TagStore>({
    version: 1,
    tagsById: {},
  })
  const [tags, setTags] = useState<Tag[]>([])

  const isPinFeatureEnabled = true
  const isManualSortFeatureEnabled = true

  const buildDisplayDataWithResolvedTags = useCallback(
    (nextAccounts: SiteAccount[], currentTagStore: TagStore) =>
      accountPresentation.convertToDisplayData(nextAccounts).map((site) => {
        const tagIds = site.tagIds ?? []
        const resolvedNames = tagIds
          .map((id) => currentTagStore.tagsById[id]?.name)
          .filter((name): name is string => Boolean(name))
        return {
          ...site,
          tagIds,
          tags: resolvedNames.length > 0 ? resolvedNames : site.tags,
        }
      }),
    [],
  )

  const buildDisplayDataWithBalanceHistory = useCallback(
    (params: {
      nextAccounts: SiteAccount[]
      currentTagStore: TagStore
      balanceHistoryStore: Awaited<
        ReturnType<typeof dailyBalanceHistoryStorage.getStore>
      > | null
      todayKey: string
    }) => {
      const estimatedByAccountId = new Map<string, CurrencyAmount | null>()

      for (const account of params.nextAccounts) {
        const estimate = estimateTodayIncomeForAccount({
          enabled:
            estimatedTodayIncomeEnabled &&
            account.disabled !== true &&
            account.excludeFromTodayIncome !== true,
          store: params.balanceHistoryStore,
          account,
          currentDayKey: params.todayKey,
        })

        estimatedByAccountId.set(
          account.id,
          estimate.status === TODAY_INCOME_ESTIMATE_STATUS.available &&
            estimate.estimatedTodayIncome !== null
            ? convertQuotaToMoney({
                quota: estimate.estimatedTodayIncome,
                exchangeRate: account.exchange_rate,
              })
            : null,
        )
      }

      return buildDisplayDataWithResolvedTags(
        params.nextAccounts,
        params.currentTagStore,
      ).map((site) => ({
        ...site,
        estimatedTodayIncome: estimatedByAccountId.get(site.id) ?? null,
      }))
    },
    [buildDisplayDataWithResolvedTags, estimatedTodayIncomeEnabled],
  )

  const accountsRef = useRef<SiteAccount[]>([])
  accountsRef.current = accounts
  const targetedReloadGenerationRef = useRef(0)
  const targetedReloadGenerationByAccountIdRef = useRef<Record<string, number>>(
    {},
  )
  const hasLoadedAccountDataRef = useRef(false)
  hasLoadedAccountDataRef.current = hasLoadedAccountData

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
    syncEntryLayout,
  } = useAccountEntryLayout({
    displayData,
    bookmarks,
    detectedAccount,
    matchedTabTiers,
  })

  // Passive browser identity checks must not hold the saved-account list behind
  // a network request. Its optional current-account ordering can settle later.
  const isInitialLoad = !hasLoadedAccountData || !hasResolvedInitialOpenTabs

  const loadAccountData = useCallback(async () => {
    try {
      logger.debug("Loading account data")
      await accountCheckInState.resetExpiredCheckIns()
      const [accountSnapshot, currentTagStore, balanceHistoryStore] =
        await Promise.all([
          accountReadModels.getAccountManagementSnapshot(),
          tagStorage.getTagStore(),
          estimatedTodayIncomeEnabled
            ? dailyBalanceHistoryStorage.getStore()
            : null,
        ])
      const {
        accounts: allAccounts,
        bookmarks: allBookmarks,
        orderedIds: storedOrderedIds,
        stats: accountStats,
        pinnedIds,
      } = accountSnapshot
      const todayKey = getDayKeyFromUnixSeconds(Math.floor(Date.now() / 1000))
      const displaySiteData = buildDisplayDataWithBalanceHistory({
        nextAccounts: allAccounts,
        currentTagStore,
        balanceHistoryStore,
        todayKey,
      })

      setTagStore(currentTagStore)
      setTags(
        Object.values(currentTagStore.tagsById).sort((a, b) =>
          a.name.localeCompare(b.name, undefined, { sensitivity: "base" }),
        ),
      )

      if (hasLoadedAccountDataRef.current) {
        setPrevTotalConsumption(prevTotalConsumption)
        setPrevBalances(prevBalances)
      }

      setAccounts(allAccounts)
      setBookmarks(allBookmarks)
      setStats(accountStats)
      setDisplayData(displaySiteData)
      const enabledAccounts = allAccounts.filter(
        (account) =>
          account.disabled !== true && account.excludeFromTodayIncome !== true,
      )
      setTodayIncomeEstimateTotals(
        buildEstimatedTodayIncomeMoneyTotals({
          enabled: estimatedTodayIncomeEnabled,
          store: balanceHistoryStore,
          accounts: enabledAccounts,
          currentDayKey: todayKey,
        }),
      )

      const entryIdSet = new Set<string>([
        ...displaySiteData.map((site) => site.id),
        ...allBookmarks.map((bookmark) => bookmark.id),
      ])

      syncEntryLayout({
        orderedIds: storedOrderedIds.filter((id) => entryIdSet.has(id)),
      })

      syncEntryLayout({
        pinnedIds: pinnedIds.filter((id) => entryIdSet.has(id)),
      })

      if (allAccounts.length > 0) {
        const latestSyncTime = Math.max(
          ...allAccounts.map((acc) => acc.last_sync_time),
        )
        if (latestSyncTime > 0) {
          setLastUpdateTime(new Date(latestSyncTime))
        }
      }
    } catch (error) {
      logger.error("Failed to load account data", error)
    } finally {
      if (!hasLoadedAccountDataRef.current) {
        setHasLoadedAccountData(true)
      }
    }
  }, [
    buildDisplayDataWithBalanceHistory,
    syncEntryLayout,
    estimatedTodayIncomeEnabled,
    prevTotalConsumption,
    prevBalances,
  ])

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
            if (refreshResult.latestSyncTime > 0) {
              setLastUpdateTime(new Date(refreshResult.latestSyncTime))
            }
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

  useEffect(() => {
    loadAccountData()
  }, [loadAccountData, refreshKey])

  const reloadAccountsById = useCallback(
    async (accountIds: string[]) => {
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
        const reloadGeneration = targetedReloadGenerationRef.current + 1
        targetedReloadGenerationRef.current = reloadGeneration
        for (const accountId of uniqueIds) {
          targetedReloadGenerationByAccountIdRef.current[accountId] =
            reloadGeneration
        }

        // Each single-account query reads the complete storage envelope. Read
        // batches once to avoid repeating that work for every updated account.
        const [singleId] = uniqueIds
        const storedAccounts =
          uniqueIds.length === 1 && singleId !== undefined
            ? [await accountQueries.getAccountById(singleId)]
            : await accountQueries.getAllAccounts()
        const storedById = new Map(
          storedAccounts
            .filter((account): account is SiteAccount => account !== null)
            .map((account) => [account.id, account]),
        )
        const reloadedAccounts = uniqueIds.map((accountId) => {
          const account = storedById.get(accountId)
          if (!account) {
            throw new Error(`Account not found: ${accountId}`)
          }
          return account
        })
        const activeReloadedAccounts = reloadedAccounts.filter(
          (account) =>
            targetedReloadGenerationByAccountIdRef.current[account.id] ===
            reloadGeneration,
        )
        if (activeReloadedAccounts.length === 0) {
          return
        }

        const reloadedById = Object.fromEntries(
          activeReloadedAccounts.map((account) => [account.id, account]),
        )

        const mergedAccounts = accountsRef.current.map(
          (account) => reloadedById[account.id] ?? account,
        )
        const knownIds = new Set(mergedAccounts.map((account) => account.id))
        for (const account of activeReloadedAccounts) {
          if (!knownIds.has(account.id)) {
            mergedAccounts.push(account)
          }
        }

        accountsRef.current = mergedAccounts
        setAccounts(mergedAccounts)
        const balanceHistoryStore = estimatedTodayIncomeEnabled
          ? await dailyBalanceHistoryStorage.getStore()
          : null
        const todayKey = getDayKeyFromUnixSeconds(Math.floor(Date.now() / 1000))
        const latestActiveReloadedAccounts = activeReloadedAccounts.filter(
          (account) =>
            targetedReloadGenerationByAccountIdRef.current[account.id] ===
            reloadGeneration,
        )
        if (latestActiveReloadedAccounts.length === 0) {
          return
        }

        const latestReloadedById = Object.fromEntries(
          latestActiveReloadedAccounts.map((account) => [account.id, account]),
        )
        const latestAccounts = accountsRef.current
        const latestKnownIds = new Set(
          latestAccounts.map((account) => account.id),
        )
        const latestMergedAccounts = latestAccounts.map(
          (account) => latestReloadedById[account.id] ?? account,
        )
        for (const account of latestActiveReloadedAccounts) {
          if (!latestKnownIds.has(account.id)) {
            latestMergedAccounts.push(account)
          }
        }

        accountsRef.current = latestMergedAccounts
        setAccounts(latestMergedAccounts)
        setDisplayData(
          buildDisplayDataWithBalanceHistory({
            nextAccounts: latestMergedAccounts,
            currentTagStore: tagStore,
            balanceHistoryStore,
            todayKey,
          }),
        )
        const enabledAccounts = latestMergedAccounts.filter(
          (account) =>
            account.disabled !== true &&
            account.excludeFromTodayIncome !== true,
        )
        setTodayIncomeEstimateTotals(
          buildEstimatedTodayIncomeMoneyTotals({
            enabled: estimatedTodayIncomeEnabled,
            store: balanceHistoryStore,
            accounts: enabledAccounts,
            currentDayKey: todayKey,
          }),
        )
        for (const account of latestActiveReloadedAccounts) {
          if (
            targetedReloadGenerationByAccountIdRef.current[account.id] ===
            reloadGeneration
          ) {
            delete targetedReloadGenerationByAccountIdRef.current[account.id]
          }
        }
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
    },
    [
      buildDisplayDataWithBalanceHistory,
      estimatedTodayIncomeEnabled,
      loadAccountData,
      tagStore,
    ],
  )

  // 监听后台自动刷新的更新通知
  useEffect(() => {
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

      if (
        message?.action === RuntimeActionIds.AutoCheckinRunCompleted ||
        message?.action === RuntimeActionIds.AccountRefreshCompleted
      ) {
        const updatedAccountIds = Array.isArray(message.updatedAccountIds)
          ? message.updatedAccountIds
          : []
        void reloadAccountsById(updatedAccountIds)
      }
    })
  }, [loadAccountData, reloadAccountsById])

  // State to hold related-page match tiers from open tabs
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
