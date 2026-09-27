import { FileText, Languages, Sparkles, TriangleAlert } from "lucide-react"
import { useCallback, useMemo, useState } from "react"

import { useUpdateLogDialogContext } from "~/components/dialogs/UpdateLogDialog"
import toast from "~/lib/notify"
import { debugQueuePopupInterruptionHint } from "~/services/popupInterruptionHint"
import { changelogOnUpdateState } from "~/services/updates/changelogOnUpdateState"
import { getExtensionVersion } from "~/utils/browser/browserApi"
import { getErrorMessage } from "~/utils/core/error"
import { createLogger } from "~/utils/core/logger"
import { openPermissionsOnboardingPage } from "~/utils/navigation"

import type { DevPanelSection } from "../types"

const logger = createLogger("DevDialogDebugSection")

/**
 * Builds the DOMException shape React commonly reports after browser translation rewrites DOM nodes.
 */
function createDevTranslationCrashError() {
  return new DOMException(
    "Failed to execute 'removeChild' on 'Node': The node to be removed is not a child of this node.",
    "NotFoundError",
  )
}

/**
 * Global dialog-debug actions formerly hosted by the header DevDialogDebugMenu.
 * Throwing state (translation crash) lives here so the failure surfaces through
 * the same root error boundary as before.
 */
export function useDialogDebugDevSection(): DevPanelSection {
  const { openDialog } = useUpdateLogDialogContext()
  const [shouldTriggerTranslationCrash, setShouldTriggerTranslationCrash] =
    useState(false)

  if (shouldTriggerTranslationCrash) {
    throw createDevTranslationCrashError()
  }

  const handleTriggerUpdateLog = useCallback(async () => {
    try {
      const version = getExtensionVersion("")
      if (!version) return

      await changelogOnUpdateState.setPendingVersion(version)
      const pendingVersion =
        await changelogOnUpdateState.consumePendingVersion()
      if (!pendingVersion) return

      openDialog(pendingVersion)
    } catch (error) {
      const message = getErrorMessage(error)
      logger.debug("Failed to trigger update log (dev)", { error: message })
      toast.error(`Failed to trigger update log (dev): ${message}`)
    }
  }, [openDialog])

  const handleTriggerOnboarding = useCallback(async () => {
    try {
      await openPermissionsOnboardingPage({ reason: "debug" })
    } catch (error) {
      const message = getErrorMessage(error)
      logger.debug("Failed to trigger onboarding (dev)", { error: message })
      toast.error(`Failed to trigger onboarding (dev): ${message}`)
    }
  }, [])

  const handleQueuePopupInterruptionHint = useCallback(async () => {
    try {
      await debugQueuePopupInterruptionHint()
      toast.success("Queued popup interruption hint (dev)")
    } catch (error) {
      const message = getErrorMessage(error)
      logger.debug("Failed to queue popup interruption hint (dev)", {
        error: message,
      })
      toast.error(`Failed to queue popup interruption hint (dev): ${message}`)
    }
  }, [])

  return useMemo(
    () => ({
      id: "dialog-debug",
      title: "Dialogs",
      surfaces: ["options", "popup", "sidepanel"] as const,
      actions: [
        {
          id: "trigger-update-log",
          label: "Dev: Trigger update log",
          icon: FileText,
          run: handleTriggerUpdateLog,
        },
        {
          id: "trigger-onboarding",
          label: "Dev: Trigger onboarding",
          icon: Sparkles,
          run: handleTriggerOnboarding,
        },
        {
          id: "queue-popup-interruption-hint",
          label: "Dev: Queue popup interruption hint",
          icon: TriangleAlert,
          run: handleQueuePopupInterruptionHint,
        },
        {
          id: "trigger-translation-crash",
          label: "Dev: Trigger translation crash",
          icon: Languages,
          run: () => setShouldTriggerTranslationCrash(true),
        },
      ],
    }),
    [
      handleQueuePopupInterruptionHint,
      handleTriggerOnboarding,
      handleTriggerUpdateLog,
    ],
  )
}
