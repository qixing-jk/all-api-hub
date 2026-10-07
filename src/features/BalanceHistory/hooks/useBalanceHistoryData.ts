import { useCallback, useEffect, useState } from "react"
import { useTranslation } from "react-i18next"

import toast from "~/lib/notify"
import { accountQueries } from "~/services/accounts/accountStorage/accountQueries"
import { sendBalanceHistoryMessage } from "~/services/history/dailyBalanceHistory/messaging"
import { dailyBalanceHistoryStorage } from "~/services/history/dailyBalanceHistory/storage"
import { startProductAnalyticsAction } from "~/services/productAnalytics/actions"
import {
  PRODUCT_ANALYTICS_ACTION_IDS,
  PRODUCT_ANALYTICS_ENTRYPOINTS,
  PRODUCT_ANALYTICS_ERROR_CATEGORIES,
  PRODUCT_ANALYTICS_FEATURE_IDS,
  PRODUCT_ANALYTICS_RESULTS,
  PRODUCT_ANALYTICS_SURFACE_IDS,
} from "~/services/productAnalytics/contracts"
import { withProtectionBypassUserCommand } from "~/services/protectionBypass/client"
import {
  PROTECTION_BYPASS_SURFACES,
  PROTECTION_BYPASS_USER_COMMANDS,
} from "~/services/protectionBypass/contracts"
import { BalanceHistoryMessageTypes } from "~/services/runtimeMessaging/messageTypes"
import { tagStorage } from "~/services/tags/tagStorage"
import type { SiteAccount, TagStore } from "~/types"
import type { DailyBalanceHistoryStore } from "~/types/dailyBalanceHistory"
import { getErrorMessage } from "~/utils/core/error"
import { createLogger } from "~/utils/core/logger"

const logger = createLogger("BalanceHistoryPage")
const optionsEntrypoint = PRODUCT_ANALYTICS_ENTRYPOINTS.Options
const balanceHistorySurface =
  PRODUCT_ANALYTICS_SURFACE_IDS.OptionsBalanceHistoryPage
/** Load snapshots and own explicit refresh/prune feedback without hiding existing content. */
export function useBalanceHistoryData(selectedAccountIds: string[]) {
  const { t } = useTranslation("balanceHistory")
  const [accounts, setAccounts] = useState<SiteAccount[]>([])
  const [tagStore, setTagStore] = useState<TagStore | null>(null)
  const [store, setStore] = useState<DailyBalanceHistoryStore | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  const loadData = useCallback(async () => {
    try {
      setIsLoading(true)
      const [nextAccounts, nextStore, nextTagStore] = await Promise.all([
        accountQueries.getEnabledAccounts(),
        dailyBalanceHistoryStorage.getStore(),
        tagStorage.getTagStore(),
      ])
      setAccounts(nextAccounts)
      setStore(nextStore)
      setTagStore(nextTagStore)
    } catch (error) {
      logger.error("Failed to load data", error)
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadData()
  }, [loadData])

  const handleRefreshNow = useCallback(async () => {
    const tracker = startProductAnalyticsAction({
      featureId: PRODUCT_ANALYTICS_FEATURE_IDS.BalanceHistory,
      actionId: PRODUCT_ANALYTICS_ACTION_IDS.RefreshBalanceHistorySnapshots,
      surfaceId: balanceHistorySurface,
      entrypoint: optionsEntrypoint,
    })
    let toastId: string | undefined
    try {
      toastId = toast.loading(t("messages.loading.refreshing"))
      await withProtectionBypassUserCommand(
        PROTECTION_BYPASS_USER_COMMANDS.RefreshAllAccounts,
        PROTECTION_BYPASS_SURFACES.Options,
        async (protectionBypassExecution) => {
          const response = await sendBalanceHistoryMessage(
            BalanceHistoryMessageTypes.RefreshNow,
            {
              ...(selectedAccountIds.length
                ? { accountIds: selectedAccountIds }
                : {}),
              protectionBypassExecution,
            },
          )

          if (!response?.success) {
            throw new Error(response?.error || "Unknown error")
          }

          toast.success(t("messages.success.refreshCompleted"), { id: toastId })
          await loadData()
        },
      )
      tracker.complete(PRODUCT_ANALYTICS_RESULTS.Success)
    } catch (error) {
      toast.error(
        t("messages.error.refreshFailed", { error: getErrorMessage(error) }),
        { id: toastId },
      )
      tracker.complete(PRODUCT_ANALYTICS_RESULTS.Failure, {
        errorCategory: PRODUCT_ANALYTICS_ERROR_CATEGORIES.Unknown,
      })
    }
  }, [loadData, selectedAccountIds, t])

  const handlePruneNow = useCallback(async () => {
    const tracker = startProductAnalyticsAction({
      featureId: PRODUCT_ANALYTICS_FEATURE_IDS.BalanceHistory,
      actionId: PRODUCT_ANALYTICS_ACTION_IDS.PruneBalanceHistorySnapshots,
      surfaceId: balanceHistorySurface,
      entrypoint: optionsEntrypoint,
    })
    let toastId: string | undefined
    try {
      toastId = toast.loading(t("messages.loading.pruning"))
      const response = await sendBalanceHistoryMessage(
        BalanceHistoryMessageTypes.Prune,
      )

      if (!response?.success) {
        throw new Error(response?.error || "Unknown error")
      }

      toast.success(t("messages.success.pruneCompleted"), { id: toastId })
      await loadData()
      tracker.complete(PRODUCT_ANALYTICS_RESULTS.Success)
    } catch (error) {
      toast.error(
        t("messages.error.pruneFailed", { error: getErrorMessage(error) }),
        { id: toastId },
      )
      tracker.complete(PRODUCT_ANALYTICS_RESULTS.Failure, {
        errorCategory: PRODUCT_ANALYTICS_ERROR_CATEGORIES.Unknown,
      })
    }
  }, [loadData, t])

  return {
    accounts,
    tagStore,
    store,
    isLoading,
    handleRefreshNow,
    handlePruneNow,
  }
}
