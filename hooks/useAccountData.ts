import { useCallback, useEffect, useMemo, useState } from "react"

import { accountStorage } from "~/services/accountStorage"
import type {
  AccountStats,
  CurrencyAmount,
  CurrencyAmountMap,
  DisplaySiteData,
  SiteAccount,
} from "~/types"
import { createLogger } from "~/utils/logger"

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
 * Build an aggregated account data view sourced from {@link accountStorage}.
 * Exposes helper callbacks so UI layers can refresh or reload on demand.
 */
export const useAccountData = (): UseAccountDataResult => {
  // 数据状态
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
  const [lastUpdateTime, setLastUpdateTime] = useState<Date>(new Date())

  // 加载状态
  const [isInitialLoad, setIsInitialLoad] = useState(true)
  const [isRefreshing, setIsRefreshing] = useState(false)

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
      const allAccounts = await accountStorage.getAllAccounts()
      const accountStats = await accountStorage.getAccountStats()
      const displaySiteData = accountStorage.convertToDisplayData(
        allAccounts,
      ) as DisplaySiteData[]

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
    setIsRefreshing(true)
    try {
      // 刷新所有账号数据
      const refreshResult = await accountStorage.refreshAllAccounts()
      logger.debug("刷新结果", refreshResult)

      // 重新加载显示数据
      await loadAccountData()
      setLastUpdateTime(new Date())

      // 返回刷新结果，让组件层处理 UI 反馈
      return refreshResult
    } catch (error) {
      logger.error("刷新数据失败", error)
      // 即使刷新失败也尝试加载本地数据
      await loadAccountData()
      throw error
    } finally {
      setIsRefreshing(false)
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
