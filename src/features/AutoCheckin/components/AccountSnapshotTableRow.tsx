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
import { CheckInFeedbackButton } from "~/features/CheckInFeedback/CheckInFeedbackButton"
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
          <span className="bg-success-soft text-success-soft-foreground gap-density-1 inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium">
            <CircleCheck className="h-3.5 w-3.5" />
            {t("execution.status.success")}
          </span>
        )
      case SNAPSHOT_STATUS_FILTER.FAILED:
        return (
          <span className="bg-destructive-soft text-destructive-soft-foreground gap-density-1 inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium">
            <CircleX className="h-3.5 w-3.5" />
            {t("execution.status.failed")}
          </span>
        )
      case SNAPSHOT_STATUS_FILTER.SKIPPED:
        return (
          <span className="bg-warning-soft text-warning-soft-foreground gap-density-1 inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium">
            <TriangleAlert className="h-3.5 w-3.5" />
            {t("execution.status.skipped")}
          </span>
        )
      default:
        return (
          <span className="bg-muted text-secondary-foreground dark:bg-card gap-density-1 inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium">
            <Clock className="h-3.5 w-3.5" />
            {t("snapshot.badges.pending")}
          </span>
        )
    }
  })()

  return (
    <TableRow className="border-border hover:bg-surface-subtle dark:hover:bg-card">
      <TableCell className="text-foreground py-density-4 w-56 max-w-56 min-w-56 px-6 text-sm font-medium">
        <AccountLinkButton
          accountId={snapshot.accountId}
          accountName={snapshot.accountName}
          className="w-full max-w-full min-w-0 justify-start overflow-hidden px-0 text-left"
        />
      </TableCell>
      <TableCell className="py-density-4 px-4 text-sm">
        <span
          className={cn(
            "inline-flex rounded-full px-2 py-0.5 text-xs font-medium",
            snapshot.autoCheckinEnabled
              ? "bg-success-soft text-success-soft-foreground"
              : "bg-muted text-muted-foreground dark:bg-card dark:text-secondary-foreground",
          )}
        >
          {snapshot.autoCheckinEnabled
            ? t("snapshot.badges.enabled")
            : t("snapshot.badges.disabled")}
        </span>
      </TableCell>
      <TableCell className="py-density-4 px-4 text-sm">
        <div className="space-y-density-1-5">
          <div className="gap-x-density-2 gap-y-density-1 flex flex-wrap items-center">
            <span
              className={cn(
                "inline-flex rounded-full px-2 py-0.5 text-xs font-medium",
                readinessIsReady &&
                  "bg-success-soft text-success-soft-foreground",
                readinessIsEmphasized &&
                  "bg-warning-soft text-warning-soft-foreground",
                !readinessIsReady &&
                  !readinessIsEmphasized &&
                  "bg-muted text-secondary-foreground dark:bg-card",
              )}
            >
              {readinessLabels[readinessCategory]}
            </span>
            <CheckInFeedbackButton
              accountId={snapshot.accountId}
              requestSupport={
                readinessCategory === SNAPSHOT_READINESS_FILTER.UNSUPPORTED
              }
            />
          </div>
          <div className="text-muted-foreground text-xs">
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
      <TableCell className="py-density-4 max-w-sm px-4 text-sm">
        <div className="space-y-density-1-5">
          {statusBadge}
          {reason && (
            <div className="text-muted-foreground text-xs">
              {translateAutoCheckinSkipReason(t, reason)}
            </div>
          )}
        </div>
      </TableCell>
      <TableCell className="text-muted-foreground py-density-4 px-4 text-sm whitespace-nowrap">
        {snapshot.lastResult?.timestamp
          ? formatTimestamp(snapshot.lastResult.timestamp)
          : "-"}
      </TableCell>
    </TableRow>
  )
}
