import { useEffect, useRef } from "react"

import { useUpdateLogDialogContext } from "~/components/UpdateLogDialog"
import {
  DEFAULT_PREFERENCES,
  userPreferences,
} from "~/services/preferences/userPreferences"
import { changelogOnUpdateState } from "~/services/updates/changelogOnUpdateState"
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
        const pendingVersion =
          await changelogOnUpdateState.consumePendingVersion()

        if (!pendingVersion) {
          return
        }

        const prefs = await userPreferences.getPreferences()
        if (
          !(
            prefs.openChangelogOnUpdate ??
            DEFAULT_PREFERENCES.openChangelogOnUpdate
          )
        ) {
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
