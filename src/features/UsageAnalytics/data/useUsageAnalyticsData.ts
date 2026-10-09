import { useCallback, useEffect, useMemo, useRef, useState } from "react"

import { accountQueries } from "~/services/accounts/accountStorage/accountQueries"
import { usageHistoryStorage } from "~/services/history/usageHistory/storage"
import { startProductAnalyticsAction } from "~/services/productAnalytics/actions"
import {
  PRODUCT_ANALYTICS_ACTION_IDS,
  PRODUCT_ANALYTICS_ENTRYPOINTS,
  PRODUCT_ANALYTICS_ERROR_CATEGORIES,
  PRODUCT_ANALYTICS_FEATURE_IDS,
  PRODUCT_ANALYTICS_RESULTS,
  PRODUCT_ANALYTICS_SURFACE_IDS,
} from "~/services/productAnalytics/contracts"
import type { SiteAccount } from "~/types"
import type { UsageHistoryStore } from "~/types/usageHistory"
import { createLogger } from "~/utils/core/logger"

/**
 * Unified logger scoped to the Usage Analytics options page.
 */
const logger = createLogger("UsageAnalyticsPage")

type LoadUsageAnalyticsDataOptions = {
  trackAnalytics?: boolean
}

/**
 * Checks whether the store has any aggregate usage buckets without exposing keys.
 */
function hasUsageAnalyticsData(store: UsageHistoryStore) {
  return Object.values(store.accounts).some(
    (account) =>
      Object.keys(account.daily ?? {}).length > 0 ||
      Object.keys(account.hourly ?? {}).length > 0 ||
      Object.keys(account.dailyByModel ?? {}).length > 0 ||
      Object.keys(account.dailyByToken ?? {}).length > 0,
  )
}

export const useUsageAnalyticsData = () => {
  const mountedRef = useRef(false)
  const loadGenerationRef = useRef(0)
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
  const loadData = useCallback(
    async (options?: LoadUsageAnalyticsDataOptions) => {
      if (!mountedRef.current) return
      const generation = ++loadGenerationRef.current
      const isCurrent = () => generation === loadGenerationRef.current
      const tracker = options?.trackAnalytics
        ? startProductAnalyticsAction({
            featureId: PRODUCT_ANALYTICS_FEATURE_IDS.UsageAnalytics,
            actionId: PRODUCT_ANALYTICS_ACTION_IDS.RefreshUsageAnalyticsData,
            surfaceId:
              PRODUCT_ANALYTICS_SURFACE_IDS.OptionsUsageAnalyticsHeader,
            entrypoint: PRODUCT_ANALYTICS_ENTRYPOINTS.Options,
          })
        : null

      try {
        setIsLoading(true)
        const [nextAccounts, nextStore] = await Promise.all([
          accountQueries.getAllAccounts(),
          usageHistoryStorage.getStore(),
        ])
        if (isCurrent()) {
          setAccounts(nextAccounts)
          setStore(nextStore)
        }
        tracker?.complete(PRODUCT_ANALYTICS_RESULTS.Success, {
          insights: {
            itemCount: nextAccounts.length,
            usageDataPresent: hasUsageAnalyticsData(nextStore),
          },
        })
      } catch (error) {
        tracker?.complete(PRODUCT_ANALYTICS_RESULTS.Failure, {
          errorCategory: PRODUCT_ANALYTICS_ERROR_CATEGORIES.Unknown,
        })
        if (isCurrent()) logger.error("Failed to load data", error)
      } finally {
        if (isCurrent()) setIsLoading(false)
      }
    },
    [],
  )

  useEffect(() => {
    mountedRef.current = true
    void loadData()
    return () => {
      mountedRef.current = false
      loadGenerationRef.current += 1
    }
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
