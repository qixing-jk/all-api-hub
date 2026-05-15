import { useEffect, useMemo, useRef, useState } from "react"
import toast from "react-hot-toast"
import { useTranslation } from "react-i18next"

import { RuntimeActionIds } from "~/constants/runtimeActions"
import { useUserPreferencesContext } from "~/contexts/UserPreferencesContext"
import { DEFAULT_PREFERENCES } from "~/services/preferences/userPreferences"
import {
  trackProductAnalyticsActionCompleted,
  trackProductAnalyticsActionStarted,
} from "~/services/productAnalytics/actions"
import { trackAutoCheckinConfigSnapshot } from "~/services/productAnalytics/autoCheckin"
import {
  PRODUCT_ANALYTICS_ACTION_IDS,
  PRODUCT_ANALYTICS_ENTRYPOINTS,
  PRODUCT_ANALYTICS_FEATURE_IDS,
  PRODUCT_ANALYTICS_RESULTS,
  PRODUCT_ANALYTICS_SURFACE_IDS,
} from "~/services/productAnalytics/events"
import type {
  AutoCheckinRunResult,
  AutoCheckinRunSummary,
} from "~/types/autoCheckin"
import { AUTO_CHECKIN_RUN_RESULT } from "~/types/autoCheckin"
import {
  onRuntimeMessage,
  sendRuntimeMessage,
} from "~/utils/browser/browserApi"
import { safeRandomUUID } from "~/utils/core/identifier"
import { createLogger } from "~/utils/core/logger"

/**
 * Unified logger scoped to UI-open auto check-in pretrigger hooks.
 */
const logger = createLogger("AutoCheckinUiOpenPretrigger")

const UI_OPEN_PRETRIGGER_ANALYTICS_CONTEXT = {
  featureId: PRODUCT_ANALYTICS_FEATURE_IDS.AutoCheckin,
  actionId: PRODUCT_ANALYTICS_ACTION_IDS.RunAutoCheckinNow,
  surfaceId: PRODUCT_ANALYTICS_SURFACE_IDS.OptionsAutoCheckinActionBar,
  entrypoint: PRODUCT_ANALYTICS_ENTRYPOINTS.Options,
} as const

/**
 * Maps a pretrigger response to the fixed product analytics result enum.
 */
function toAnalyticsResult(
  response: {
    success?: boolean
    started?: boolean
    lastRunResult?: AutoCheckinRunResult | null
  } | null,
) {
  if (!response?.success || !response.started) {
    return PRODUCT_ANALYTICS_RESULTS.Skipped
  }

  if (response.lastRunResult === AUTO_CHECKIN_RUN_RESULT.FAILED) {
    return PRODUCT_ANALYTICS_RESULTS.Failure
  }

  return PRODUCT_ANALYTICS_RESULTS.Success
}

interface UiOpenPretriggerDialogState {
  isOpen: boolean
  summary: AutoCheckinRunSummary | null
  lastRunResult: AutoCheckinRunResult | null
  pendingRetry: boolean
}

/**
 * Triggers today's scheduled daily auto check-in early when an extension UI surface opens.
 *
 * Behavior:
 * - If the pretrigger preference is enabled, sends a background message to conditionally
 *   start today's daily run early.
 * - Shows a toast when background reports the run started.
 * - Shows a completion dialog once the background run finishes and returns a summary.
 */
export function useAutoCheckinUiOpenPretrigger(): {
  dialog: UiOpenPretriggerDialogState
  setDialogOpen: (open: boolean) => void
} {
  const { t } = useTranslation("autoCheckin")
  const { preferences, isLoading } = useUserPreferencesContext()

  const autoCheckinPreferences =
    preferences?.autoCheckin ?? DEFAULT_PREFERENCES.autoCheckin!

  const shouldAttemptPretrigger = useMemo(() => {
    return (
      !isLoading &&
      autoCheckinPreferences.globalEnabled &&
      autoCheckinPreferences.pretriggerDailyOnUiOpen
    )
  }, [autoCheckinPreferences, isLoading])

  const [dialog, setDialog] = useState<UiOpenPretriggerDialogState>({
    isOpen: false,
    summary: null,
    lastRunResult: null,
    pendingRetry: false,
  })

  const hasTriggeredRef = useRef(false)

  useEffect(() => {
    if (!shouldAttemptPretrigger) {
      return
    }

    if (hasTriggeredRef.current) {
      return
    }
    hasTriggeredRef.current = true

    const requestId = safeRandomUUID()
    void trackProductAnalyticsActionStarted(
      UI_OPEN_PRETRIGGER_ANALYTICS_CONTEXT,
    )
    trackAutoCheckinConfigSnapshot(
      autoCheckinPreferences,
      PRODUCT_ANALYTICS_ENTRYPOINTS.Options,
    )

    const unsubscribe = onRuntimeMessage((message) => {
      if (
        message?.action === RuntimeActionIds.AutoCheckinPretriggerStarted &&
        message?.requestId === requestId
      ) {
        toast.success(t("messages.success.pretriggerStarted"))
      }
    })

    void (async () => {
      try {
        const response = await sendRuntimeMessage({
          action: RuntimeActionIds.AutoCheckinPretriggerDailyOnUiOpen,
          requestId,
        })

        void trackProductAnalyticsActionCompleted({
          ...UI_OPEN_PRETRIGGER_ANALYTICS_CONTEXT,
          result: toAnalyticsResult(response),
          insights: response?.summary
            ? {
                itemCount: response.summary.totalEligible,
                successCount: response.summary.successCount,
                failureCount: response.summary.failedCount,
                skippedCount: response.summary.skippedCount,
              }
            : undefined,
        })

        if (!response?.success || !response?.started) {
          return
        }

        setDialog({
          isOpen: true,
          summary: response?.summary ?? null,
          lastRunResult: response?.lastRunResult ?? null,
          pendingRetry: Boolean(response?.pendingRetry),
        })
      } catch (error) {
        logger.error("UI-open pretrigger request failed", error)
        void trackProductAnalyticsActionCompleted({
          ...UI_OPEN_PRETRIGGER_ANALYTICS_CONTEXT,
          result: PRODUCT_ANALYTICS_RESULTS.Failure,
        })
      } finally {
        unsubscribe()
      }
    })()

    return () => {
      unsubscribe()
    }
  }, [autoCheckinPreferences, shouldAttemptPretrigger, t])

  return {
    dialog,
    setDialogOpen: (open) =>
      setDialog((prev) => ({
        ...prev,
        isOpen: open,
      })),
  }
}
