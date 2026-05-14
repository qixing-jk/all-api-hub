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
import { resolveProductAnalyticsActionContext } from "~/services/productAnalytics/actionConfig"
import { startProductAnalyticsAction } from "~/services/productAnalytics/actions"
import {
  PRODUCT_ANALYTICS_ACTION_IDS,
  PRODUCT_ANALYTICS_ERROR_CATEGORIES,
  PRODUCT_ANALYTICS_FEATURE_IDS,
  PRODUCT_ANALYTICS_RESULTS,
} from "~/services/productAnalytics/events"
import { buildOverviewShareSnapshotPayload } from "~/services/sharing/shareSnapshots"
import { getErrorMessage } from "~/utils/core/error"
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
      await tracker?.complete(PRODUCT_ANALYTICS_RESULTS.Skipped)
      return
    }

    const latestSyncTime = Math.max(
      ...enabledAccounts.map((account) => account.last_sync_time || 0),
      0,
    )

    const includeToday = showTodayCashflow !== false

    let totalBalance = 0
    let todayIncome = 0
    let todayOutcome = 0

    for (const site of displayData) {
      if (site.disabled === true) {
        continue
      }

      if (site.excludeFromTotalBalance !== true) {
        totalBalance += site.balance?.[currencyType] ?? 0
      }

      if (includeToday) {
        todayIncome += site.todayIncome?.[currencyType] ?? 0
        todayOutcome += site.todayConsumption?.[currencyType] ?? 0
      }
    }

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

    try {
      await exportShareSnapshotWithToast({ payload })
      await tracker?.complete(PRODUCT_ANALYTICS_RESULTS.Success)
    } catch (error) {
      logger.error("Failed to export overview share snapshot", error)
      const errorText = getErrorMessage(error) || t("messages:errors.unknown")
      toast.error(
        t("messages:toast.error.operationFailed", { error: errorText }),
      )
      await tracker?.complete(PRODUCT_ANALYTICS_RESULTS.Failure, {
        errorCategory: PRODUCT_ANALYTICS_ERROR_CATEGORIES.Unknown,
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
