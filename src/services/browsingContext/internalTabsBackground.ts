import {
  getSessionStorageValues,
  removeSessionStorageValues,
  setSessionStorageValues,
} from "~/utils/browser/browserApi"
import { createLogger } from "~/utils/core/logger"

const KEY_PREFIX = "internalBrowsingTab:"
const internalTabIds = new Set<number>()
const logger = createLogger("InternalBrowsingTabs")

/** Register before navigation; only persisted ownership survives worker restarts. */
export async function registerInternalTab(tabId: number): Promise<boolean> {
  internalTabIds.add(tabId)
  return setSessionStorageValues({ [`${KEY_PREFIX}${tabId}`]: true })
}

/** Remove ownership only after the browser reports that the tab was removed. */
export async function unregisterInternalTab(tabId: number): Promise<void> {
  internalTabIds.delete(tabId)
  try {
    await removeSessionStorageValues(`${KEY_PREFIX}${tabId}`)
  } catch (error) {
    logger.warn("Unable to clear internal tab ownership", error)
  }
}

/** Reads only candidate markers; never caches negative ownership across navigations. */
export async function getInternalTabIds(tabIds: number[]): Promise<number[]> {
  const candidates = [...new Set(tabIds)]
  const unknownIds = candidates.filter((id) => !internalTabIds.has(id))
  const values =
    unknownIds.length > 0
      ? await getSessionStorageValues(
          unknownIds.map((id) => `${KEY_PREFIX}${id}`),
        )
      : {}
  return candidates.filter(
    (id) => internalTabIds.has(id) || values[`${KEY_PREFIX}${id}`] === true,
  )
}
