import { useEffect, useMemo, useRef, useState } from "react"
import toast from "react-hot-toast"
import { useTranslation } from "react-i18next"

import { RuntimeActionIds } from "~/constants/runtimeActions"
import { useUserPreferencesContext } from "~/contexts/UserPreferencesContext"
import { DEFAULT_PREFERENCES } from "~/services/preferences/userPreferences"
import type {
  AutoCheckinRunResult,
  AutoCheckinRunSummary,
} from "~/types/autoCheckin"
import { onRuntimeMessage, sendRuntimeMessage } from "~/utils/browserApi"
import { safeRandomUUID } from "~/utils/identifier"
import { createLogger } from "~/utils/logger"

/**
 * Unified logger scoped to UI-open auto check-in pretrigger hooks.
 */
const logger = createLogger("AutoCheckinUiOpenPretrigger")

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
      } finally {
        unsubscribe()
      }
    })()

    return () => {
      unsubscribe()
    }
  }, [shouldAttemptPretrigger, t])

  return {
    dialog,
    setDialogOpen: (open) =>
      setDialog((prev) => ({
        ...prev,
        isOpen: open,
      })),
  }
}
