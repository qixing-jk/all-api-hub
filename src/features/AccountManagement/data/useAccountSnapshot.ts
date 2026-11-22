import { useCallback, useEffect, useMemo, useRef, useState } from "react"

import { RuntimeActionIds } from "~/constants/runtimeActions"
import { useLocalDayChange } from "~/hooks/useLocalDayChange"
import { accountCheckInState } from "~/services/accounts/accountStorage/accountCheckInState"
import { accountPresentation } from "~/services/accounts/accountStorage/accountPresentation"
import { accountQueries } from "~/services/accounts/accountStorage/accountQueries"
import { accountReadModels } from "~/services/accounts/accountStorage/accountReadModels"
import { createEmptyAccountStats } from "~/services/accounts/metrics/accountTodayStats"
import { buildNetInflowTotals } from "~/services/accounts/metrics/netInflowTotals"
import {
  AUTO_REFRESH_UPDATE_MESSAGE_TYPE,
  AUTO_REFRESH_UPDATE_TYPES,
} from "~/services/accounts/refresh/constants"
import { dailyBalanceHistoryStorage } from "~/services/history/dailyBalanceHistory/storage"
import { estimateTodayIncomeForAccount } from "~/services/history/dailyBalanceHistory/todayIncomeEstimate"
import { tagStorage } from "~/services/tags/tagStorage"
import type {
  AccountStats,
  CurrencyAmount,
  CurrencyAmountMap,
  DisplaySiteData,
  SiteAccount,
  SiteBookmark,
  Tag,
  TagStore,
} from "~/types"
import type { TodayIncomeEstimateResult } from "~/types/dailyBalanceHistory"
import { onRuntimeMessage } from "~/utils/browser/runtimeMessages"
import { getDayKeyFromUnixSeconds } from "~/utils/core/dayKey"
import { createLogger } from "~/utils/core/logger"

/** Account reads, visible projections and per-account reload ordering share one owner. */
const logger = createLogger("AccountDataContext")

/** Optional history failure must not prevent current saved-account data from loading. */
async function readBalanceHistoryForEstimates(enabled: boolean) {
  try {
    return {
      store: enabled ? await dailyBalanceHistoryStorage.getStore() : null,
      unavailable: false,
    }
  } catch (error) {
    logger.warn("Balance history unavailable for net inflow estimates", error)
    return { store: null, unavailable: true }
  }
}

