import {
  ArrowPathIcon,
  BugAntIcon,
  CalendarDaysIcon,
  PlayIcon,
} from "@heroicons/react/24/outline"
import type { MouseEventHandler } from "react"
import { useTranslation } from "react-i18next"

import { WorkflowTransitionIcon } from "~/components/icons/WorkflowTransitionIcon"
import { Button } from "~/components/ui"
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
  isDebugTriggering?: boolean
  isOpeningFailedManualSignIns?: boolean
  isOpeningExternalCheckIns?: boolean
  canOpenFailedManualSignIns?: boolean
  canOpenExternalCheckIns?: boolean
  onRunNow: () => void
  onRefresh: () => void
  onOpenFailedManualSignIns?: MouseEventHandler<HTMLButtonElement>
  onOpenExternalCheckIns?: MouseEventHandler<HTMLButtonElement>
  showDebugButtons?: boolean
  onDebugTriggerDailyAlarmNow?: () => void
  onDebugTriggerRetryAlarmNow?: () => void
  onDebugScheduleDailyAlarmForToday?: () => void
  onDebugEvaluateUiOpenPretrigger?: () => void
  onDebugTriggerUiOpenPretrigger?: () => void
  onDebugResetLastDailyRunDay?: () => void
}

/**
 * Provides run-now and refresh buttons for the auto-checkin dashboard.
 * @param props Component props bundle.
 * @param props.isRunning Disables the run-now action while execution is in progress.
 * @param props.isRefreshing Shows a loading state while the latest snapshot is being refreshed.
 * @param props.isDebugTriggering Disables actions while triggering debug alarm handlers.
 * @param props.isOpeningFailedManualSignIns Disables actions while bulk-opening failed manual sign-in pages.
 * @param props.isOpeningExternalCheckIns Disables actions while opening configured external check-in URLs.
 * @param props.canOpenFailedManualSignIns Whether the current status contains failed accounts that can be bulk-opened.
 * @param props.canOpenExternalCheckIns Whether any visible account has a configured external check-in URL.
 * @param props.onRunNow Handler triggered to start a manual execution.
 * @param props.onRefresh Handler triggered to refresh snapshot data.
 * @param props.onOpenFailedManualSignIns Handler triggered to bulk-open failed accounts' manual sign-in pages.
 * @param props.onOpenExternalCheckIns Handler triggered to open configured external check-in URLs.
 * @param props.showDebugButtons When true, shows dev-only alarm debug buttons.
 * @param props.onDebugTriggerDailyAlarmNow Triggers the daily alarm handler immediately (dev-only).
 * @param props.onDebugTriggerRetryAlarmNow Triggers the retry alarm handler immediately (dev-only).
 * @param props.onDebugScheduleDailyAlarmForToday Schedules the daily alarm to run later today (dev-only).
 * @param props.onDebugEvaluateUiOpenPretrigger Evaluates UI-open pre-trigger eligibility (dev-only).
 * @param props.onDebugTriggerUiOpenPretrigger Triggers the UI-open pre-trigger flow immediately (dev-only).
 * @param props.onDebugResetLastDailyRunDay Clears the stored last-daily marker so the flow can be rerun (dev-only).
 */
export default function ActionBar({
  isRunning,
  isRefreshing,
  isDebugTriggering,
  isOpeningFailedManualSignIns,
  isOpeningExternalCheckIns,
  canOpenFailedManualSignIns,
  canOpenExternalCheckIns,
  onRunNow,
  onRefresh,
  onOpenFailedManualSignIns,
  onOpenExternalCheckIns,
  showDebugButtons,
  onDebugTriggerDailyAlarmNow,
  onDebugTriggerRetryAlarmNow,
  onDebugScheduleDailyAlarmForToday,
  onDebugEvaluateUiOpenPretrigger,
  onDebugTriggerUiOpenPretrigger,
  onDebugResetLastDailyRunDay,
}: ActionBarProps) {
  const { t } = useTranslation("autoCheckin")
  const isBusy =
    isRunning ||
    isDebugTriggering === true ||
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
      <div className="space-y-1.5">
        <div className="flex flex-wrap gap-2">
          <Button
            onClick={onRunNow}
            disabled={isBusy}
            leftIcon={<PlayIcon className="h-4 w-4" />}
            data-testid={BASIC_SETTINGS_TEST_IDS.autoCheckinRunNowButton}
          >
            {t("execution.runNow")}
          </Button>
          <Button
            onClick={onRefresh}
            variant="secondary"
            disabled={isBusy || isRefreshing === true}
            loading={isRefreshing}
            leftIcon={<ArrowPathIcon className="h-4 w-4" />}
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
              leftIcon={<CalendarDaysIcon className="h-4 w-4" />}
              title={externalCheckInHint}
            >
              {isOpeningExternalCheckIns
                ? t("common:status.opening")
                : t("execution.actions.openExternal")}
            </Button>
          ) : null}
          {showDebugButtons && (
            <>
              <Button
                onClick={onDebugTriggerDailyAlarmNow}
                variant="outline"
                disabled={isBusy || !onDebugTriggerDailyAlarmNow}
                leftIcon={<BugAntIcon className="h-4 w-4" />}
              >
                {t("execution.debug.triggerDailyAlarmNow")}
              </Button>
              <Button
                onClick={onDebugTriggerRetryAlarmNow}
                variant="outline"
                disabled={isBusy || !onDebugTriggerRetryAlarmNow}
                leftIcon={<BugAntIcon className="h-4 w-4" />}
              >
                {t("execution.debug.triggerRetryAlarmNow")}
              </Button>
              <Button
                onClick={onDebugScheduleDailyAlarmForToday}
                variant="outline"
                disabled={isBusy || !onDebugScheduleDailyAlarmForToday}
                leftIcon={<BugAntIcon className="h-4 w-4" />}
              >
                {t("execution.debug.scheduleDailyAlarmForToday")}
              </Button>
              <Button
                onClick={onDebugEvaluateUiOpenPretrigger}
                variant="outline"
                disabled={isBusy || !onDebugEvaluateUiOpenPretrigger}
                leftIcon={<BugAntIcon className="h-4 w-4" />}
              >
                {t("execution.debug.evaluateUiOpenPretrigger")}
              </Button>
              <Button
                onClick={onDebugTriggerUiOpenPretrigger}
                variant="outline"
                disabled={isBusy || !onDebugTriggerUiOpenPretrigger}
                leftIcon={<BugAntIcon className="h-4 w-4" />}
              >
                {t("execution.debug.triggerUiOpenPretrigger")}
              </Button>
              <Button
                onClick={onDebugResetLastDailyRunDay}
                variant="outline"
                disabled={isBusy || !onDebugResetLastDailyRunDay}
                leftIcon={<BugAntIcon className="h-4 w-4" />}
              >
                {t("execution.debug.resetLastDailyRunDay")}
              </Button>
            </>
          )}
        </div>
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
