import { useEffect } from "react"

import { useUpdateLogDialogContext } from "~/features/UpdateLog"
import { DEFAULT_PREFERENCES } from "~/services/preferences/preferencesDefaults"
import { userPreferences } from "~/services/preferences/userPreferences"
import { resolveChangelogVersion } from "~/services/updates/changelogIndex"
import { changelogOnUpdateState } from "~/services/updates/changelogOnUpdateState"
import { isExtensionOptions } from "~/utils/browser"
import { getExtensionVersion } from "~/utils/browser/runtime"
import { getErrorMessage } from "~/utils/core/error"
import { createLogger } from "~/utils/core/logger"

const LOGGER = createLogger("ChangelogOnUpdateUiOpenHandler")

/** Preserve preference read failures instead of opening from fallback defaults. */
async function isChangelogEnabled() {
  const prefs = await userPreferences.getPreferencesStrict()
  return (
    prefs.openChangelogOnUpdate ?? DEFAULT_PREFERENCES.openChangelogOnUpdate
  )
}

/**
 * Check pending updates only in options. Missing notes survive until a later
 * visit; consuming the marker under the storage lock prevents duplicate dialogs.
 */
export function ChangelogOnUpdateUiOpenHandler() {
  const { openDialog } = useUpdateLogDialogContext()

  useEffect(() => {
    if (!isExtensionOptions()) {
      return
    }
    let cancelled = false

    void (async () => {
      try {
        const pendingVersion = await changelogOnUpdateState.getPendingVersion()

        if (!pendingVersion || cancelled) {
          return
        }

        const enabled = await isChangelogEnabled()
        if (cancelled) return
        if (!enabled) {
          await changelogOnUpdateState.consumePendingVersion(pendingVersion)
          return
        }

        const installedVersion = getExtensionVersion(pendingVersion)
        const changelogVersion = await resolveChangelogVersion(installedVersion)
        if (!changelogVersion || cancelled) return
        const stillEnabled = await isChangelogEnabled()
        if (cancelled) return
        if (!stillEnabled) {
          await changelogOnUpdateState.consumePendingVersion(pendingVersion)
          return
        }
        if (
          await changelogOnUpdateState.consumePendingVersion(pendingVersion)
        ) {
          openDialog(installedVersion)
        }
      } catch (error) {
        LOGGER.error(
          "Failed to check pending changelog state",
          getErrorMessage(error),
        )
      }
    })()
    return () => {
      cancelled = true
    }
  }, [openDialog])

  return null
}
