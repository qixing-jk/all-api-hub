import { CalendarDays, Play, RefreshCw } from "lucide-react"
import type { MouseEventHandler } from "react"
import { useTranslation } from "react-i18next"

import { WorkflowTransitionIcon } from "~/components/icons/WorkflowTransitionIcon"
import { ActionGroup, Button } from "~/components/ui"
import { ProductAnalyticsScope } from "~/contexts/ProductAnalyticsScopeContext"
import { BASIC_SETTINGS_TEST_IDS } from "~/features/BasicSettings/testIds"
import {
  PRODUCT_ANALYTICS_ENTRYPOINTS,
  PRODUCT_ANALYTICS_FEATURE_IDS,
  PRODUCT_ANALYTICS_SURFACE_IDS,
} from "~/services/productAnalytics/contracts"

interface ActionBarProps {
  isRunning: boolean
  isRefreshing?: boolean
  isRefreshLocked?: boolean
  /** Dev-panel debug action in flight; locks the toolbar without owning it. */
  isDebugActionPending?: boolean
  isOpeningFailedManualSignIns?: boolean
  isOpeningExternalCheckIns?: boolean
  canOpenFailedManualSignIns?: boolean
  canOpenExternalCheckIns?: boolean
  onRunNow: () => void
  onRefresh: () => void
  onOpenFailedManualSignIns?: MouseEventHandler<HTMLButtonElement>
  onOpenExternalCheckIns?: MouseEventHandler<HTMLButtonElement>
}

/**
 * Provides run-now and refresh buttons for the auto-checkin dashboard.
 * @param props Component props bundle.
 * @param props.isRunning Disables the run-now action while execution is in progress.
 * @param props.isRefreshing Shows loading while a manual refresh is pending.
 * @param props.isRefreshLocked Disables refresh without attributing the pending work to that action.
 * @param props.isDebugActionPending Disables the toolbar while a dev-panel debug action runs.
 * @param props.isOpeningFailedManualSignIns Disables actions while bulk-opening failed manual sign-in pages.
 * @param props.isOpeningExternalCheckIns Disables actions while opening configured external check-in URLs.
 * @param props.canOpenFailedManualSignIns Whether the current status contains failed accounts that can be bulk-opened.
 * @param props.canOpenExternalCheckIns Whether any visible account has a configured external check-in URL.
 * @param props.onRunNow Handler triggered to start a manual execution.
 * @param props.onRefresh Handler triggered to refresh snapshot data.
 * @param props.onOpenFailedManualSignIns Handler triggered to bulk-open failed accounts' manual sign-in pages.
 * @param props.onOpenExternalCheckIns Handler triggered to open configured external check-in URLs.
 */
export default function ActionBar({
  isRunning,
  isRefreshing,
  isRefreshLocked,
  isDebugActionPending,
  isOpeningFailedManualSignIns,
  isOpeningExternalCheckIns,
  canOpenFailedManualSignIns,
  canOpenExternalCheckIns,
  onRunNow,
  onRefresh,
  onOpenFailedManualSignIns,
  onOpenExternalCheckIns,
}: ActionBarProps) {
  const { t } = useTranslation("autoCheckin")
  const isBusy =
    isRunning ||
    isDebugActionPending === true ||
    isOpeningFailedManualSignIns === true ||
    isOpeningExternalCheckIns === true
  const bulkManualHint = t("execution.hints.openFailedManualNewWindow")
  const externalCheckInHint = t("execution.hints.openExternalCheckIn")
  const toolbarSurface =
    PRODUCT_ANALYTICS_SURFACE_IDS.OptionsAutoCheckinActionBar

  return (
    <ProductAnalyticsScope
      entrypoint={PRODUCT_ANALYTICS_ENTRYPOINTS.Options}
      featureId={PRODUCT_ANALYTICS_FEATURE_IDS.AutoCheckin}
      surfaceId={toolbarSurface}
    >
      <div className="space-y-density-1-5">
        <ActionGroup className="items-stretch justify-start">
          <Button
            onClick={onRunNow}
            disabled={isBusy}
            loading={isRunning}
            leftIcon={<Play className="h-4 w-4" />}
            data-testid={BASIC_SETTINGS_TEST_IDS.autoCheckinRunNowButton}
          >
            {isRunning ? t("messages.loading.running") : t("execution.runNow")}
          </Button>
          <Button
            onClick={onRefresh}
            variant="secondary"
            disabled={isBusy || isRefreshLocked}
            loading={isRefreshing}
            leftIcon={<RefreshCw className="h-4 w-4" />}
          >
            {isRefreshing
              ? t("common:status.refreshing")
              : t("execution.refresh")}
          </Button>
          <Button
            onClick={onOpenFailedManualSignIns}
            variant="outline"
            disabled={
              isBusy ||
              !canOpenFailedManualSignIns ||
              !onOpenFailedManualSignIns
            }
            loading={isOpeningFailedManualSignIns}
            leftIcon={<WorkflowTransitionIcon className="h-4 w-4" />}
            title={bulkManualHint}
          >
            {isOpeningFailedManualSignIns
              ? t("common:status.opening")
              : t("execution.actions.openFailedManual")}
          </Button>
          {canOpenExternalCheckIns && onOpenExternalCheckIns ? (
            <Button
              onClick={onOpenExternalCheckIns}
              variant="outline"
              disabled={isBusy}
              loading={isOpeningExternalCheckIns}
              leftIcon={<CalendarDays className="h-4 w-4" />}
              title={externalCheckInHint}
            >
              {isOpeningExternalCheckIns
                ? t("common:status.opening")
                : t("execution.actions.openExternal")}
            </Button>
          ) : null}
        </ActionGroup>
        {canOpenFailedManualSignIns && onOpenFailedManualSignIns ? (
          <p className="text-muted-foreground text-xs">{bulkManualHint}</p>
        ) : null}
        {canOpenExternalCheckIns && onOpenExternalCheckIns ? (
          <p className="text-muted-foreground text-xs">{externalCheckInHint}</p>
        ) : null}
      </div>
    </ProductAnalyticsScope>
  )
}
