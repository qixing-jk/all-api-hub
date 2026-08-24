import { CircleCheck, CircleX, Clock, TriangleAlert } from "lucide-react"
import { useTranslation } from "react-i18next"

import AccountLinkButton from "~/components/AccountLinkButton"
import { TableCell, TableRow } from "~/components/ui"
import {
  getAutoCheckinSnapshotReadinessCategory,
  getAutoCheckinSnapshotStatus,
  SNAPSHOT_READINESS_FILTER,
  SNAPSHOT_STATUS_FILTER,
  type SnapshotReadinessFilter,
} from "~/features/AutoCheckin/utils/snapshotFilters"
import { cn } from "~/lib/utils"
import {
  translateAutoCheckinSkipReason,
  type AutoCheckinAccountSnapshot,
} from "~/types/autoCheckin"

import { formatTimestamp } from "../utils/tableUtils"

interface AccountSnapshotTableRowProps {
  snapshot: AutoCheckinAccountSnapshot
}

/** Renders one account's readiness and latest execution state. */
export default function AccountSnapshotTableRow({
  snapshot,
}: AccountSnapshotTableRowProps) {
  const { t } = useTranslation("autoCheckin")
  const reason = snapshot.skipReason ?? snapshot.lastResult?.reasonCode
  const readinessCategory = getAutoCheckinSnapshotReadinessCategory(snapshot)
  const readinessLabels: Record<SnapshotReadinessFilter, string> = {
    [SNAPSHOT_READINESS_FILTER.ALL]: t("snapshot.filters.readinessAll"),
    [SNAPSHOT_READINESS_FILTER.READY]: t("snapshot.filters.readinessReady"),
    [SNAPSHOT_READINESS_FILTER.SETUP_REQUIRED]: t(
      "snapshot.filters.readinessSetupRequired",
    ),
    [SNAPSHOT_READINESS_FILTER.DISABLED]: t(
      "snapshot.filters.readinessDisabled",
    ),
    [SNAPSHOT_READINESS_FILTER.UNSUPPORTED]: t(
      "snapshot.filters.readinessUnsupported",
    ),
    [SNAPSHOT_READINESS_FILTER.TEMPORARILY_UNAVAILABLE]: t(
      "snapshot.filters.readinessTemporarilyUnavailable",
    ),
  }
  const readinessIsEmphasized =
    readinessCategory === SNAPSHOT_READINESS_FILTER.SETUP_REQUIRED
  const readinessIsReady = readinessCategory === SNAPSHOT_READINESS_FILTER.READY

  const statusBadge = (() => {
    switch (getAutoCheckinSnapshotStatus(snapshot)) {
      case SNAPSHOT_STATUS_FILTER.SUCCESS:
        return (
          <span className="inline-flex items-center gap-1 rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-800 dark:bg-green-900 dark:text-green-200">
            <CircleCheck className="h-3.5 w-3.5" />
            {t("execution.status.success")}
          </span>
        )
      case SNAPSHOT_STATUS_FILTER.FAILED:
        return (
          <span className="inline-flex items-center gap-1 rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-800 dark:bg-red-900 dark:text-red-200">
            <CircleX className="h-3.5 w-3.5" />
            {t("execution.status.failed")}
          </span>
        )
      case SNAPSHOT_STATUS_FILTER.SKIPPED:
        return (
          <span className="inline-flex items-center gap-1 rounded-full bg-yellow-100 px-2 py-0.5 text-xs font-medium text-yellow-800 dark:bg-yellow-900 dark:text-yellow-100">
            <TriangleAlert className="h-3.5 w-3.5" />
            {t("execution.status.skipped")}
          </span>
        )
      default:
        return (
          <span className="inline-flex items-center gap-1 rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-700 dark:bg-gray-800 dark:text-gray-200">
            <Clock className="h-3.5 w-3.5" />
            {t("snapshot.badges.pending")}
          </span>
        )
    }
  })()

  return (
    <TableRow className="border-gray-200 hover:bg-gray-50 dark:border-gray-700 dark:hover:bg-gray-800">
      <TableCell className="w-56 max-w-56 min-w-56 px-6 py-4 text-sm font-medium text-gray-900 dark:text-gray-100">
        <AccountLinkButton
          accountId={snapshot.accountId}
          accountName={snapshot.accountName}
          className="w-full max-w-full min-w-0 justify-start overflow-hidden px-0 text-left"
        />
      </TableCell>
      <TableCell className="px-4 py-4 text-sm">
        <span
          className={cn(
            "inline-flex rounded-full px-2 py-0.5 text-xs font-medium",
            snapshot.autoCheckinEnabled
              ? "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200"
              : "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300",
          )}
        >
          {snapshot.autoCheckinEnabled
            ? t("snapshot.badges.enabled")
            : t("snapshot.badges.disabled")}
        </span>
      </TableCell>
      <TableCell className="px-4 py-4 text-sm">
        <div className="space-y-1.5">
          <span
            className={cn(
              "inline-flex rounded-full px-2 py-0.5 text-xs font-medium",
              readinessIsReady &&
                "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
              readinessIsEmphasized &&
                "bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-100",
              !readinessIsReady &&
                !readinessIsEmphasized &&
                "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-200",
            )}
          >
            {readinessLabels[readinessCategory]}
          </span>
          <div className="text-xs text-gray-500 dark:text-gray-400">
            <span>
              {snapshot.detectionEnabled
                ? t("snapshot.badges.methodSelected")
                : t("snapshot.badges.methodNotSelected")}
            </span>
            <span aria-hidden="true"> · </span>
            <span>
              {snapshot.providerAvailable
                ? t("snapshot.badges.providerAvailable")
                : t("snapshot.badges.providerUnavailable")}
            </span>
          </div>
        </div>
      </TableCell>
      <TableCell className="max-w-sm px-4 py-4 text-sm">
        <div className="space-y-1.5">
          {statusBadge}
          {reason && (
            <div className="text-xs text-gray-500 dark:text-gray-400">
              {translateAutoCheckinSkipReason(t, reason)}
            </div>
          )}
        </div>
      </TableCell>
      <TableCell className="px-4 py-4 text-sm whitespace-nowrap text-gray-500 dark:text-gray-400">
        {snapshot.lastResult?.timestamp
          ? formatTimestamp(snapshot.lastResult.timestamp)
          : "-"}
      </TableCell>
    </TableRow>
  )
}
