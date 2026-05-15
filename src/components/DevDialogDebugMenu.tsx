import {
  BugAntIcon,
  DocumentTextIcon,
  SparklesIcon,
} from "@heroicons/react/24/outline"
import { useCallback } from "react"
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
import { changelogOnUpdateState } from "~/services/updates/changelogOnUpdateState"
import { getManifest } from "~/utils/browser/browserApi"
import { getErrorMessage } from "~/utils/core/error"
import { createLogger } from "~/utils/core/logger"
import { openPermissionsOnboardingPage } from "~/utils/navigation"

const logger = createLogger("DevDialogDebugMenu")

/**
 * Renders the development dialog debug dropdown once development mode is confirmed.
 */
function DevDialogDebugMenuContent() {
  const { openDialog } = useUpdateLogDialogContext()

  const handleTriggerUpdateLog = useCallback(async () => {
    try {
      const { version } = getManifest()
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
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

/**
 * Development-only menu for manually reopening first-run/update dialogs.
 */
export function DevDialogDebugMenu() {
  if (import.meta.env.MODE !== "development") {
    return null
  }

  return <DevDialogDebugMenuContent />
}
