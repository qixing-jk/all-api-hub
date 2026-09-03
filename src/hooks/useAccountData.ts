import { useCallback, useEffect, useMemo, useRef, useState } from "react"

import { accountReadModels } from "~/services/accounts/accountStorage/accountReadModels"
import { accountRefresh } from "~/services/accounts/accountStorage/accountRefresh"
import { createEmptyAccountStats } from "~/services/accounts/accountTodayStats"
import { withProtectionBypassUserCommand } from "~/services/protectionBypass/client"
import { PROTECTION_BYPASS_USER_COMMANDS } from "~/services/protectionBypass/contracts"
import type {
  AccountStats,
  CurrencyAmount,
  CurrencyAmountMap,
  DisplaySiteData,
  SiteAccount,
} from "~/types"
import { getCurrentTempWindowRequestSource } from "~/utils/browser/tempWindowRequestSource"
import { createLogger } from "~/utils/core/logger"

/**
 * Unified logger scoped to account data loading and refresh hooks.
 */
const logger = createLogger("AccountDataHook")

/**
 * Snapshot of account-derived state and handlers returned by {@link useAccountData}.
 * Separates data buckets so the consuming UI can selectively render sections.
 */
interface UseAccountDataResult {
  // 数据状态
  accounts: SiteAccount[]
  /**
   * Convenience slice of accounts that are not disabled.
   *
   * Backward-compatible: missing/undefined `disabled` is treated as enabled.
   */
  enabledAccounts: SiteAccount[]
  displayData: DisplaySiteData[]
  /**
   * Convenience slice of display data that is not disabled.
   *
   * Backward-compatible: missing/undefined `disabled` is treated as enabled.
   */
  enabledDisplayData: DisplaySiteData[]
  stats: AccountStats
  lastUpdateTime: Date

  // 加载状态
  isInitialLoad: boolean
  isRefreshing: boolean

  // 动画相关状态
  prevTotalConsumption: CurrencyAmount
  prevBalances: CurrencyAmountMap

  // 操作函数
  loadAccountData: () => Promise<void>
  handleRefresh: () => Promise<{ success: number; failed: number }>
}

/**
 * Build an aggregated account data view from one canonical account snapshot.
 * Exposes helper callbacks so UI layers can refresh or reload on demand.
 */
export const useAccountData = (): UseAccountDataResult => {
  // 数据状态
  const [accounts, setAccounts] = useState<SiteAccount[]>([])
  const [displayData, setDisplayData] = useState<DisplaySiteData[]>([])
  const [stats, setStats] = useState<AccountStats>(createEmptyAccountStats)
  const [lastUpdateTime, setLastUpdateTime] = useState<Date>(new Date())

  // 加载状态
  const [isInitialLoad, setIsInitialLoad] = useState(true)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const refreshCommandRef = useRef<ReturnType<
    typeof accountRefresh.refreshAllAccounts
  > | null>(null)

  // 动画相关状态
  const [prevTotalConsumption, setPrevTotalConsumption] = useState({
    USD: 0,
    CNY: 0,
  })
  const [prevBalances, setPrevBalances] = useState<{
    [id: string]: CurrencyAmount
  }>({})

  const enabledAccounts = useMemo(
    () => accounts.filter((account) => account.disabled !== true),
    [accounts],
  )

  const enabledDisplayData = useMemo(
    () => displayData.filter((account) => account.disabled !== true),
    [displayData],
  )

  /**
   * Load the persisted account payloads and recompute UI-ready aggregates.
   * Ensures animations have previous values to interpolate between renders.
   */
  const loadAccountData = useCallback(async () => {
    try {
      const {
        accounts: allAccounts,
        stats: accountStats,
        displayAccounts: displaySiteData,
      } = await accountReadModels.getAccountOverviewSnapshot()

      // 计算新的余额数据
      const newBalances: CurrencyAmountMap = {}
      displaySiteData.forEach((site) => {
        newBalances[site.id] = {
          USD: site.balance.USD,
          CNY: site.balance.CNY,
        }
      })

      // 如果不是初始加载，保存之前的数值供动画使用
      if (!isInitialLoad) {
        setPrevTotalConsumption(prevTotalConsumption)
        setPrevBalances(prevBalances)
      }

      // 更新状态
      setAccounts(allAccounts)
      setStats(accountStats)
      setDisplayData(displaySiteData)

      // 更新最后同步时间为最近的一次同步时间
      if (allAccounts.length > 0) {
        const latestSyncTime = Math.max(
          ...allAccounts.map((acc) => acc.last_sync_time),
        )
        if (latestSyncTime > 0) {
          setLastUpdateTime(new Date(latestSyncTime))
        }
      }

      // 标记为非初始加载
      if (isInitialLoad) {
        setIsInitialLoad(false)
      }

      logger.debug("账号数据加载完成", {
        accountCount: allAccounts.length,
        stats: accountStats,
      })
    } catch (error) {
      logger.error("加载账号数据失败", error)
    }
  }, [isInitialLoad, prevTotalConsumption, prevBalances])

  /**
   * Trigger remote refresh followed by a local reload, bubbling the result
   * back to the caller so toast logic can reflect success/failure counts.
   */
  const handleRefresh = useCallback(async () => {
    if (refreshCommandRef.current) {
      return await refreshCommandRef.current
    }

    const source = getCurrentTempWindowRequestSource()
    setIsRefreshing(true)
    const refreshPromise = withProtectionBypassUserCommand(
      PROTECTION_BYPASS_USER_COMMANDS.RefreshAllAccounts,
      source,
      async (protectionBypassExecution) => {
        setIsRefreshing(true)
        try {
          const refreshResult = await accountRefresh.refreshAllAccounts(false, {
            tempWindowRequestSource: source,
            protectionBypassExecution,
          })
          logger.debug("刷新结果", refreshResult)
          await loadAccountData()
          setLastUpdateTime(new Date())
          return refreshResult
        } catch (error) {
          logger.error("刷新数据失败", error)
          await loadAccountData()
          throw error
        } finally {
          setIsRefreshing(false)
        }
      },
    )
    refreshCommandRef.current = refreshPromise
    try {
      return await refreshPromise
    } finally {
      if (refreshCommandRef.current === refreshPromise) {
        refreshCommandRef.current = null
        setIsRefreshing(false)
      }
    }
  }, [loadAccountData])

  // 组件初始化时加载数据
  useEffect(() => {
    loadAccountData()
  }, [loadAccountData])

  return {
    // 数据状态
    accounts,
    enabledAccounts,
    displayData,
    enabledDisplayData,
    stats,
    lastUpdateTime,

    // 加载状态
    isInitialLoad,
    isRefreshing,

    // 动画相关状态
    prevTotalConsumption,
    prevBalances,

    // 操作函数
    loadAccountData,
    handleRefresh,
  }
}
