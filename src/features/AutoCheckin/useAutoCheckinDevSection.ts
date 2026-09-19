import { CalendarClock } from "lucide-react"
import { useCallback, useMemo, useState } from "react"
import { useTranslation } from "react-i18next"

import { MENU_ITEM_IDS } from "~/constants/optionsMenuIds"
import type { DevPanelSection } from "~/features/DevPanel/types"
import toast from "~/lib/notify"
import { sendAutoCheckinMessage } from "~/services/checkin/autoCheckin/messaging"
import { createAutomaticProtectionBypassExecution } from "~/services/protectionBypass/client"
import {
  PROTECTION_BYPASS_AUTOMATIC_TRIGGERS,
  PROTECTION_BYPASS_FEATURES,
} from "~/services/protectionBypass/contracts"
import { AutoCheckinMessageTypes } from "~/services/runtimeMessaging/messageTypes"
import type { AutoCheckinRunSummary } from "~/types/autoCheckin"
import { onRuntimeMessage } from "~/utils/browser/browserApi"
import { getCurrentTempWindowRequestSource } from "~/utils/browser/tempWindowRequestSource"
import { getErrorMessage } from "~/utils/core/error"
import { safeRandomUUID } from "~/utils/core/identifier"

import { AUTO_CHECKIN_DEBUG_ACTIONS } from "./actionState"
import { presentUiOpenPretriggerCompletion } from "./utils/pretriggerFeedback"

interface AutoCheckinDevSectionOptions {
  /** Reloads the page snapshot after actions that mutate background state. */
  refreshStatus?: () => Promise<unknown>
  /** Opens the page diagnostics dialog with the raw pre-trigger response. */
  onShowUiOpenPretriggerDiagnostics?: (payload: unknown) => void
  /** Opens the page completion dialog after a started pre-trigger run. */
  onShowUiOpenPretriggerCompletion?: (value: {
    isOpen: boolean
    summary: AutoCheckinRunSummary | null
    pendingRetry: boolean
  }) => void
}

/**
 * Auto-checkin alarm debug actions for the dev panel, moved from the page
 * action bar. Handlers only talk to the background service; the pretrigger
 * diagnostics dialog stays on the page where the snapshot is visible.
 */
