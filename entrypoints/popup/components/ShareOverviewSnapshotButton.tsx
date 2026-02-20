import { ArrowUpOnSquareIcon } from "@heroicons/react/24/outline"
import { useMemo } from "react"
import toast from "react-hot-toast"
import { useTranslation } from "react-i18next"

import Tooltip from "~/components/Tooltip"
import { IconButton } from "~/components/ui"
import { useUserPreferencesContext } from "~/contexts/UserPreferencesContext"
import { useAccountDataContext } from "~/features/AccountManagement/hooks/AccountDataContext"
import { exportShareSnapshotWithToast } from "~/features/ShareSnapshots/utils/exportShareSnapshotWithToast"
import { buildOverviewShareSnapshotPayload } from "~/services/shareSnapshots/shareSnapshots"

/**
 * Popup header action to export an aggregate (enabled-only) overview snapshot.
 */
export default function ShareOverviewSnapshotButton() {
  const { t } = useTranslation(["shareSnapshots", "messages", "common"])
  const { accounts, displayData } = useAccountDataContext()
  const { currencyType, showTodayCashflow } = useUserPreferencesContext()

  const enabledAccounts = useMemo(
    () => accounts.filter((account) => account.disabled !== true),
    [accounts],
  )

  const enabledAccountCount = enabledAccounts.length

  const handleShare = async () => {
    if (enabledAccountCount <= 0) {
      toast.error(t("messages:toast.error.shareSnapshotNoEnabledAccounts"))
      return
    }

    const latestSyncTime = Math.max(
      ...enabledAccounts.map((account) => account.last_sync_time || 0),
      0,
    )

    const totalBalance = displayData
      .filter(
        (site) =>
          site.disabled !== true && site.excludeFromTotalBalance !== true,
      )
      .reduce((sum, site) => sum + (site.balance?.[currencyType] ?? 0), 0)

    const includeToday = showTodayCashflow !== false

    const todayIncome = includeToday
      ? displayData
          .filter((site) => site.disabled !== true)
          .reduce(
            (sum, site) => sum + (site.todayIncome?.[currencyType] ?? 0),
            0,
          )
      : undefined

    const todayOutcome = includeToday
      ? displayData
          .filter((site) => site.disabled !== true)
          .reduce(
            (sum, site) => sum + (site.todayConsumption?.[currencyType] ?? 0),
            0,
          )
      : undefined

    // Overview snapshots are aggregate-only and must not include per-account identifiers.
    const payload = buildOverviewShareSnapshotPayload({
      currencyType,
      enabledAccountCount: enabledAccountCount,
      totalBalance,
      includeTodayCashflow: includeToday,
      todayIncome,
      todayOutcome,
      asOf: latestSyncTime > 0 ? latestSyncTime : undefined,
    })

    await exportShareSnapshotWithToast({ payload })
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
