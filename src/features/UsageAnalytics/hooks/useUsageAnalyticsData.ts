import { useCallback, useEffect, useMemo, useState } from "react"

import { accountStorage } from "~/src/services/accounts/accountStorage"
import { usageHistoryStorage } from "~/src/services/history/usageHistory/storage"
import type { SiteAccount } from "~/src/types"
import type { UsageHistoryStore } from "~/src/types/usageHistory"
import { createLogger } from "~/src/utils/core/logger"

/**
 * Unified logger scoped to the Usage Analytics options page.
 */
const logger = createLogger("UsageAnalyticsPage")

export const useUsageAnalyticsData = () => {
  const [accounts, setAccounts] = useState<SiteAccount[]>([])
  const [store, setStore] = useState<UsageHistoryStore | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  const enabledAccounts = useMemo(
    () => accounts.filter((account) => account.disabled !== true),
    [accounts],
  )

  const disabledAccountIdSet = useMemo(() => {
    return new Set(
      accounts
        .filter((account) => account.disabled === true)
        .map((account) => account.id),
    )
  }, [accounts])

  /**
   * Load accounts and usage-history store data.
   */
  const loadData = useCallback(async () => {
    try {
      setIsLoading(true)
      const [nextAccounts, nextStore] = await Promise.all([
        accountStorage.getAllAccounts(),
        usageHistoryStorage.getStore(),
      ])
      setAccounts(nextAccounts)
      setStore(nextStore)
    } catch (error) {
      logger.error("Failed to load data", error)
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadData()
  }, [loadData])

  return {
    accounts,
    enabledAccounts,
    disabledAccountIdSet,
    store,
    isLoading,
    loadData,
  }
}
