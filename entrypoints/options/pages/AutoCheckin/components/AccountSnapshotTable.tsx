import {
  CheckCircleIcon,
  ClockIcon,
  ExclamationTriangleIcon,
  XCircleIcon,
} from "@heroicons/react/24/outline"
import { useMemo } from "react"
import { useTranslation } from "react-i18next"

import AccountLinkButton from "~/components/AccountLinkButton"
import { Card } from "~/components/ui"
import {
  CHECKIN_RESULT_STATUS,
  type AutoCheckinAccountSnapshot,
} from "~/types/autoCheckin"

interface AccountSnapshotTableProps {
  snapshots: AutoCheckinAccountSnapshot[]
}

/**
 * Displays per-account auto check-in snapshots with status badges and timestamps.
 * @param props Component props bundle.
 * @param props.snapshots Snapshot array produced by the auto check-in service.
 */
export default function AccountSnapshotTable({
  snapshots,
}: AccountSnapshotTableProps) {
  const { t } = useTranslation("autoCheckin")

  const sortedSnapshots = useMemo(() => {
    return [...snapshots].sort((a, b) =>
      a.accountName.localeCompare(b.accountName),
    )
  }, [snapshots])

  const formatTimestamp = (timestamp?: number) => {
    if (!timestamp) return "-"
    try {
      return new Date(timestamp).toLocaleString()
    } catch {
      return "-"
    }
  }

  const getSkipReasonLabel = (reason?: string) => {
    if (!reason) return "-"
    return t(`skipReasons.${reason}`, {
      defaultValue: t("skipReasons.unknown") as string,
    })
  }

  const renderStatusBadge = (snapshot: AutoCheckinAccountSnapshot) => {
    if (snapshot.lastResult) {
      switch (snapshot.lastResult.status) {
        case CHECKIN_RESULT_STATUS.SUCCESS:
        case CHECKIN_RESULT_STATUS.ALREADY_CHECKED:
          return (
            <span className="inline-flex items-center gap-1 rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-800 dark:bg-green-900 dark:text-green-200">
              <CheckCircleIcon className="h-3.5 w-3.5" />
              {t("execution.status.success")}
            </span>
          )
        case CHECKIN_RESULT_STATUS.FAILED:
          return (
            <span className="inline-flex items-center gap-1 rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-800 dark:bg-red-900 dark:text-red-200">
              <XCircleIcon className="h-3.5 w-3.5" />
              {t("execution.status.failed")}
            </span>
          )
        case CHECKIN_RESULT_STATUS.SKIPPED:
          return (
            <span className="inline-flex items-center gap-1 rounded-full bg-yellow-100 px-2 py-0.5 text-xs font-medium text-yellow-800 dark:bg-yellow-900 dark:text-yellow-100">
              <ExclamationTriangleIcon className="h-3.5 w-3.5" />
              {t("execution.status.skipped")}
            </span>
          )
        default:
          break
      }
    }

    if (snapshot.skipReason) {
      return (
        <span className="inline-flex items-center gap-1 rounded-full bg-yellow-100 px-2 py-0.5 text-xs font-medium text-yellow-800 dark:bg-yellow-900 dark:text-yellow-100">
          <ExclamationTriangleIcon className="h-3.5 w-3.5" />
          {t("execution.status.skipped")}
        </span>
      )
    }

    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-700 dark:bg-gray-800 dark:text-gray-200">
        <ClockIcon className="h-3.5 w-3.5" />
        {t("snapshot.badges.pending")}
      </span>
    )
  }

  const renderBooleanBadge = (
    value: boolean,
    trueLabel: string,
    falseLabel: string,
  ) => {
    return value ? (
      <span className="inline-flex rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-800 dark:bg-green-900 dark:text-green-200">
        {trueLabel}
      </span>
    ) : (
      <span className="inline-flex rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-600 dark:bg-gray-800 dark:text-gray-300">
        {falseLabel}
      </span>
    )
  }

  return (
    <Card padding="none">
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead className="bg-gray-50 dark:bg-gray-800">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium tracking-wider text-gray-500 uppercase dark:text-gray-400">
                {t("execution.table.accountName")}
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium tracking-wider text-gray-500 uppercase dark:text-gray-400">
                {t("snapshot.table.detection")}
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium tracking-wider text-gray-500 uppercase dark:text-gray-400">
                {t("snapshot.table.autoCheckin")}
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium tracking-wider text-gray-500 uppercase dark:text-gray-400">
                {t("snapshot.table.provider")}
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium tracking-wider text-gray-500 uppercase dark:text-gray-400">
                {t("snapshot.table.status")}
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium tracking-wider text-gray-500 uppercase dark:text-gray-400">
                {t("snapshot.table.skipReason")}
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium tracking-wider text-gray-500 uppercase dark:text-gray-400">
                {t("snapshot.table.lastResult")}
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200 bg-white dark:divide-gray-700 dark:bg-gray-900">
            {sortedSnapshots.map((snapshot) => (
              <tr
                key={snapshot.accountId}
                className="hover:bg-gray-50 dark:hover:bg-gray-800"
              >
                <td className="px-6 py-4 text-sm font-medium whitespace-nowrap text-gray-900 dark:text-gray-100">
                  <AccountLinkButton
                    accountId={snapshot.accountId}
                    accountName={snapshot.accountName}
                  />
                </td>
                <td className="px-6 py-4 text-sm whitespace-nowrap">
                  {renderBooleanBadge(
                    snapshot.detectionEnabled,
                    t("snapshot.badges.enabled"),
                    t("snapshot.badges.disabled"),
                  )}
                </td>
                <td className="px-6 py-4 text-sm whitespace-nowrap">
                  {renderBooleanBadge(
                    snapshot.autoCheckinEnabled,
                    t("snapshot.badges.enabled"),
                    t("snapshot.badges.disabled"),
                  )}
                </td>
                <td className="px-6 py-4 text-sm whitespace-nowrap">
                  {renderBooleanBadge(
                    snapshot.providerAvailable,
                    t("snapshot.badges.providerAvailable"),
                    t("snapshot.badges.providerUnavailable"),
                  )}
                </td>
                <td className="px-6 py-4 text-sm whitespace-nowrap text-gray-700 dark:text-gray-300">
                  {renderStatusBadge(snapshot)}
                </td>
                <td className="px-6 py-4 text-sm text-gray-500 dark:text-gray-400">
                  {getSkipReasonLabel(snapshot.skipReason)}
                </td>
                <td className="px-6 py-4 text-sm text-gray-500 dark:text-gray-400">
                  {snapshot.lastResult?.timestamp
                    ? formatTimestamp(snapshot.lastResult.timestamp)
                    : "-"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  )
}
