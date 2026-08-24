import {
  CircleCheck,
  CircleX,
  Clock,
  Search,
  TriangleAlert,
} from "lucide-react"
import { useMemo, useState } from "react"
import { useTranslation } from "react-i18next"

import AccountLinkButton from "~/components/AccountLinkButton"
import {
  Card,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "~/components/ui"
import {
  filterAutoCheckinSnapshots,
  SNAPSHOT_READINESS_FILTER,
  SNAPSHOT_STATUS_FILTER,
  type SnapshotReadinessFilter,
  type SnapshotStatusFilter,
} from "~/features/AutoCheckin/utils/snapshotFilters"
import {
  CHECKIN_RESULT_STATUS,
  translateAutoCheckinSkipReason,
  type AutoCheckinAccountSnapshot,
  type AutoCheckinSkipReason,
} from "~/types/autoCheckin"

import { formatTimestamp } from "../utils/tableUtils"
import TableFilteredEmptyState from "./TableFilteredEmptyState"
import TableFilterToolbar from "./TableFilterToolbar"

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
  const [keyword, setKeyword] = useState("")
  const [readinessFilter, setReadinessFilter] =
    useState<SnapshotReadinessFilter>(SNAPSHOT_READINESS_FILTER.ALL)
  const [statusFilter, setStatusFilter] = useState<SnapshotStatusFilter>(
    SNAPSHOT_STATUS_FILTER.ALL,
  )
  const isFiltered =
    Boolean(keyword.trim()) ||
    readinessFilter !== SNAPSHOT_READINESS_FILTER.ALL ||
    statusFilter !== SNAPSHOT_STATUS_FILTER.ALL

  const filteredSnapshots = useMemo(
    () =>
      filterAutoCheckinSnapshots(
        snapshots,
        readinessFilter,
        statusFilter,
        keyword,
        t,
      ),
    [keyword, readinessFilter, snapshots, statusFilter, t],
  )

  const getSkipReasonLabel = (reason?: AutoCheckinSkipReason) => {
    if (!reason) return "-"
    return translateAutoCheckinSkipReason(t, reason)
  }

  const renderStatusBadge = (snapshot: AutoCheckinAccountSnapshot) => {
    if (snapshot.lastResult) {
      switch (snapshot.lastResult.status) {
        case CHECKIN_RESULT_STATUS.SUCCESS:
        case CHECKIN_RESULT_STATUS.ALREADY_CHECKED:
          return (
            <span className="inline-flex items-center gap-1 rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-800 dark:bg-green-900 dark:text-green-200">
              <CircleCheck className="h-3.5 w-3.5" />
              {t("execution.status.success")}
            </span>
          )
        case CHECKIN_RESULT_STATUS.FAILED:
          return (
            <span className="inline-flex items-center gap-1 rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-800 dark:bg-red-900 dark:text-red-200">
              <CircleX className="h-3.5 w-3.5" />
              {t("execution.status.failed")}
            </span>
          )
        case CHECKIN_RESULT_STATUS.SKIPPED:
          return (
            <span className="inline-flex items-center gap-1 rounded-full bg-yellow-100 px-2 py-0.5 text-xs font-medium text-yellow-800 dark:bg-yellow-900 dark:text-yellow-100">
              <TriangleAlert className="h-3.5 w-3.5" />
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
          <TriangleAlert className="h-3.5 w-3.5" />
          {t("execution.status.skipped")}
        </span>
      )
    }

    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-700 dark:bg-gray-800 dark:text-gray-200">
        <Clock className="h-3.5 w-3.5" />
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

  const clearFilters = () => {
    setKeyword("")
    setReadinessFilter(SNAPSHOT_READINESS_FILTER.ALL)
    setStatusFilter(SNAPSHOT_STATUS_FILTER.ALL)
  }
  const countLabel = isFiltered
    ? t("snapshot.filters.countFiltered", {
        filtered: filteredSnapshots.length,
        total: snapshots.length,
      })
    : t("snapshot.filters.countTotal", { total: snapshots.length })

  return (
    <Card padding="none">
      <TableFilterToolbar
        countLabel={countLabel}
        clearLabel={t("snapshot.filters.clearAll")}
        showClear={isFiltered && filteredSnapshots.length > 0}
        onClearFilters={clearFilters}
        controlsClassName="grid gap-2 md:grid-cols-[minmax(14rem,1fr)_13rem_11rem]"
      >
        <Input
          type="text"
          aria-label={t("snapshot.filters.searchLabel")}
          placeholder={t("snapshot.filters.searchPlaceholder")}
          value={keyword}
          onChange={(event) => setKeyword(event.target.value)}
          leftIcon={<Search className="h-4 w-4" />}
          onClear={() => setKeyword("")}
          clearButtonLabel={t("common:actions.clear")}
        />
        <Select
          value={readinessFilter}
          onValueChange={(value) =>
            setReadinessFilter(value as SnapshotReadinessFilter)
          }
        >
          <SelectTrigger
            className="h-9 w-full"
            aria-label={t("snapshot.filters.readinessLabel")}
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={SNAPSHOT_READINESS_FILTER.ALL}>
              {t("snapshot.filters.readinessAll")}
            </SelectItem>
            <SelectItem value={SNAPSHOT_READINESS_FILTER.READY}>
              {t("snapshot.filters.readinessReady")}
            </SelectItem>
            <SelectItem value={SNAPSHOT_READINESS_FILTER.SETUP_REQUIRED}>
              {t("snapshot.filters.readinessSetupRequired")}
            </SelectItem>
            <SelectItem value={SNAPSHOT_READINESS_FILTER.DISABLED}>
              {t("snapshot.filters.readinessDisabled")}
            </SelectItem>
            <SelectItem value={SNAPSHOT_READINESS_FILTER.UNSUPPORTED}>
              {t("snapshot.filters.readinessUnsupported")}
            </SelectItem>
            <SelectItem
              value={SNAPSHOT_READINESS_FILTER.TEMPORARILY_UNAVAILABLE}
            >
              {t("snapshot.filters.readinessTemporarilyUnavailable")}
            </SelectItem>
          </SelectContent>
        </Select>
        <Select
          value={statusFilter}
          onValueChange={(value) =>
            setStatusFilter(value as SnapshotStatusFilter)
          }
        >
          <SelectTrigger
            className="h-9 w-full"
            aria-label={t("snapshot.filters.statusLabel")}
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={SNAPSHOT_STATUS_FILTER.ALL}>
              {t("snapshot.filters.statusAll")}
            </SelectItem>
            <SelectItem value={SNAPSHOT_STATUS_FILTER.SUCCESS}>
              {t("execution.status.success")}
            </SelectItem>
            <SelectItem value={SNAPSHOT_STATUS_FILTER.FAILED}>
              {t("execution.status.failed")}
            </SelectItem>
            <SelectItem value={SNAPSHOT_STATUS_FILTER.SKIPPED}>
              {t("execution.status.skipped")}
            </SelectItem>
            <SelectItem value={SNAPSHOT_STATUS_FILTER.PENDING}>
              {t("snapshot.badges.pending")}
            </SelectItem>
          </SelectContent>
        </Select>
      </TableFilterToolbar>
      {filteredSnapshots.length === 0 ? (
        <TableFilteredEmptyState
          title={t("snapshot.filters.noMatches")}
          description={t("snapshot.filters.noMatchesDescription")}
          clearLabel={t("snapshot.filters.clearAll")}
          onClearFilters={clearFilters}
        />
      ) : (
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
              {filteredSnapshots.map((snapshot) => (
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
                      t("snapshot.badges.methodSelected"),
                      t("snapshot.badges.methodNotSelected"),
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
      )}
    </Card>
  )
}
