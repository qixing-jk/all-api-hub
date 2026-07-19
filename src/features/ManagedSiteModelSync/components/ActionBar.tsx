import { ArrowPathIcon } from "@heroicons/react/24/outline"
import { useTranslation } from "react-i18next"

import { Button } from "~/components/ui"
import { ProductAnalyticsScope } from "~/contexts/ProductAnalyticsScopeContext"
import {
  MANAGED_SITE_MODEL_SYNC_ACTIONS,
  type ManagedSiteModelSyncAction,
} from "~/features/ManagedSiteModelSync/actionState"
import {
  PRODUCT_ANALYTICS_ENTRYPOINTS,
  PRODUCT_ANALYTICS_FEATURE_IDS,
  PRODUCT_ANALYTICS_SURFACE_IDS,
} from "~/services/productAnalytics/contracts"

const optionsEntrypoint = PRODUCT_ANALYTICS_ENTRYPOINTS.Options
const actionBarSurface =
  PRODUCT_ANALYTICS_SURFACE_IDS.OptionsManagedSiteModelSyncActionBar

interface ActionBarProps {
  isRunning: boolean
  activeAction?: ManagedSiteModelSyncAction | null
  isRefreshing?: boolean
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
 * @param props.activeAction Identifies the action awaiting its execution promise.
 * @param props.isRefreshing Shows refresh progress while the latest snapshot is being reloaded.
 * @param props.selectedCount Number of selected items for targeted runs.
 * @param props.failedCount Number of failed items eligible for retry.
 * @param props.onRunAll Handler to run all channels.
 * @param props.onRunSelected Handler to run only selected channels.
 * @param props.onRetryFailed Handler to retry failed executions.
 * @param props.onRefresh Handler to refresh execution results.
 */
export default function ActionBar({
  isRunning,
  activeAction,
  isRefreshing,
  selectedCount,
  failedCount,
  onRunAll,
  onRunSelected,
  onRetryFailed,
  onRefresh,
}: ActionBarProps) {
  const { t } = useTranslation("managedSiteModelSync")
  const isBusy = isRunning || activeAction != null

  return (
    <ProductAnalyticsScope
      entrypoint={optionsEntrypoint}
      featureId={PRODUCT_ANALYTICS_FEATURE_IDS.ManagedSiteModelSync}
      surfaceId={actionBarSurface}
    >
      <div className="flex flex-wrap gap-3">
        <Button
          onClick={onRunAll}
          variant="default"
          disabled={isBusy}
          loading={activeAction === MANAGED_SITE_MODEL_SYNC_ACTIONS.RUN_ALL}
          leftIcon={<ArrowPathIcon className="h-4 w-4" />}
        >
          {activeAction === MANAGED_SITE_MODEL_SYNC_ACTIONS.RUN_ALL
            ? t("execution.actions.runningAll")
            : t("execution.actions.runAll")}
        </Button>
        <Button
          onClick={onRunSelected}
          variant="secondary"
          disabled={isBusy || selectedCount === 0}
          loading={
            activeAction ===
            MANAGED_SITE_MODEL_SYNC_ACTIONS.RUN_SELECTED_HISTORY
          }
        >
          {activeAction === MANAGED_SITE_MODEL_SYNC_ACTIONS.RUN_SELECTED_HISTORY
            ? t("execution.actions.runningSelected")
            : `${t("execution.actions.runSelected")} (${selectedCount})`}
        </Button>
        <Button
          onClick={onRetryFailed}
          variant="outline"
          disabled={isBusy || failedCount === 0}
          loading={
            activeAction === MANAGED_SITE_MODEL_SYNC_ACTIONS.RETRY_FAILED
          }
        >
          {activeAction === MANAGED_SITE_MODEL_SYNC_ACTIONS.RETRY_FAILED
            ? t("execution.actions.retryingFailed")
            : t("execution.actions.retryFailed")}
        </Button>
        <Button
          onClick={onRefresh}
          variant="ghost"
          disabled={isBusy}
          loading={isRefreshing}
          leftIcon={<ArrowPathIcon className="h-4 w-4" />}
        >
          {isRefreshing
            ? t("common:status.refreshing")
            : t("execution.actions.refresh")}
        </Button>
      </div>
    </ProductAnalyticsScope>
  )
}