/** Load and project saved-account facts while preserving reload ordering. */
export function useAccountSnapshot({
  estimatedTodayIncomeEnabled,
  refreshKey,
}: {
  estimatedTodayIncomeEnabled: boolean
  refreshKey?: number
}) {
  const [accounts, setAccounts] = useState<SiteAccount[]>([])
  const [bookmarks, setBookmarks] = useState<SiteBookmark[]>([])
  const [displayData, setDisplayData] = useState<DisplaySiteData[]>([])
  const [stats, setStats] = useState<AccountStats>(createEmptyAccountStats)
  const [lastUpdateTime, setLastUpdateTime] = useState<Date>()
  const [hasLoadedAccountData, setHasLoadedAccountData] = useState(false)
  const [prevTotalConsumption, setPrevTotalConsumption] =
    useState<CurrencyAmount>({ USD: 0, CNY: 0 })
  const netInflowTotals = useMemo(
    () => buildNetInflowTotals(displayData),
    [displayData],
  )
  const [prevBalances, setPrevBalances] = useState<CurrencyAmountMap>({})
  const [tagStore, setTagStore] = useState<TagStore>({
    version: 1,
    tagsById: {},
  })
  const [tags, setTags] = useState<Tag[]>([])

  const [entryLayoutSnapshot, setEntryLayoutSnapshot] = useState<{
    orderedIds: string[]
    pinnedIds: string[]
  }>()
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
      balanceHistoryUnavailable: boolean
      todayKey: string
    }) => {
      const estimatesByAccountId = new Map<
        string,
        Pick<TodayIncomeEstimateResult, "status" | "estimates">
      >()

      for (const account of params.nextAccounts) {
        const estimate = estimateTodayIncomeForAccount({
          enabled:
            estimatedTodayIncomeEnabled &&
            account.disabled !== true &&
            account.excludeFromTodayIncome !== true,
          store: params.balanceHistoryStore,
          historyUnavailable: params.balanceHistoryUnavailable,
          account,
          currentDayKey: params.todayKey,
        })

        estimatesByAccountId.set(account.id, {
          status: estimate.status,
          estimates: estimate.estimates,
        })
      }

      return buildDisplayDataWithResolvedTags(
        params.nextAccounts,
        params.currentTagStore,
      ).map((site) => ({
        ...site,
        estimatedTodayIncome: null,
        netInflowEstimate: estimatesByAccountId.get(site.id),
      }))
    },
    [buildDisplayDataWithResolvedTags, estimatedTodayIncomeEnabled],
  )

  const accountsRef = useRef<SiteAccount[]>([])
  accountsRef.current = accounts
  const targetedReloadGenerationRef = useRef(0)
  const appliedTargetedReloadRef = useRef(0)
  const appliedFullLoadRef = useRef(0)
  const targetedReloadGenerationByAccountIdRef = useRef<Record<string, number>>(
    {},
  )
  const hasLoadedAccountDataRef = useRef(false)
  hasLoadedAccountDataRef.current = hasLoadedAccountData

  const loadAccountData = useCallback(
    async function load() {
      try {
        logger.debug("Loading account data")
        await accountCheckInState.resetExpiredCheckIns()
        const appliedTargetedReload = appliedTargetedReloadRef.current
        const [accountSnapshot, currentTagStore, balanceHistory] =
          await Promise.all([
            accountReadModels.getAccountManagementSnapshot(),
            tagStorage.getTagStore(),
            readBalanceHistoryForEstimates(estimatedTodayIncomeEnabled),
          ])
        if (appliedTargetedReload !== appliedTargetedReloadRef.current)
          return load()
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
          balanceHistoryStore: balanceHistory.store,
          balanceHistoryUnavailable: balanceHistory.unavailable,
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

        appliedFullLoadRef.current += 1
        accountsRef.current = allAccounts
        setAccounts(allAccounts)
        setBookmarks(allBookmarks)
        setStats(accountStats)
        setDisplayData(displaySiteData)
        const entryIdSet = new Set<string>([
          ...displaySiteData.map((site) => site.id),
          ...allBookmarks.map((bookmark) => bookmark.id),
        ])

        setEntryLayoutSnapshot({
          orderedIds: storedOrderedIds.filter((id) => entryIdSet.has(id)),
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
    },
    [
      buildDisplayDataWithBalanceHistory,
      estimatedTodayIncomeEnabled,
      prevTotalConsumption,
      prevBalances,
    ],
  )

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

        const isCurrentReload = (id: string) =>
          targetedReloadGenerationByAccountIdRef.current[id] ===
          reloadGeneration
        let activeReloadedAccounts: SiteAccount[]
        while (true) {
          const fullLoadBeforeQuery = appliedFullLoadRef.current
          const accountsBeforeQuery = accountsRef.current
          const [singleId] = uniqueIds
          // Each single-account query reads the complete envelope. Read a batch once.
          const storedAccounts =
            uniqueIds.length === 1 && singleId !== undefined
              ? [await accountQueries.getAccountById(singleId)]
              : await accountQueries.getAllAccounts()
          const activeIds = uniqueIds.filter(isCurrentReload)
          if (activeIds.length === 0) return
          if (
            appliedFullLoadRef.current !== fullLoadBeforeQuery &&
            activeIds.some(
              (id) =>
                accountsBeforeQuery.some((account) => account.id === id) ||
                accountsRef.current.some((account) => account.id === id),
            )
          ) {
            // A full load can finish later with data read earlier. Re-read before applying either result.
            continue
          }
          const storedById = new Map(
            storedAccounts
              .filter((account): account is SiteAccount => account !== null)
              .map((account) => [account.id, account]),
          )
          activeReloadedAccounts = activeIds.map((id) => {
            const account = storedById.get(id)
            if (!account) throw new Error(`Account not found: ${id}`)
            return account
          })
          break
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

        const appliedFullLoad = appliedFullLoadRef.current
        appliedTargetedReloadRef.current += 1
        accountsRef.current = mergedAccounts
        setAccounts(mergedAccounts)
        const balanceHistory = await readBalanceHistoryForEstimates(
          estimatedTodayIncomeEnabled,
        )
        const todayKey = getDayKeyFromUnixSeconds(Math.floor(Date.now() / 1000))
        const latestActiveReloadedAccounts = activeReloadedAccounts.filter(
          ({ id }) => isCurrentReload(id),
        )
        const latestAccounts = accountsRef.current
        const latestKnownIds = new Set(
          latestAccounts.map((account) => account.id),
        )
        const canApply =
          appliedFullLoad === appliedFullLoadRef.current
            ? latestActiveReloadedAccounts
            : latestActiveReloadedAccounts.filter(
                ({ id }) => !knownIds.has(id) && !latestKnownIds.has(id),
              )
        for (const { id } of latestActiveReloadedAccounts)
          delete targetedReloadGenerationByAccountIdRef.current[id]
        if (canApply.length === 0) return
        const latestReloadedById = Object.fromEntries(
          canApply.map((account) => [account.id, account]),
        )
        const latestMergedAccounts = latestAccounts.map(
          (account) => latestReloadedById[account.id] ?? account,
        )
        for (const account of canApply) {
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
            balanceHistoryStore: balanceHistory.store,
            balanceHistoryUnavailable: balanceHistory.unavailable,
            todayKey,
          }),
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
    },
    [
      buildDisplayDataWithBalanceHistory,
      estimatedTodayIncomeEnabled,
      loadAccountData,
      tagStore,
    ],
  )

  // Reload persisted observations so rows and memoized filters cross days together.
  // This performs no provider requests and never executes a check-in.
  useLocalDayChange(() => {
    void loadAccountData()
  })

  // 监听后台自动刷新的更新通知
  useEffect(() => {
    return onRuntimeMessage((message: any) => {
      if (
        message.type === AUTO_REFRESH_UPDATE_MESSAGE_TYPE &&
        message.payload.type === AUTO_REFRESH_UPDATE_TYPES.Completed
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

  const recordRefreshTime = useCallback((timestamp: number) => {
    if (timestamp > 0) setLastUpdateTime(new Date(timestamp))
  }, [])

  return {
    accounts,
    bookmarks,
    displayData,
    stats,
    lastUpdateTime,
    hasLoadedAccountData,
    prevTotalConsumption,
    netInflowTotals,
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
  }
}
