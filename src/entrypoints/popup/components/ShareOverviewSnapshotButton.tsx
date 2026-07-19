import { ArrowUpOnSquareIcon } from "@heroicons/react/24/outline"
import { useMemo } from "react"
import toast from "react-hot-toast"
import { useTranslation } from "react-i18next"

import Tooltip from "~/components/Tooltip"
import { IconButton } from "~/components/ui"
import { useProductAnalyticsScope } from "~/contexts/ProductAnalyticsScopeContext"
import { useUserPreferencesContext } from "~/contexts/UserPreferencesContext"
import { useAccountDataContext } from "~/features/AccountManagement/hooks/AccountDataContext"
import { exportShareSnapshotWithToast } from "~/features/ShareSnapshots/utils/exportShareSnapshotWithToast"
import { isAccountTodayMetricComplete } from "~/services/accounts/accountTodayStats"
import { resolveProductAnalyticsActionContext } from "~/services/productAnalytics/actionConfig"
import { startProductAnalyticsAction } from "~/services/productAnalytics/actions"
import {
  PRODUCT_ANALYTICS_ACTION_IDS,
  PRODUCT_ANALYTICS_ERROR_CATEGORIES,
  PRODUCT_ANALYTICS_FEATURE_IDS,
  PRODUCT_ANALYTICS_RESULTS,
} from "~/services/productAnalytics/contracts"
import { buildOverviewShareSnapshotPayload } from "~/services/sharing/shareSnapshots"
import { getErrorMessage } from "~/utils/core/error"
import {
  calculateTotalBalanceForSites,
  calculateTotalConsumption,
  calculateTotalIncomeForSites,
} from "~/utils/core/formatters"
import { createLogger } from "~/utils/core/logger"

const logger = createLogger("ShareOverviewSnapshotButton")

/**
 * Popup header action to export an aggregate (enabled-only) overview snapshot.
 */
export default function ShareOverviewSnapshotButton() {
  const { t } = useTranslation(["shareSnapshots", "messages", "common"])
  const { accounts, displayData } = useAccountDataContext()
  const { currencyType, showTodayCashflow } = useUserPreferencesContext()
  const analyticsScope = useProductAnalyticsScope()

  const enabledAccounts = useMemo(
    () => accounts.filter((account) => account.disabled !== true),
    [accounts],
  )

  const enabledAccountCount = enabledAccounts.length

  const handleShare = async () => {
    const analyticsContext = resolveProductAnalyticsActionContext(
      {
        featureId: PRODUCT_ANALYTICS_FEATURE_IDS.ShareSnapshots,
        actionId: PRODUCT_ANALYTICS_ACTION_IDS.ShareOverviewSnapshot,
      },
      analyticsScope,
    )
    const tracker = analyticsContext
      ? startProductAnalyticsAction(analyticsContext)
      : undefined

    if (enabledAccountCount <= 0) {
      toast.error(t("messages:toast.error.shareSnapshotNoEnabledAccounts"))
      tracker?.complete(PRODUCT_ANALYTICS_RESULTS.Skipped)
      return
    }

    const latestSyncTime = Math.max(
      ...enabledAccounts.map((account) => account.last_sync_time || 0),
      0,
    )

    const totalBalance =
      calculateTotalBalanceForSites(displayData)[currencyType]
    const todayIncomeTotal = calculateTotalIncomeForSites(displayData)
    const todayConsumptionTotal = calculateTotalConsumption(displayData)
    const includeToday =
      showTodayCashflow !== false &&
      isAccountTodayMetricComplete(todayIncomeTotal.coverage) &&
      isAccountTodayMetricComplete(todayConsumptionTotal.coverage)
    const todayIncome = todayIncomeTotal.amount[currencyType]
    const todayOutcome = todayConsumptionTotal.amount[currencyType]

    // Overview snapshots are aggregate-only and must not include per-account identifiers.
    const payload = buildOverviewShareSnapshotPayload({
      currencyType,
      enabledAccountCount,
      totalBalance,
      includeTodayCashflow: includeToday,
      todayIncome: includeToday ? todayIncome : undefined,
      todayOutcome: includeToday ? todayOutcome : undefined,
      asOf: latestSyncTime > 0 ? latestSyncTime : undefined,
    })
    const analyticsInsights = {
      itemCount: enabledAccountCount,
      usageDataPresent:
        Number.isFinite(payload.todayIncome) &&
        Number.isFinite(payload.todayOutcome) &&
        Number.isFinite(payload.todayNet),
    }

    try {
      await exportShareSnapshotWithToast({ payload })
      tracker?.complete(PRODUCT_ANALYTICS_RESULTS.Success, {
        insights: analyticsInsights,
      })
    } catch (error) {
      logger.error("Failed to export overview share snapshot", error)
      const errorText = getErrorMessage(error) || t("messages:errors.unknown")
      toast.error(
        t("messages:toast.error.operationFailed", { error: errorText }),
      )
      tracker?.complete(PRODUCT_ANALYTICS_RESULTS.Failure, {
        errorCategory: PRODUCT_ANALYTICS_ERROR_CATEGORIES.Unknown,
        insights: analyticsInsights,
      })
    }
  }

  const label = t("shareSnapshots:actions.shareOverviewSnapshot")

  return (
    <Tooltip
      content={
        enabledAccountCount > 0
          ? label
          : t("messages:toast.error.shareSnapshotNoEnabledAccounts")
      }
    >
      <IconButton
        onClick={handleShare}
        variant="outline"
        size="sm"
        aria-label={label}
        disabled={enabledAccountCount <= 0}
        className="touch-manipulation"
      >
        <ArrowUpOnSquareIcon className="h-4 w-4" />
      </IconButton>
    </Tooltip>
  )
}
