import { ArrowPathIcon } from "@heroicons/react/24/outline"
import { useTranslation } from "react-i18next"

import { Button } from "~/components/ui"

interface ActionBarProps {
  isRunning: boolean
  selectedCount: number
  failedCount: number
  onRunAll: () => void
  onRunSelected: () => void
  onRetryFailed: () => void
  onRefresh: () => void
}

/**
 * Action button cluster for New API Model Sync execution controls.
 * @param props Component props container with run/retry callbacks.
 * @param props.isRunning Disables buttons while sync is in progress.
 * @param props.selectedCount Number of selected items for targeted runs.
 * @param props.failedCount Number of failed items eligible for retry.
 * @param props.onRunAll Handler to run all channels.
 * @param props.onRunSelected Handler to run only selected channels.
 * @param props.onRetryFailed Handler to retry failed executions.
 * @param props.onRefresh Handler to refresh execution results.
 */
export default function ActionBar({
  isRunning,
  selectedCount,
  failedCount,
  onRunAll,
  onRunSelected,
  onRetryFailed,
  onRefresh,
}: ActionBarProps) {
  const { t } = useTranslation("newApiModelSync")

  return (
    <div className="flex flex-wrap gap-3">
      <Button
        onClick={onRunAll}
        variant="default"
        disabled={isRunning}
        leftIcon={<ArrowPathIcon className="h-4 w-4" />}
      >
        {t("execution.actions.runAll")}
      </Button>
      <Button
        onClick={onRunSelected}
        variant="secondary"
        disabled={isRunning || selectedCount === 0}
      >
        {t("execution.actions.runSelected")} ({selectedCount})
      </Button>
      <Button
        onClick={onRetryFailed}
        variant="outline"
        disabled={isRunning || failedCount === 0}
      >
        {t("execution.actions.retryFailed")}
      </Button>
      <Button
        onClick={onRefresh}
        variant="ghost"
        disabled={isRunning}
        leftIcon={<ArrowPathIcon className="h-4 w-4" />}
      >
        {t("execution.actions.refresh")}
      </Button>
    </div>
  )
}
