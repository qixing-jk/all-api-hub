import { useEffect, useRef } from "react"

import { useUpdateLogDialogContext } from "~/components/UpdateLogDialog"
import { changelogOnUpdateState } from "~/services/changelogOnUpdateState"
import { userPreferences } from "~/services/userPreferences"
import { getErrorMessage } from "~/utils/error"
import { createLogger } from "~/utils/logger"

const LOGGER = createLogger("ChangelogOnUpdateUiOpenHandler")

/**
 * UI-open handler that consumes the pending changelog marker (written on update)
 * and opens the inline update-log UI at most once.
 */
export function ChangelogOnUpdateUiOpenHandler() {
  const hasHandledRef = useRef(false)
  const { openDialog } = useUpdateLogDialogContext()

  useEffect(() => {
    if (hasHandledRef.current) {
      return
    }
    hasHandledRef.current = true

    void (async () => {
      try {
        const prefs = await userPreferences.getPreferences()
        const pendingVersion =
          await changelogOnUpdateState.consumePendingVersion()

        if (!pendingVersion) {
          return
        }

        if (!(prefs.openChangelogOnUpdate ?? true)) {
          return
        }

        openDialog(pendingVersion)
      } catch (error) {
        LOGGER.error(
          "Failed to consume pending changelog state",
          getErrorMessage(error),
        )
      }
    })()
  }, [openDialog])

  return null
}

export default ChangelogOnUpdateUiOpenHandler
