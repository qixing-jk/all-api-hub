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
import toast from "react-hot-toast"
import { useTranslation } from "react-i18next" // 1. 定义 Context 的值类型

import {
  DATA_TYPE_BALANCE,
  DATA_TYPE_CONSUMPTION,
  DATA_TYPE_CREATED_AT,
  DATA_TYPE_INCOME,
} from "~/constants"
import { RuntimeActionIds } from "~/constants/runtimeActions"
import { useUserPreferencesContext } from "~/contexts/UserPreferencesContext"
import { readAccountBrowserIdentityFromTab } from "~/services/accountBrowserSession/identityReader"
import { replaceIdListSubset } from "~/services/accounts/accountEntryLayoutPolicy"
import { normalizeAccountIdentity } from "~/services/accounts/accountIdentity"
import { findAccountsBySiteIdentity } from "~/services/accounts/accountMatching"
import { resolveAccountSiteContentSessionHintForOrigin } from "~/services/accounts/accountSiteProfile"
import { isSameAccountSiteOrigin } from "~/services/accounts/accountSiteProfile/urls"
import { accountCheckInState } from "~/services/accounts/accountStorage/accountCheckInState"
import { accountEntryLayout } from "~/services/accounts/accountStorage/accountEntryLayout"
import { accountPresentation } from "~/services/accounts/accountStorage/accountPresentation"
import { accountQueries } from "~/services/accounts/accountStorage/accountQueries"
import { accountReadModels } from "~/services/accounts/accountStorage/accountReadModels"
import { accountRefresh } from "~/services/accounts/accountStorage/accountRefresh"
import { createEmptyAccountStats } from "~/services/accounts/accountTodayStats"
import { getDayKeyFromUnixSeconds } from "~/services/history/dailyBalanceHistory/dayKeys"
import { dailyBalanceHistoryStorage } from "~/services/history/dailyBalanceHistory/storage"
import {
  buildEstimatedTodayIncomeMoneyTotals,
  convertQuotaToMoney,
  estimateTodayIncomeForAccount,
} from "~/services/history/dailyBalanceHistory/todayIncomeEstimate"
import { createDynamicSortComparator } from "~/services/preferences/utils/sortingPriority"
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
import {
  buildAccountSearchIndex,
  searchAccountSearchIndex,
} from "~/services/search/accountSearch"
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
import { SortingCriteriaType } from "~/types/sorting"
import {
  getActiveTabs,
  getAllTabs,
  onRuntimeMessage,
  onTabActivated,
  onTabRemoved,
  onTabUpdated,
} from "~/utils/browser/browserApi"
import { getCurrentTempWindowRequestSource } from "~/utils/browser/tempWindowRequestSource"
import { createLogger } from "~/utils/core/logger"

/**
 * Unified logger scoped to account data context and refresh orchestration.
 */
const logger = createLogger("AccountDataContext")

const CURRENT_TAB_IDENTITY_CACHE_MS = 1500

type CurrentTabIdentityCache = {
  tabId: number
  url: string
  siteType: SiteAccount["site_type"]
  candidateUserIdsKey: string
  completedAt: number | null
  identity: Promise<string | null>
}

