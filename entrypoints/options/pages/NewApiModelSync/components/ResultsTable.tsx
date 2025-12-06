import {
  ArrowPathIcon,
  CheckCircleIcon,
  ExclamationCircleIcon,
} from "@heroicons/react/24/outline"
import dayjs from "dayjs"
import { useTranslation } from "react-i18next"

import { Badge, Button, Card } from "~/components/ui"
import type { ExecutionItemResult } from "~/types/newApiModelSync"

interface ResultsTableProps {
  items: ExecutionItemResult[]
  selectedIds: Set<number>
  onSelectAll: (checked: boolean) => void
  onSelectItem: (id: number, checked: boolean) => void
  onRunSingle: (channelId: number) => void
  isRunning: boolean
  runningChannelId?: number | null
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
 * @param props.selectedIds Selected channel ids.
 * @param props.onSelectAll Handler to toggle all selections.
 * @param props.onSelectItem Handler to toggle a single selection.
 * @param props.onRunSingle Trigger to run sync for a single channel.
 * @param props.isRunning Whether any sync is currently running.
 * @param props.runningChannelId Channel id currently executing, if any.
 * @param props.visibleColumns Optional column visibility overrides.
 * @returns Card containing results table.
 */
export default function ResultsTable({
  items,
  selectedIds,
  onSelectAll,
  onSelectItem,
  onRunSingle,
  isRunning,
  runningChannelId,
  visibleColumns,
}: ResultsTableProps) {
  const { t } = useTranslation("newApiModelSync")

  const allSelected = items.length > 0 && selectedIds.size === items.length
  const columns = {
    status: visibleColumns?.status ?? true,
    message: visibleColumns?.message ?? true,
    attempts: visibleColumns?.attempts ?? true,
    finishedAt: visibleColumns?.finishedAt ?? true,
  }

  return (
    <Card padding="none">
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead className="border-b border-gray-200 bg-gray-50 dark:border-gray-700 dark:bg-gray-800">
            <tr>
              <th className="px-4 py-3 text-left">
                <input
                  type="checkbox"
                  checked={allSelected}
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
              <th className="px-4 py-3 text-right text-sm font-medium text-gray-700 dark:text-gray-300">
                {t("execution.table.actions")}
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
            {items.map((item) => {
              const isRunningThis = runningChannelId === item.channelId

              return (
                <tr
                  key={item.channelId}
                  className="hover:bg-gray-50 dark:hover:bg-gray-800"
                >
                  <td className="px-4 py-3">
                    <input
                      type="checkbox"
                      checked={selectedIds.has(item.channelId)}
                      onChange={(e) =>
                        onSelectItem(item.channelId, e.target.checked)
                      }
                      className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                    />
                  </td>
                  {columns.status && (
                    <td className="px-4 py-3">
                      {item.ok ? (
                        <CheckCircleIcon className="h-5 w-5 text-green-600 dark:text-green-400" />
                      ) : (
                        <ExclamationCircleIcon className="h-5 w-5 text-red-600 dark:text-red-400" />
                      )}
                    </td>
                  )}
                  <td className="px-4 py-3 text-sm text-gray-900 dark:text-white">
                    {item.channelId}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-900 dark:text-white">
                    {item.channelName}
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
                  <td className="px-4 py-3 text-right">
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => onRunSingle(item.channelId)}
                      disabled={isRunning}
                      loading={isRunningThis}
                      title={t("execution.table.syncChannel")}
                    >
                      {!isRunningThis && <ArrowPathIcon className="h-4 w-4" />}
                    </Button>
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
