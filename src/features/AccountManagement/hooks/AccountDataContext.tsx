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
  DATA_TYPE_CREATED_AT,
  DATA_TYPE_INCOME,
} from "~/constants"
import { RuntimeActionIds } from "~/constants/runtimeActions"
import { useUserPreferencesContext } from "~/contexts/UserPreferencesContext"
import { accountStorage } from "~/services/accounts/accountStorage"
import { createDynamicSortComparator } from "~/services/preferences/utils/sortingPriority"
import {
  buildAccountSearchIndex,
  searchAccountSearchIndex,
} from "~/services/search/accountSearch"
import { tagStorage } from "~/services/tags/tagStorage"
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
} from "~/utils/browser/browserApi"
import { createLogger } from "~/utils/core/logger"
import { tryParseOrigin } from "~/utils/core/urlParsing"

/**
 * Unified logger scoped to account data context and refresh orchestration.
 */
const logger = createLogger("AccountDataContext")

/**
 * Replaces only IDs that belong to `subsetIdSet`, preserving non-subset IDs in place.
 */
function replaceIdListSubset(input: {
  existingIds: string[]
  subsetIdSet: Set<string>
  nextSubsetIds: string[]
}): string[] {
  const existingIds = Array.isArray(input.existingIds) ? input.existingIds : []
  const subsetIdSet = input.subsetIdSet

  const seenSubset = new Set<string>()
  const uniqueNextSubsetIds: string[] = []
  for (const raw of input.nextSubsetIds) {
    if (!subsetIdSet.has(raw)) continue
    if (seenSubset.has(raw)) continue
    seenSubset.add(raw)
    uniqueNextSubsetIds.push(raw)
  }

  const existingSubsetIds = existingIds.filter((id) => subsetIdSet.has(id))
  const missingExistingSubsetIds = existingSubsetIds.filter(
    (id) => !seenSubset.has(id),
  )
  const queue = [...uniqueNextSubsetIds, ...missingExistingSubsetIds]

  const result: string[] = []
  const seen = new Set<string>()
  let queueIndex = 0

  const takeNextSubset = () => {
    while (queueIndex < queue.length) {
      const next = queue[queueIndex]
      queueIndex += 1
      if (seen.has(next)) continue
      seen.add(next)
      return next
    }
    return null
  }

  for (const id of existingIds) {
    if (subsetIdSet.has(id)) {
      const next = takeNextSubset()
      if (next) {
        result.push(next)
      }
      continue
    }
    if (seen.has(id)) continue
    seen.add(id)
    result.push(id)
  }

  while (queueIndex < queue.length) {
    const next = takeNextSubset()
    if (!next) break
    result.push(next)
  }

  return result
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
  const [hasLoadedAccountData, setHasLoadedAccountData] = useState(false)
  const [hasResolvedInitialCurrentTab, setHasResolvedInitialCurrentTab] =
    useState(false)
  const [hasResolvedInitialOpenTabs, setHasResolvedInitialOpenTabs] =
    useState(false)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [isRefreshingDisabledAccounts, setIsRefreshingDisabledAccounts] =
    useState(false)
  const [prevTotalConsumption, setPrevTotalConsumption] =
    useState<CurrencyAmount>({ USD: 0, CNY: 0 })
  const [prevBalances, setPrevBalances] = useState<CurrencyAmountMap>({})
  const [sortField, setSortField] = useState<SortField>(initialSortField)
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
      accountStorage.convertToDisplayData(nextAccounts).map((site) => {
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

  const accountsRef = useRef<SiteAccount[]>([])
  accountsRef.current = accounts
  const hasLoadedAccountDataRef = useRef(false)
  hasLoadedAccountDataRef.current = hasLoadedAccountData
  const hasResolvedInitialCurrentTabRef = useRef(false)
  hasResolvedInitialCurrentTabRef.current = hasResolvedInitialCurrentTab
  const hasResolvedInitialOpenTabsRef = useRef(false)
  hasResolvedInitialOpenTabsRef.current = hasResolvedInitialOpenTabs

  const isInitialLoad =
    !hasLoadedAccountData ||
    !hasResolvedInitialCurrentTab ||
    !hasResolvedInitialOpenTabs

  const currentTabUserCacheRef = useRef<{
    tabId: number
    url: string
    userId: string | null
    attemptedAt: number
  } | null>(null)

  const currentTabCheckSeqRef = useRef(0)

  const checkCurrentTab = useCallback(async () => {
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

      const origin = parsedUrl.origin

      // Site-level detection: find any stored accounts that belong to the same origin.
      // This answers "does this site already exist in the user's accounts?".
      const originAccounts = accountsRef.current.filter((account) => {
        return tryParseOrigin(account.site_url) === origin
      })

      if (seq !== currentTabCheckSeqRef.current) return
      setDetectedSiteAccounts(originAccounts)

      // Dedupe based on tabId + full tabUrl to avoid duplicate checks when multiple tab events
      // fire in quick succession (e.g. onUpdated, onActivated).
      const cached = currentTabUserCacheRef.current
      const cacheMatches =
        cached && cached.tabId === tabId && cached.url === tabUrl
      if (!cacheMatches) {
        // Switching tabs/sites: clear the previous user-level match early to avoid stale UI highlights.
        setDetectedAccount(null)
      }

      if (originAccounts.length === 0) {
        // No accounts for this origin: nothing further to verify.
        currentTabUserCacheRef.current = null
        setDetectedAccount(null)
        return
      }

      const now = Date.now()
      const DEDUPE_MS = 1500

      // User-level detection: re-verify the website's current user ID (via content script) so we
      // can pick the *correct* stored account for multi-account scenarios on the same origin.
      const cachedUserId: string | null =
        cacheMatches && cached ? cached.userId : null

      let verifiedUserId: string | null = cachedUserId

      const shouldAttemptReadUserId =
        verifiedUserId === null &&
        (!cached || cached.tabId !== tabId || cached.url !== tabUrl) // new tab/url

      const shouldRetryReadUserId =
        verifiedUserId === null &&
        cached &&
        cached.tabId === tabId &&
        cached.url === tabUrl &&
        now - cached.attemptedAt > DEDUPE_MS

      if (shouldAttemptReadUserId || shouldRetryReadUserId) {
        // Record this attempt up-front so parallel tab events don't trigger another sendMessage.
        currentTabUserCacheRef.current = {
          tabId,
          url: tabUrl,
          userId: null,
          attemptedAt: now,
        }

        try {
          // Ask the content script to read the site's localStorage and return the current userId.
          const userResponse = await browser.tabs.sendMessage(tabId, {
            action: RuntimeActionIds.ContentGetUserFromLocalStorage,
            url: origin,
          })

          const userIdRaw = userResponse?.success
            ? userResponse?.data?.userId
            : null
          verifiedUserId =
            userIdRaw === undefined || userIdRaw === null
              ? null
              : String(userIdRaw)

          // Cache the verified user ID by tab+url to prevent duplicate reads.
          currentTabUserCacheRef.current = {
            tabId,
            url: tabUrl,
            userId: verifiedUserId,
            attemptedAt: now,
          }
        } catch (error) {
          logger.debug("Failed to re-verify website user ID from active tab", {
            tabId,
            origin,
            error,
          })
          verifiedUserId = null
          currentTabUserCacheRef.current = {
            tabId,
            url: tabUrl,
            userId: null,
            attemptedAt: now,
          }
        }
      }

      if (seq !== currentTabCheckSeqRef.current) return

      if (!verifiedUserId) {
        // We know the site exists in storage (originAccounts), but we can't confirm which login is active.
        setDetectedAccount(null)
        return
      }

      // If we can verify userId, match it to a specific stored account for this origin.
      const matchedAccount =
        originAccounts.find(
          (account) => String(account.account_info.id) === verifiedUserId,
        ) ?? null

      setDetectedAccount(matchedAccount)
    } catch (error) {
      logger.error("Error detecting current tab account", error)
      if (seq !== currentTabCheckSeqRef.current) return
      // Defensive reset to avoid leaving the UI in a partially-updated state.
      currentTabUserCacheRef.current = null
      setDetectedSiteAccounts([])
      setDetectedAccount(null)
    } finally {
      if (!hasResolvedInitialCurrentTabRef.current) {
        setHasResolvedInitialCurrentTab(true)
      }
      if (seq === currentTabCheckSeqRef.current) {
        setIsDetecting(false)
      }
    }
  }, [])

  const loadAccountData = useCallback(async () => {
    try {
      logger.debug("Loading account data")
      await accountStorage.resetExpiredCheckIns()
      const [
        allAccounts,
        allBookmarks,
        storedOrderedIds,
        accountStats,
        currentTagStore,
        pinnedIds,
      ] = await Promise.all([
        accountStorage.getAllAccounts(),
        accountStorage.getAllBookmarks(),
        accountStorage.getOrderedList(),
        accountStorage.getAccountStats(),
        tagStorage.getTagStore(),
        accountStorage.getPinnedList(),
      ])
      const displaySiteData = buildDisplayDataWithResolvedTags(
        allAccounts,
        currentTagStore,
      )

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
  }, [buildDisplayDataWithResolvedTags, prevTotalConsumption, prevBalances])

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

  const handleRefreshDisabledAccounts = useCallback(
    async (force: boolean = false) => {
      setIsRefreshingDisabledAccounts(true)
      try {
        const refreshResult = await accountStorage.refreshDisabledAccounts(force)
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
    if (!hasLoadedAccountData) {
      return
    }

    // Tab 激活变化时检测
    const cleanupActivated = onTabActivated(() => {
      void checkCurrentTab()
    })

    // Tab URL 或状态更新时检测（只对当前 tab）
    const cleanupUpdated = onTabUpdated(async (tabId) => {
      const tabs = await getActiveTabs()
      if (tabs[0]?.id === tabId) {
        void checkCurrentTab()
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

        const mergedAccounts = accountsRef.current.map(
          (account) => reloadedById[account.id] ?? account,
        )
        const knownIds = new Set(mergedAccounts.map((account) => account.id))
        for (const account of reloadedAccounts) {
          if (!knownIds.has(account.id)) {
            mergedAccounts.push(account)
          }
        }

        accountsRef.current = mergedAccounts
        setAccounts(mergedAccounts)
        setDisplayData(
          buildDisplayDataWithResolvedTags(mergedAccounts, tagStore),
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
  }, [buildDisplayDataWithResolvedTags, loadAccountData, tagStore])

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
        if (shouldUpdatePinnedOrder) {
          const didPersistPinned = await accountStorage.setPinnedListSubset({
            entryType: "account",
            ids: optimisticPinnedIds.filter((id) => allAccountIdSet.has(id)),
          })

          if (!didPersistPinned) {
            throw new Error("Failed to persist pinned account order")
          }
        }

        const didPersistOrder = await accountStorage.setOrderedListSubset({
          entryType: "account",
          ids: optimisticOrderedIds.filter((id) => allAccountIdSet.has(id)),
        })

        if (!didPersistOrder) {
          throw new Error("Failed to persist account order")
        }

        const [nextPinnedIds, nextOrderedIds] = await Promise.all([
          accountStorage.getPinnedList(),
          accountStorage.getOrderedList(),
        ])

        setPinnedAccountIds(nextPinnedIds)
        setOrderedAccountIds(nextOrderedIds)
      } catch (error) {
        logger.error("Failed to persist account reorder", { ids, error })
        setPinnedAccountIds(previousPinnedIds)
        setOrderedAccountIds(previousOrderedIds)
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
          const didPersistPinned = await accountStorage.setPinnedListSubset({
            entryType: "bookmark",
            ids: optimisticPinnedIds.filter((id) => allBookmarkIdSet.has(id)),
          })

          if (!didPersistPinned) {
            throw new Error("Failed to persist pinned bookmark order")
          }
        }

        const didPersistOrder = await accountStorage.setOrderedListSubset({
          entryType: "bookmark",
          ids: optimisticOrderedIds.filter((id) => allBookmarkIdSet.has(id)),
        })

        if (!didPersistOrder) {
          throw new Error("Failed to persist bookmark order")
        }

        const [nextPinnedIds, nextOrderedIds] = await Promise.all([
          accountStorage.getPinnedList(),
          accountStorage.getOrderedList(),
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
      isRefreshingDisabledAccounts,
      prevTotalConsumption,
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
      handleRefresh,
      handleRefreshDisabledAccounts,
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
      isRefreshingDisabledAccounts,
      prevTotalConsumption,
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
      handleRefresh,
      handleRefreshDisabledAccounts,
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