export function useAutoCheckinDevSection(
  options: AutoCheckinDevSectionOptions = {},
): DevPanelSection {
  const { t } = useTranslation("autoCheckin")
  const {
    refreshStatus,
    onShowUiOpenPretriggerDiagnostics,
    onShowUiOpenPretriggerCompletion,
  } = options
  const [activeDebugAction, setActiveDebugAction] = useState<string | null>(
    null,
  )

  const runBasicAction = useCallback(
    async (
      debugAction: string,
      messageType:
        | typeof AutoCheckinMessageTypes.DebugTriggerDailyAlarmNow
        | typeof AutoCheckinMessageTypes.DebugTriggerRetryAlarmNow
        | typeof AutoCheckinMessageTypes.DebugResetLastDailyRunDay,
      messages: {
        loading: string
        success: string
        failure: (error: string) => string
      },
    ) => {
      setActiveDebugAction(debugAction)
      try {
        toast.loading(messages.loading)

        const response = await sendAutoCheckinMessage(messageType)

        toast.dismiss()

        if (response.success) {
          toast.success(messages.success)
          await refreshStatus?.()
        } else {
          toast.error(messages.failure(response.error ?? ""))
        }
      } catch (error) {
        toast.dismiss()
        toast.error(messages.failure(getErrorMessage(error)))
      } finally {
        setActiveDebugAction(null)
      }
    },
    [refreshStatus],
  )

  const handleTriggerDailyAlarmNow = useCallback(
    () =>
      runBasicAction(
        AUTO_CHECKIN_DEBUG_ACTIONS.TRIGGER_DAILY_ALARM,
        AutoCheckinMessageTypes.DebugTriggerDailyAlarmNow,
        {
          loading: t("messages.loading.triggeringDailyAlarm"),
          success: t("messages.success.dailyAlarmTriggered"),
          failure: (error) =>
            t("messages.error.dailyAlarmTriggerFailed", { error }),
        },
      ),
    [runBasicAction, t],
  )

  const handleTriggerRetryAlarmNow = useCallback(
    () =>
      runBasicAction(
        AUTO_CHECKIN_DEBUG_ACTIONS.TRIGGER_RETRY_ALARM,
        AutoCheckinMessageTypes.DebugTriggerRetryAlarmNow,
        {
          loading: t("messages.loading.triggeringRetryAlarm"),
          success: t("messages.success.retryAlarmTriggered"),
          failure: (error) =>
            t("messages.error.retryAlarmTriggerFailed", { error }),
        },
      ),
    [runBasicAction, t],
  )

  const handleScheduleDailyAlarmForToday = useCallback(async () => {
    setActiveDebugAction(AUTO_CHECKIN_DEBUG_ACTIONS.SCHEDULE_DAILY_ALARM)
    try {
      toast.loading(t("messages.loading.schedulingDailyAlarmForToday"))

      const response = await sendAutoCheckinMessage(
        AutoCheckinMessageTypes.DebugScheduleDailyAlarmForToday,
        { minutesFromNow: 60 },
      )

      toast.dismiss()

      if (response.success) {
        toast.success(t("messages.success.dailyAlarmScheduledForToday"))
        await refreshStatus?.()
      } else {
        toast.error(
          t("messages.error.dailyAlarmScheduleForTodayFailed", {
            error: response.error ?? "",
          }),
        )
      }
    } catch (error) {
      toast.dismiss()
      toast.error(
        t("messages.error.dailyAlarmScheduleForTodayFailed", {
          error: getErrorMessage(error),
        }),
      )
    } finally {
      setActiveDebugAction(null)
    }
  }, [refreshStatus, t])

  // Dry-run pre-trigger eligibility check; outcome-only feedback here since
  // the full diagnostics payload dialog lives on the AutoCheckin page.
  const handleEvaluateUiOpenPretrigger = useCallback(async () => {
    setActiveDebugAction(AUTO_CHECKIN_DEBUG_ACTIONS.EVALUATE_UI_OPEN_PRETRIGGER)
    try {
      toast.loading(t("messages.loading.evaluatingUiOpenPretrigger"))

      const tempWindowRequestSource = getCurrentTempWindowRequestSource()
      const protectionBypassExecution =
        createAutomaticProtectionBypassExecution(
          PROTECTION_BYPASS_FEATURES.Checkin,
          PROTECTION_BYPASS_AUTOMATIC_TRIGGERS.UiLifecycle,
          tempWindowRequestSource,
        )
      const response = await sendAutoCheckinMessage(
        AutoCheckinMessageTypes.PretriggerDailyOnUiOpen,
        {
          dryRun: true,
          debug: true,
          protectionBypassExecution,
        },
      )

      toast.dismiss()

      if (response.success) {
        onShowUiOpenPretriggerDiagnostics?.(response)

        if (response.eligible) {
          toast.success(t("messages.success.uiOpenPretriggerEligible"))
        } else {
          toast.error(
            t("messages.error.uiOpenPretriggerIneligible", {
              reason: response.ineligibleReason ?? "",
            }),
          )
        }
      } else {
        toast.error(
          t("messages.error.uiOpenPretriggerEvaluationFailed", {
            error: response.error ?? "",
          }),
        )
      }
    } catch (error) {
      toast.dismiss()
      toast.error(
        t("messages.error.uiOpenPretriggerEvaluationFailed", {
          error: getErrorMessage(error),
        }),
      )
    } finally {
      setActiveDebugAction(null)
    }
  }, [onShowUiOpenPretriggerDiagnostics, t])

  const handleTriggerUiOpenPretrigger = useCallback(async () => {
    const requestId = safeRandomUUID()
    let unsubscribe = () => {}

    setActiveDebugAction(AUTO_CHECKIN_DEBUG_ACTIONS.TRIGGER_UI_OPEN_PRETRIGGER)
    try {
      toast.loading(t("messages.loading.triggeringUiOpenPretrigger"))

      unsubscribe = onRuntimeMessage((message) => {
        if (
          message?.action === "autoCheckinPretrigger:started" &&
          message?.requestId === requestId
        ) {
          toast.success(t("messages.success.pretriggerStarted"))
        }
      })

      const tempWindowRequestSource = getCurrentTempWindowRequestSource()
      const protectionBypassExecution =
        createAutomaticProtectionBypassExecution(
          PROTECTION_BYPASS_FEATURES.Checkin,
          PROTECTION_BYPASS_AUTOMATIC_TRIGGERS.UiLifecycle,
          tempWindowRequestSource,
        )
      const response = await sendAutoCheckinMessage(
        AutoCheckinMessageTypes.PretriggerDailyOnUiOpen,
        {
          requestId,
          debug: true,
          protectionBypassExecution,
        },
      )

      toast.dismiss()

      if (!response.success) {
        toast.error(
          t("messages.error.uiOpenPretriggerTriggerFailed", {
            error: response.error ?? "",
          }),
        )
        return
      }

      if (!response.started) {
        toast.error(
          t("messages.error.uiOpenPretriggerDidNotStart", {
            reason: response.ineligibleReason ?? "",
          }),
        )
        onShowUiOpenPretriggerDiagnostics?.(response)
        return
      }

      onShowUiOpenPretriggerCompletion?.({
        isOpen: presentUiOpenPretriggerCompletion(response.summary, t),
        summary: response.summary ?? null,
        pendingRetry: Boolean(response.pendingRetry),
      })
      await refreshStatus?.()
    } catch (error) {
      toast.dismiss()
      toast.error(
        t("messages.error.uiOpenPretriggerTriggerFailed", {
          error: getErrorMessage(error),
        }),
      )
    } finally {
      unsubscribe()
      setActiveDebugAction(null)
    }
  }, [
    onShowUiOpenPretriggerCompletion,
    onShowUiOpenPretriggerDiagnostics,
    refreshStatus,
    t,
  ])

  const handleResetLastDailyRunDay = useCallback(
    () =>
      runBasicAction(
        AUTO_CHECKIN_DEBUG_ACTIONS.RESET_LAST_DAILY_RUN_DAY,
        AutoCheckinMessageTypes.DebugResetLastDailyRunDay,
        {
          loading: t("messages.loading.resettingLastDailyRunDay"),
          success: t("messages.success.lastDailyRunDayReset"),
          failure: (error) =>
            t("messages.error.lastDailyRunDayResetFailed", { error }),
        },
      ),
    [runBasicAction, t],
  )

  return useMemo(
    () => ({
      id: "auto-checkin-debug",
      title: "Auto check-in",
      icon: CalendarClock,
      pages: [MENU_ITEM_IDS.AUTO_CHECKIN],
      surfaces: ["options"],
      actions: [
        {
          id: "trigger-daily-alarm-now",
          label: t("execution.debug.triggerDailyAlarmNow"),
          loading:
            activeDebugAction ===
            AUTO_CHECKIN_DEBUG_ACTIONS.TRIGGER_DAILY_ALARM,
          disabled: activeDebugAction !== null,
          run: handleTriggerDailyAlarmNow,
        },
        {
          id: "trigger-retry-alarm-now",
          label: t("execution.debug.triggerRetryAlarmNow"),
          loading:
            activeDebugAction ===
            AUTO_CHECKIN_DEBUG_ACTIONS.TRIGGER_RETRY_ALARM,
          disabled: activeDebugAction !== null,
          run: handleTriggerRetryAlarmNow,
        },
        {
          id: "schedule-daily-alarm-for-today",
          label: t("execution.debug.scheduleDailyAlarmForToday"),
          loading:
            activeDebugAction ===
            AUTO_CHECKIN_DEBUG_ACTIONS.SCHEDULE_DAILY_ALARM,
          disabled: activeDebugAction !== null,
          run: handleScheduleDailyAlarmForToday,
        },
        {
          id: "evaluate-ui-open-pretrigger",
          label: t("execution.debug.evaluateUiOpenPretrigger"),
          loading:
            activeDebugAction ===
            AUTO_CHECKIN_DEBUG_ACTIONS.EVALUATE_UI_OPEN_PRETRIGGER,
          disabled: activeDebugAction !== null,
          run: handleEvaluateUiOpenPretrigger,
        },
        {
          id: "trigger-ui-open-pretrigger",
          label: t("execution.debug.triggerUiOpenPretrigger"),
          loading:
            activeDebugAction ===
            AUTO_CHECKIN_DEBUG_ACTIONS.TRIGGER_UI_OPEN_PRETRIGGER,
          disabled: activeDebugAction !== null,
          run: handleTriggerUiOpenPretrigger,
        },
        {
          id: "reset-last-daily-run-day",
          label: t("execution.debug.resetLastDailyRunDay"),
          loading:
            activeDebugAction ===
            AUTO_CHECKIN_DEBUG_ACTIONS.RESET_LAST_DAILY_RUN_DAY,
          disabled: activeDebugAction !== null,
          run: handleResetLastDailyRunDay,
        },
      ],
    }),
    [
      activeDebugAction,
      handleEvaluateUiOpenPretrigger,
      handleResetLastDailyRunDay,
      handleScheduleDailyAlarmForToday,
      handleTriggerDailyAlarmNow,
      handleTriggerRetryAlarmNow,
      handleTriggerUiOpenPretrigger,
      t,
    ],
  )
}