type TabCheckOptions = {
  force?: boolean
  pageIsLoading?: boolean
}

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
  const {
    currencyType,
    showTodayCashflow,
    sortField: initialSortField,
    sortOrder: initialSortOrder,
    updateSortConfig,
    sortingPriorityConfig,
    refreshOnOpen,
    preferences,
  } = useUserPreferencesContext()
  const estimatedTodayIncomeEnabled =
    preferences.balanceHistory?.estimatedTodayIncome?.enabled === true
  const [accounts, setAccounts] = useState<SiteAccount[]>([])
  const [bookmarks, setBookmarks] = useState<SiteBookmark[]>([])
  const [displayData, setDisplayData] = useState<DisplaySiteData[]>([])
  const [orderedAccountIds, setOrderedAccountIds] = useState<string[]>([])
  const [stats, setStats] = useState<AccountStats>(createEmptyAccountStats)
  const [lastUpdateTime, setLastUpdateTime] = useState<Date>()
  const [hasLoadedAccountData, setHasLoadedAccountData] = useState(false)
  const [hasResolvedInitialOpenTabs, setHasResolvedInitialOpenTabs] =
    useState(false)
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
  const [sortField, setSortField] = useState<ActiveSortField>(initialSortField)
  const [sortOrder, setSortOrder] = useState<SortOrder>(initialSortOrder)
  const [detectedSiteAccounts, setDetectedSiteAccounts] = useState<
    SiteAccount[]
  >([])
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
      >
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
  const hasResolvedInitialOpenTabsRef = useRef(false)
  hasResolvedInitialOpenTabsRef.current = hasResolvedInitialOpenTabs

  // Passive browser identity checks must not hold the saved-account list behind
  // a network request. Its optional current-account ordering can settle later.
  const isInitialLoad = !hasLoadedAccountData || !hasResolvedInitialOpenTabs

  const currentTabUserCacheRef = useRef<CurrentTabIdentityCache | null>(null)

  const currentTabCheckSeqRef = useRef(0)

  const checkCurrentTab = useCallback(async (options?: TabCheckOptions) => {
    // Guard against stale async updates: if a newer check starts while this one is awaiting,
    // this `seq` lets us no-op any state updates from older runs.
    const seq = (currentTabCheckSeqRef.current += 1)
    setIsDetecting(true)

    try {
      // Look up the currently active tab. We need both the URL (for origin matching) and the
      // tab ID (for messaging + deduping repeated checks for the same tab).
      const tabs = await getActiveTabs()
      const tab = tabs?.[0]
      const tabUrl = typeof tab?.url === "string" ? tab.url : null
      const tabId = typeof tab?.id === "number" ? tab.id : null

      if (!tabUrl || tabId === null) {
        if (seq !== currentTabCheckSeqRef.current) return
        // No valid tab context: clear both site-level and user-level detections.
        currentTabUserCacheRef.current = null
        setDetectedSiteAccounts([])
        setDetectedAccount(null)
        return
      }

      let parsedUrl: URL
      try {
        parsedUrl = new URL(tabUrl)
      } catch (error) {
        logger.debug("Failed to parse active tab URL", { tabUrl, error })
        if (seq !== currentTabCheckSeqRef.current) return
        // Invalid URL: clear detection to avoid showing stale state from a previous tab.
        currentTabUserCacheRef.current = null
        setDetectedSiteAccounts([])
        setDetectedAccount(null)
        return
      }

      if (parsedUrl.protocol !== "http:" && parsedUrl.protocol !== "https:") {
        if (seq !== currentTabCheckSeqRef.current) return
        // Non-web pages (chrome://, about:, etc.) can't be matched to stored site accounts.
        currentTabUserCacheRef.current = null
        setDetectedSiteAccounts([])
        setDetectedAccount(null)
        return
      }

      // Site-level detection: find any stored accounts that belong to the same origin.
      // This answers "does this site already exist in the user's accounts?".
      const originAccounts = accountsRef.current.filter((account) => {
        return isSameAccountSiteOrigin(
          {
            url: account.site_url,
            siteType: account.site_type,
          },
          { url: tabUrl },
        )
      })
      const siteTypeForUserRead =
        resolveAccountSiteContentSessionHintForOrigin({
          origin: parsedUrl.origin,
          candidateAccounts: originAccounts,
        }) ?? originAccounts[0]?.site_type

      if (seq !== currentTabCheckSeqRef.current) return
      setDetectedSiteAccounts(originAccounts)

      if (
        originAccounts.length === 0 ||
        options?.pageIsLoading ||
        tab.status === "loading"
      ) {
        // A loading page may still host the previous document. Invalidate its
        // identity now and wait for completion before contacting a content script.
        currentTabUserCacheRef.current = null
        setDetectedAccount(null)
        return
      }

      const candidateUserIds = [
        ...new Set(
          originAccounts
            .map((account) => normalizeAccountIdentity(account.account_info.id))
            .filter((id): id is string => id !== null),
        ),
      ].sort()
      const candidateUserIdsKey = JSON.stringify(candidateUserIds)
      let currentRead = currentTabUserCacheRef.current
      const isSameReadContext =
        currentRead?.tabId === tabId &&
        currentRead.url === tabUrl &&
        currentRead.siteType === siteTypeForUserRead &&
        currentRead.candidateUserIdsKey === candidateUserIdsKey
      const canReuseRead =
        !options?.force &&
        isSameReadContext &&
        currentRead &&
        (currentRead.completedAt === null ||
          Date.now() - currentRead.completedAt < CURRENT_TAB_IDENTITY_CACHE_MS)

      if (!currentRead || !canReuseRead) {
        // Preserve the last ordering during a same-page passive check. Apply a
        // changed or unconfirmed identity when that check settles, without flicker.
        if (!isSameReadContext) setDetectedAccount(null)
        // Cache the promise so a newer tab event waits for the same verification.
        // Completion only updates this entry, never a later tab's cache.
        const entry: CurrentTabIdentityCache = {
          tabId,
          url: tabUrl,
          siteType: siteTypeForUserRead,
          candidateUserIdsKey,
          completedAt: null,
          identity: readAccountBrowserIdentityFromTab({
            tabId,
            baseUrl: parsedUrl.origin,
            siteType: siteTypeForUserRead,
            candidateUserIds,
          }).then((userId) => {
            entry.completedAt = Date.now()
            return userId
          }),
        }
        currentRead = entry
        currentTabUserCacheRef.current = entry
      }

      const verifiedUserId = await currentRead.identity
      if (seq !== currentTabCheckSeqRef.current) return

      if (!verifiedUserId) {
        // We know the site exists in storage (originAccounts), but we can't confirm which login is active.
        setDetectedAccount(null)
        return
      }

      // If we can verify userId, match it to a specific stored account for this origin.
      const matchedAccount =
        findAccountsBySiteIdentity({
          accounts: originAccounts,
          siteUrl: tabUrl,
          userId: verifiedUserId,
        })[0] ?? null

      setDetectedAccount(matchedAccount)
    } catch (error) {
      logger.error("Error detecting current tab account", error)
      if (seq !== currentTabCheckSeqRef.current) return
      // Defensive reset to avoid leaving the UI in a partially-updated state.
      currentTabUserCacheRef.current = null
      setDetectedSiteAccounts([])
      setDetectedAccount(null)
    } finally {
      if (seq === currentTabCheckSeqRef.current) {
        setIsDetecting(false)
      }
    }
  }, [])

  const loadAccountData = useCallback(async () => {
    try {
      logger.debug("Loading account data")
      await accountCheckInState.resetExpiredCheckIns()
      const [accountSnapshot, currentTagStore, balanceHistoryStore] =
        await Promise.all([
          accountReadModels.getAccountManagementSnapshot(),
          tagStorage.getTagStore(),
          dailyBalanceHistoryStorage.getStore(),
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

      setOrderedAccountIds(storedOrderedIds.filter((id) => entryIdSet.has(id)))

      setPinnedAccountIds(pinnedIds.filter((id) => entryIdSet.has(id)))

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

  useEffect(() => {
    if (!hasLoadedAccountData) {
      return
    }

    // Tab 激活变化时检测
    const cleanupActivated = onTabActivated(() => {
      void checkCurrentTab({ force: true })
    })

    // Tab URL 或状态更新时检测（只对当前 tab）
    const cleanupUpdated = onTabUpdated(async (tabId, changeInfo) => {
      const tabs = await getActiveTabs()
      if (tabs[0]?.id === tabId) {
        void checkCurrentTab({
          force:
            changeInfo.status === "complete" ||
            typeof changeInfo.url === "string",
          pageIsLoading: changeInfo.status === "loading",
        })
      }
    })

    // 清理监听器
    return () => {
      cleanupActivated()
      cleanupUpdated()
    }
  }, [checkCurrentTab, hasLoadedAccountData])

  useEffect(() => {
    if (!hasLoadedAccountData) {
      return
    }

    // accounts refresh/update may change origin matches; re-check current tab to keep UI hints accurate.
    void checkCurrentTab()
  }, [accounts, checkCurrentTab, hasLoadedAccountData])

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

        const reloadedAccounts = await Promise.all(
          uniqueIds.map(async (accountId) => {
            const account = await accountQueries.getAccountById(accountId)
            if (!account) {
              throw new Error(`Account not found: ${accountId}`)
            }
            return account
          }),
        )
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
        const balanceHistoryStore = await dailyBalanceHistoryStorage.getStore()
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
        newOrder = field === DATA_TYPE_CREATED_AT ? "desc" : "asc"
        setSortField(field)
        setSortOrder(newOrder)
      }
      updateSortConfig(field, newOrder)
    },
    [showTodayCashflow, sortField, sortOrder, updateSortConfig],
  )

  const clearSortConfig = useCallback(() => {
    setSortField(null)
    void updateSortConfig(null, sortOrder)
  }, [sortOrder, updateSortConfig])

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
      const visibleAccountIdSet = new Set(ids)
      const allAccountIdSet = new Set(displayData.map((account) => account.id))
      const pinnedSegment = ids.filter((id) => pinnedSet.has(id))
      const nonPinnedSegment = ids.filter((id) => !pinnedSet.has(id))
      const merged = [...pinnedSegment, ...nonPinnedSegment]
      const previousPinnedIds = pinnedAccountIds
      const previousOrderedIds = orderedAccountIds

      // Check if pinned order has changed
      const pinnedAccountsInState = pinnedAccountIds.filter((id) =>
        visibleAccountIdSet.has(id),
      )
      const shouldUpdatePinnedOrder =
        pinnedSegment.length > 0 &&
        pinnedSegment.length === pinnedAccountsInState.length &&
        pinnedSegment.some((id, index) => id !== pinnedAccountsInState[index])

      const optimisticPinnedIds = shouldUpdatePinnedOrder
        ? replaceIdListSubset({
            existingIds: previousPinnedIds,
            subsetIdSet: visibleAccountIdSet,
            nextSubsetIds: pinnedSegment,
          })
        : previousPinnedIds
      const optimisticOrderedIds = replaceIdListSubset({
        existingIds: previousOrderedIds,
        subsetIdSet: visibleAccountIdSet,
        nextSubsetIds: merged,
      })

      setPinnedAccountIds(optimisticPinnedIds)
      setOrderedAccountIds(optimisticOrderedIds)

      try {
        const didPersistOrder = await accountEntryLayout.setAccountListOrder({
          pinnedIds: optimisticPinnedIds.filter((id) =>
            allAccountIdSet.has(id),
          ),
          orderedIds: optimisticOrderedIds.filter((id) =>
            allAccountIdSet.has(id),
          ),
        })

        if (!didPersistOrder) {
          throw new Error("Failed to persist account order")
        }
      } catch (error) {
        logger.error("Failed to persist account reorder", { ids, error })
        setPinnedAccountIds(previousPinnedIds)
        setOrderedAccountIds(previousOrderedIds)
        throw error
      }

      try {
        const [nextPinnedIds, nextOrderedIds] = await Promise.all([
          accountEntryLayout.getPinnedList(),
          accountEntryLayout.getOrderedList(),
        ])

        setPinnedAccountIds(nextPinnedIds)
        setOrderedAccountIds(nextOrderedIds)
      } catch (error) {
        logger.warn("Persisted account reorder but failed to refresh order", {
          error,
        })
      }
    },
    [displayData, orderedAccountIds, pinnedAccountIds],
  )

  const handleBookmarkReorder = useCallback(
    async (ids: string[]) => {
      const pinnedSet = new Set(pinnedAccountIds)
      const visibleBookmarkIdSet = new Set(ids)
      const allBookmarkIdSet = new Set(bookmarks.map((bookmark) => bookmark.id))
      const pinnedSegment = ids.filter((id) => pinnedSet.has(id))
      const nonPinnedSegment = ids.filter((id) => !pinnedSet.has(id))
      const merged = [...pinnedSegment, ...nonPinnedSegment]
      const previousPinnedIds = pinnedAccountIds
      const previousOrderedIds = orderedAccountIds

      const pinnedBookmarksInState = pinnedAccountIds.filter((id) =>
        visibleBookmarkIdSet.has(id),
      )

      const shouldUpdatePinnedOrder =
        pinnedSegment.length > 0 &&
        pinnedSegment.length === pinnedBookmarksInState.length &&
        pinnedSegment.some((id, index) => id !== pinnedBookmarksInState[index])

      const optimisticPinnedIds = shouldUpdatePinnedOrder
        ? replaceIdListSubset({
            existingIds: previousPinnedIds,
            subsetIdSet: visibleBookmarkIdSet,
            nextSubsetIds: pinnedSegment,
          })
        : previousPinnedIds
      const optimisticOrderedIds = replaceIdListSubset({
        existingIds: previousOrderedIds,
        subsetIdSet: visibleBookmarkIdSet,
        nextSubsetIds: merged,
      })

      setPinnedAccountIds(optimisticPinnedIds)
      setOrderedAccountIds(optimisticOrderedIds)

      try {
        if (shouldUpdatePinnedOrder) {
          const didPersistPinned = await accountEntryLayout.setPinnedListSubset(
            {
              entryType: "bookmark",
              ids: optimisticPinnedIds.filter((id) => allBookmarkIdSet.has(id)),
            },
          )

          if (!didPersistPinned) {
            throw new Error("Failed to persist pinned bookmark order")
          }
        }

        const didPersistOrder = await accountEntryLayout.setOrderedListSubset({
          entryType: "bookmark",
          ids: optimisticOrderedIds.filter((id) => allBookmarkIdSet.has(id)),
        })

        if (!didPersistOrder) {
          throw new Error("Failed to persist bookmark order")
        }

        const [nextPinnedIds, nextOrderedIds] = await Promise.all([
          accountEntryLayout.getPinnedList(),
          accountEntryLayout.getOrderedList(),
        ])

        setPinnedAccountIds(nextPinnedIds)
        setOrderedAccountIds(nextOrderedIds)
      } catch (error) {
        logger.error("Failed to persist bookmark reorder", { ids, error })
        setPinnedAccountIds(previousPinnedIds)
        setOrderedAccountIds(previousOrderedIds)
      }
    },
    [bookmarks, orderedAccountIds, pinnedAccountIds],
  )

  // State to hold matched account scores from open tabs
  const [matchedAccountScores, setMatchedAccountScores] = useState<
    Record<string, number>
  >({})
  const indexedDisplayData = useMemo(
    () => buildAccountSearchIndex(displayData),
    [displayData],
  )

  // Check and match open tabs with accounts
  const checkOpenTabs = useCallback(async () => {
    try {
      const tabs = await getAllTabs()
      if (!tabs || tabs.length === 0 || indexedDisplayData.length === 0) {
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
          const results = searchAccountSearchIndex(
            indexedDisplayData,
            searchQuery,
          )

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
    } finally {
      if (!hasResolvedInitialOpenTabsRef.current) {
        setHasResolvedInitialOpenTabs(true)
      }
    }
  }, [indexedDisplayData])

  // Update matched scores when displayData changes or tabs change
  useEffect(() => {
    if (!hasLoadedAccountData) {
      return
    }

    void checkOpenTabs()

    // Listen for tab changes
    const cleanupActivated = onTabActivated(() => {
      if (!hasLoadedAccountDataRef.current) {
        return
      }
      void checkOpenTabs()
    })

    const cleanupUpdated = onTabUpdated(() => {
      if (!hasLoadedAccountDataRef.current) {
        return
      }
      void checkOpenTabs()
    })

    const cleanupRemoved = onTabRemoved(() => {
      if (!hasLoadedAccountDataRef.current) {
        return
      }
      void checkOpenTabs()
    })

    return () => {
      cleanupActivated()
      cleanupUpdated()
      cleanupRemoved()
    }
  }, [checkOpenTabs, hasLoadedAccountData])

  const isAccountPinned = useCallback(
    (id: string) => pinnedAccountIds.includes(id),
    [pinnedAccountIds],
  )

  const pinAccount = useCallback(async (id: string) => {
    const success = await accountEntryLayout.pinAccount(id)
    if (success) {
      setPinnedAccountIds((prev) => [
        id,
        ...prev.filter((pinnedId) => pinnedId !== id),
      ])
    }
    return success
  }, [])

  const unpinAccount = useCallback(async (id: string) => {
    const success = await accountEntryLayout.unpinAccount(id)
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
      isRefreshingDisabledAccounts,
      prevTotalConsumption,
      todayIncomeEstimateTotals,
      prevBalances,
      detectedSiteAccounts,
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
