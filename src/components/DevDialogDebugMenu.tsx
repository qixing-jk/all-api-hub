import {
  BugAntIcon,
  DocumentTextIcon,
  ExclamationTriangleIcon,
  LanguageIcon,
  SparklesIcon,
} from "@heroicons/react/24/outline"
import { useCallback, useState } from "react"
import toast from "react-hot-toast"

import { useUpdateLogDialogContext } from "~/components/dialogs/UpdateLogDialog"
import Tooltip from "~/components/Tooltip"
import { IconButton } from "~/components/ui"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "~/components/ui/dropdown-menu"
import { debugQueuePopupInterruptionHint } from "~/services/popupInterruptionHint"
import { changelogOnUpdateState } from "~/services/updates/changelogOnUpdateState"
import { getExtensionVersion } from "~/utils/browser/browserApi"
import { isDevelopmentMode } from "~/utils/core/environment"
import { getErrorMessage } from "~/utils/core/error"
import { createLogger } from "~/utils/core/logger"
import { openPermissionsOnboardingPage } from "~/utils/navigation"

const logger = createLogger("DevDialogDebugMenu")

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
 * Renders the development dialog debug dropdown once development mode is confirmed.
 */
function DevDialogDebugMenuContent() {
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

  return (
    <DropdownMenu>
      <Tooltip content="Dev: Dialog debug menu">
        <DropdownMenuTrigger asChild>
          <IconButton
            variant="outline"
            size="sm"
            aria-label="Dev: Dialog debug menu"
            className="touch-manipulation"
          >
            <BugAntIcon className="h-4 w-4" />
          </IconButton>
        </DropdownMenuTrigger>
      </Tooltip>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuItem onClick={() => void handleTriggerUpdateLog()}>
          <DocumentTextIcon className="h-4 w-4" />
          Dev: Trigger update log
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => void handleTriggerOnboarding()}>
          <SparklesIcon className="h-4 w-4" />
          Dev: Trigger onboarding
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={() => void handleQueuePopupInterruptionHint()}
        >
          <ExclamationTriangleIcon className="h-4 w-4" />
          Dev: Queue popup interruption hint
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={() => setShouldTriggerTranslationCrash(true)}
        >
          <LanguageIcon className="h-4 w-4" />
          Dev: Trigger translation crash
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

/**
 * Development-only menu for manually reopening first-run/update dialogs.
 */
export function DevDialogDebugMenu() {
  if (!isDevelopmentMode()) {
    return null
  }

  return <DevDialogDebugMenuContent />
}
