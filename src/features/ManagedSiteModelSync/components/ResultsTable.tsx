import dayjs from "dayjs"
import { CircleAlert, CircleCheck, RefreshCw } from "lucide-react"
import { useEffect, useRef } from "react"
import { useTranslation } from "react-i18next"

import ManagedSiteChannelLinkButton from "~/components/ManagedSiteChannelLinkButton"
import { Badge, Button, Card } from "~/components/ui"
import type { ManagedResourceRef } from "~/services/apiAdapters/contracts/managedResourceNative"
import type { ExecutionHistoryItemResult } from "~/types/managedSiteModelSync"

import {
  getModelSyncHistoryItemKey,
  getModelSyncHistoryResourceId,
} from "../executionIdentity"

interface ResultsTableProps {
  items: ExecutionHistoryItemResult[]
  selectedKeys: Set<string>
  onSelectAll: (checked: boolean) => void
  onSelectItem: (resourceKey: string, checked: boolean) => void
  onRunSingle: (ref: ManagedResourceRef) => void
  isRunning: boolean
  runningResourceKey?: string | null
  canUseResource?: (ref: ManagedResourceRef) => boolean
  visibleColumns?: Partial<{
    status: boolean
    message: boolean
    attempts: boolean
    finishedAt: boolean
  }>
}

/**
 * Table displaying execution results with selection and per-channel actions.
 * @param props Component props bundle.
 * @param props.items Execution results to render.
 * @param props.selectedKeys Selected resource identity keys.
 * @param props.onSelectAll Handler to toggle all selections.
 * @param props.onSelectItem Handler to toggle a single selection.
 * @param props.onRunSingle Trigger to run sync for a single channel.
 * @param props.isRunning Whether any sync is currently running.
 * @param props.runningResourceKey Resource identity key currently executing, if any.
 * @param props.canUseResource Whether the reference belongs to the active managed site.
 * @param props.visibleColumns Optional column visibility overrides.
 * @returns Card containing results table.
 */
