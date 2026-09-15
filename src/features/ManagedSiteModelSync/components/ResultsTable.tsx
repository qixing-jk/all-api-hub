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
      <div className="overflow-x-auto rounded-[var(--corner-inner-radius)]">
        <table className="w-full">
          <thead className="border-border bg-surface-subtle dark:bg-card border-b">
            <tr>
              <th className="py-density-3 px-4 text-left">
                <input
                  ref={selectAllRef}
                  type="checkbox"
                  aria-label={t("execution.table.selectAllChannels")}
                  checked={allSelected}
                  disabled={selectableItems.length === 0}
                  onChange={(e) => onSelectAll(e.target.checked)}
                  className="border-border-strong text-theme-600 focus:ring-ring h-4 w-4 rounded"
                />
              </th>
              {columns.status && (
                <th className="text-secondary-foreground py-density-3 px-4 text-left text-sm font-medium">
                  {t("execution.table.status")}
                </th>
              )}
              <th className="text-secondary-foreground py-density-3 px-4 text-left text-sm font-medium">
                {t("execution.table.channelId")}
              </th>
              <th className="text-secondary-foreground py-density-3 px-4 text-left text-sm font-medium">
                {t("execution.table.channelName")}
              </th>
              {columns.message && (
                <th className="text-secondary-foreground py-density-3 px-4 text-left text-sm font-medium">
                  {t("execution.table.message")}
                </th>
              )}
              {columns.attempts && (
                <th className="text-secondary-foreground py-density-3 px-4 text-left text-sm font-medium">
                  {t("execution.table.attempts")}
                </th>
              )}
              {columns.finishedAt && (
                <th className="text-secondary-foreground py-density-3 px-4 text-left text-sm font-medium">
                  {t("execution.table.finishedAt")}
                </th>
              )}
              <th className="border-border bg-surface-subtle text-secondary-foreground dark:bg-card py-density-3 sticky right-0 z-20 border-l px-4 text-right text-sm font-medium shadow-[-8px_0_12px_-12px_var(--table-edge-shadow)]">
                {t("execution.table.actions")}
              </th>
            </tr>
          </thead>
          <tbody className="divide-border divide-y">
            {items.map((item) => {
              const resourceKey = getModelSyncHistoryItemKey(item)
              const available = Boolean(
                item.resourceRef && canUseResource(item.resourceRef),
              )
              const isRunningThis = runningResourceKey === resourceKey

              return (
                <tr
                  key={resourceKey}
                  className="group hover:bg-surface-subtle dark:hover:bg-card"
                >
                  <td className="py-density-3 px-4">
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
                      className="border-border-strong text-theme-600 focus:ring-ring h-4 w-4 rounded"
                    />
                  </td>
                  {columns.status && (
                    <td className="py-density-3 px-4">
                      {item.ok ? (
                        <CircleCheck className="text-success-text h-5 w-5" />
                      ) : (
                        <CircleAlert className="text-destructive-text h-5 w-5" />
                      )}
                    </td>
                  )}
                  <td className="text-foreground py-density-3 px-4 text-sm">
                    {getModelSyncHistoryResourceId(item)}
                  </td>
                  <td className="text-foreground py-density-3 px-4 text-sm">
                    <ManagedSiteChannelLinkButton
                      resourceRef={
                        available ? item.resourceRef ?? undefined : undefined
                      }
                      channelName={item.channelName}
                      className="h-auto min-h-0 justify-start p-0 text-sm"
                    />
                    {!available && (
                      <p className="text-muted-foreground mt-1 text-xs">
                        {t("execution.table.resourceUnavailable")}
                      </p>
                    )}
                  </td>
                  {columns.message && (
                    <td className="py-density-3 px-4">
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
                            <p className="text-muted-foreground mt-1 text-xs">
                              {item.message}
                            </p>
                          )}
                          {item.httpStatus && (
                            <p className="text-muted-foreground mt-1 text-xs">
                              HTTP: {item.httpStatus}
                            </p>
                          )}
                        </div>
                      )}
                    </td>
                  )}
                  {columns.attempts && (
                    <td className="text-muted-foreground py-density-3 px-4 text-sm">
                      {item.attempts}
                    </td>
                  )}
                  {columns.finishedAt && (
                    <td className="text-muted-foreground py-density-3 px-4 text-sm">
                      {item.finishedAt
                        ? dayjs(item.finishedAt).format("HH:mm:ss")
                        : "—"}
                    </td>
                  )}
                  <td className="border-border-subtle bg-card group-hover:bg-surface-subtle dark:border-border dark:bg-background dark:group-hover:bg-card py-density-3 sticky right-0 z-10 border-l px-4 text-right shadow-[-8px_0_12px_-12px_var(--table-edge-shadow)]">
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
