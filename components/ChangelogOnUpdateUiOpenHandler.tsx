import { useEffect, useRef } from "react"

import { changelogOnUpdateState } from "~/services/changelogOnUpdateState"
import { userPreferences } from "~/services/userPreferences"
import { createTab } from "~/utils/browserApi"
import { getDocsChangelogUrl } from "~/utils/docsLinks"
import { getErrorMessage } from "~/utils/error"
import { createLogger } from "~/utils/logger"

const LOGGER = createLogger("ChangelogOnUpdateUiOpenHandler")

/**
 * UI-open handler that consumes the pending changelog marker (written on update)
 * and opens the version-anchored docs changelog page at most once.
 */
export function ChangelogOnUpdateUiOpenHandler() {
  const hasHandledRef = useRef(false)

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

        const url = getDocsChangelogUrl(pendingVersion)
        await createTab(url, true)
      } catch (error) {
        LOGGER.error(
          "Failed to consume pending changelog state",
          getErrorMessage(error),
        )
      }
    })()
  }, [])

  return null
}

export default ChangelogOnUpdateUiOpenHandler