export default function ResultsTable({
  items,
  selectedKeys,
  onSelectAll,
  onSelectItem,
  onRunSingle,
  isRunning,
  runningResourceKey,
  visibleColumns,
  canUseResource = () => true,
}: ResultsTableProps) {
  const { t } = useTranslation("managedSiteModelSync")

  const selectableItems = items.filter(
    (item) => item.resourceRef && canUseResource(item.resourceRef),
  )
  const allSelected =
    selectableItems.length > 0 &&
    selectableItems.every((item) =>
      selectedKeys.has(getModelSyncHistoryItemKey(item)),
    )
  const someSelected = selectedKeys.size > 0 && !allSelected
  const selectAllRef = useRef<HTMLInputElement | null>(null)
  const columns = {
    status: visibleColumns?.status ?? true,
    message: visibleColumns?.message ?? true,
    attempts: visibleColumns?.attempts ?? true,
    finishedAt: visibleColumns?.finishedAt ?? true,
  }

  useEffect(() => {
    const element = selectAllRef.current
    if (!element) return

    element.indeterminate = someSelected
  }, [someSelected])

  return (
    <Card padding="none">
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead className="border-b border-gray-200 bg-gray-50 dark:border-gray-700 dark:bg-gray-800">
            <tr>
              <th className="px-4 py-3 text-left">
                <input
                  ref={selectAllRef}
                  type="checkbox"
                  aria-label={t("execution.table.selectAllChannels")}
                  checked={allSelected}
                  disabled={selectableItems.length === 0}
                  onChange={(e) => onSelectAll(e.target.checked)}
                  className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                />
              </th>
              {columns.status && (
                <th className="px-4 py-3 text-left text-sm font-medium text-gray-700 dark:text-gray-300">
                  {t("execution.table.status")}
                </th>
              )}
              <th className="px-4 py-3 text-left text-sm font-medium text-gray-700 dark:text-gray-300">
                {t("execution.table.channelId")}
              </th>
              <th className="px-4 py-3 text-left text-sm font-medium text-gray-700 dark:text-gray-300">
                {t("execution.table.channelName")}
              </th>
              {columns.message && (
                <th className="px-4 py-3 text-left text-sm font-medium text-gray-700 dark:text-gray-300">
                  {t("execution.table.message")}
                </th>
              )}
              {columns.attempts && (
                <th className="px-4 py-3 text-left text-sm font-medium text-gray-700 dark:text-gray-300">
                  {t("execution.table.attempts")}
                </th>
              )}
              {columns.finishedAt && (
                <th className="px-4 py-3 text-left text-sm font-medium text-gray-700 dark:text-gray-300">
                  {t("execution.table.finishedAt")}
                </th>
              )}
              <th className="sticky right-0 z-20 border-l border-gray-200 bg-gray-50 px-4 py-3 text-right text-sm font-medium text-gray-700 shadow-[-8px_0_12px_-12px_rgba(15,23,42,0.45)] dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300">
                {t("execution.table.actions")}
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
            {items.map((item) => {
              const resourceKey = getModelSyncHistoryItemKey(item)
              const available = Boolean(
                item.resourceRef && canUseResource(item.resourceRef),
              )
              const isRunningThis = runningResourceKey === resourceKey

              return (
                <tr
                  key={resourceKey}
                  className="group hover:bg-gray-50 dark:hover:bg-gray-800"
                >
                  <td className="px-4 py-3">
                    <input
                      type="checkbox"
                      aria-label={t("execution.table.selectChannel", {
                        name: item.channelName,
                      })}
                      checked={selectedKeys.has(resourceKey)}
                      disabled={!available}
                      onChange={(e) =>
                        onSelectItem(resourceKey, e.target.checked)
                      }
                      className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                    />
                  </td>
                  {columns.status && (
                    <td className="px-4 py-3">
                      {item.ok ? (
                        <CircleCheck className="h-5 w-5 text-green-600 dark:text-green-400" />
                      ) : (
                        <CircleAlert className="h-5 w-5 text-red-600 dark:text-red-400" />
                      )}
                    </td>
                  )}
                  <td className="px-4 py-3 text-sm text-gray-900 dark:text-white">
                    {getModelSyncHistoryResourceId(item)}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-900 dark:text-white">
                    <ManagedSiteChannelLinkButton
                      resourceRef={
                        available ? item.resourceRef ?? undefined : undefined
                      }
                      channelName={item.channelName}
                      className="h-auto justify-start p-0 text-sm"
                    />
                    {!available && (
                      <p className="mt-1 text-xs text-gray-600 dark:text-gray-400">
                        {t("execution.table.resourceUnavailable")}
                      </p>
                    )}
                  </td>
                  {columns.message && (
                    <td className="px-4 py-3">
                      {item.ok ? (
                        <Badge variant="success">
                          {t("execution.status.success")}
                        </Badge>
                      ) : (
                        <div>
                          <Badge variant="destructive">
                            {t("execution.status.failed")}
                          </Badge>
                          {item.message && (
                            <p className="mt-1 text-xs text-gray-600 dark:text-gray-400">
                              {item.message}
                            </p>
                          )}
                          {item.httpStatus && (
                            <p className="mt-1 text-xs text-gray-500">
                              HTTP: {item.httpStatus}
                            </p>
                          )}
                        </div>
                      )}
                    </td>
                  )}
                  {columns.attempts && (
                    <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-400">
                      {item.attempts}
                    </td>
                  )}
                  {columns.finishedAt && (
                    <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-400">
                      {item.finishedAt
                        ? dayjs(item.finishedAt).format("HH:mm:ss")
                        : "—"}
                    </td>
                  )}
                  <td className="sticky right-0 z-10 border-l border-gray-100 bg-white px-4 py-3 text-right shadow-[-8px_0_12px_-12px_rgba(15,23,42,0.45)] group-hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-900 dark:group-hover:bg-gray-800">
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() =>
                        item.resourceRef && onRunSingle(item.resourceRef)
                      }
                      disabled={isRunning || !available}
                      loading={isRunningThis}
                      aria-label={t("execution.table.syncChannel")}
                      title={t(
                        available
                          ? "execution.table.syncChannel"
                          : "execution.table.resourceUnavailable",
                      )}
                      leftIcon={<RefreshCw className="h-4 w-4" />}
                    />
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </Card>
  )
}
