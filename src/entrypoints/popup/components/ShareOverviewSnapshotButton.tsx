import { Share2 } from "lucide-react"
import { useMemo } from "react"
import { useTranslation } from "react-i18next"

import Tooltip from "~/components/Tooltip"
import { IconButton } from "~/components/ui"
import { useProductAnalyticsScope } from "~/contexts/ProductAnalyticsScopeContext"
import { useUserPreferencesContext } from "~/contexts/UserPreferencesContext"
import { useAccountDataContext } from "~/features/AccountManagement/data/AccountDataContext"
import { exportShareSnapshotWithToast } from "~/features/ShareSnapshots/utils/exportShareSnapshotWithToast"
import toast from "~/lib/notify"
import { getSiteDayReadings } from "~/services/accounts/metrics/accountTodayStats"
import {
  BALANCE_PURPOSES,
  getDisplayBalancePortfolio,
} from "~/services/accounts/metrics/balanceProjection"
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
  calculateTotalConsumption,
  calculateTotalIncomeForSites,
} from "~/utils/core/formatters"
import { createLogger } from "~/utils/core/logger"

const logger = createLogger("ShareOverviewSnapshotButton")

/**
 * Exports the account overview as an aggregate snapshot.
 */
export default function ShareOverviewSnapshotButton({
  purpose = BALANCE_PURPOSES.Available,
}: { purpose?: (typeof BALANCE_PURPOSES)["Prepaid" | "Available"] } = {}) {
  const { t } = useTranslation(["shareSnapshots", "messages", "common"])
  const { accounts, displayData } = useAccountDataContext()
  const {
    currencyType,
    currencyDisplay = currencyType,
    showTodayCashflow,
  } = useUserPreferencesContext()
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

    const portfolio = getDisplayBalancePortfolio(displayData, purpose)
    const todayIncomeTotal = calculateTotalIncomeForSites(displayData)
    const todayConsumptionTotal = calculateTotalConsumption(displayData)
    const siteDayUsage = displayData
      .filter((site) => !site.disabled)
      .flatMap((site) =>
        getSiteDayReadings(site).map((reading) => ({
          ...reading,
          exchangeRate: site.exchangeRate,
        })),
      )
    // Overview snapshots are aggregate-only and must not include per-account identifiers.
    const payload = buildOverviewShareSnapshotPayload({
      ...(siteDayUsage.length ? { siteDayUsage } : {}),
      currencyType,
      currencyDisplay,
      enabledAccountCount,
      portfolio,
      income: showTodayCashflow !== false ? todayIncomeTotal : undefined,
      consumption:
        showTodayCashflow !== false ? todayConsumptionTotal : undefined,
      purpose,
      includeTodayCashflow: showTodayCashflow !== false,
      asOf: latestSyncTime > 0 ? latestSyncTime : undefined,
    })
    const analyticsInsights = {
      itemCount: enabledAccountCount,
      usageDataPresent:
        Boolean(
          payload.consumptionSummary?.groups.length ||
          payload.incomeSummary?.groups.length,
        ) ||
        (Number.isFinite(payload.todayIncome) &&
          Number.isFinite(payload.todayOutcome) &&
          Number.isFinite(payload.todayNet)),
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
        variant="ghost"
        size="sm"
        aria-label={label}
        disabled={enabledAccountCount <= 0}
        className="touch-manipulation text-muted-foreground hover:text-foreground"
      >
        <Share2 className="h-4 w-4" />
      </IconButton>
    </Tooltip>
  )
}
