import {
  getSessionStorageValues,
  removeSessionStorageValues,
  setSessionStorageValues,
} from "~/utils/browser/browserApi"
import { createLogger } from "~/utils/core/logger"
import { isRecord } from "~/utils/core/object"

const KEY_PREFIX = "internalBrowsingTab:"
const internalTabIds = new Set<number>()
const logger = createLogger("InternalBrowsingTabs")

/**
 * How the flagged tab relates to its window, so a later worker can close it the
 * way its owner would have.
 */
export const INTERNAL_TAB_WINDOW_SCOPES = {
  /** The tab is the only tab of a window the extension created for it. */
  Owned: "owned",
  /** The tab sits in a window owned by something else (a shared composite window or the user's window). */
  Shared: "shared",
} as const

export type InternalTabWindowScope =
  (typeof INTERNAL_TAB_WINDOW_SCOPES)[keyof typeof INTERNAL_TAB_WINDOW_SCOPES]

/** Persisted ownership facts for one extension-owned browsing tab. */
export type InternalTabRecord = {
  windowScope: InternalTabWindowScope
  createdAt: number
}

/** A stored ownership marker together with the tab it belongs to. */
export type InternalTabOwnership = {
  tabId: number
  windowScope: InternalTabWindowScope
  /** `null` for markers written before ownership records existed. */
  createdAt: number | null
}

/**
 * Reads one persisted marker. The key itself already proves extension
 * ownership, so an unusable value only narrows the facts we know: an unknown
 * scope stays shared, which never closes a window the extension does not own.
 */
function parseMarker(
  value: unknown,
): { windowScope: InternalTabWindowScope; createdAt: number | null } | null {
  if (value === true) {
    return {
      windowScope: INTERNAL_TAB_WINDOW_SCOPES.Shared,
      createdAt: null,
    }
  }

  if (!isRecord(value)) return null

  return {
    windowScope:
      value.windowScope === INTERNAL_TAB_WINDOW_SCOPES.Owned
        ? INTERNAL_TAB_WINDOW_SCOPES.Owned
        : INTERNAL_TAB_WINDOW_SCOPES.Shared,
    createdAt:
      typeof value.createdAt === "number" &&
      Number.isFinite(value.createdAt) &&
      value.createdAt > 0
        ? value.createdAt
        : null,
  }
}

/** Reads the numeric tab id encoded in an ownership key, if it is one. */
function parseMarkerTabId(key: string): number | null {
  if (!key.startsWith(KEY_PREFIX)) return null

  const tabId = Number(key.slice(KEY_PREFIX.length))
  return Number.isSafeInteger(tabId) && tabId >= 0 ? tabId : null
}

/**
 * Persists an ownership marker without claiming the tab for this worker.
 *
 * This is the state a dead worker leaves behind, which the dev fixtures use to
 * reproduce a leftover. Live ownership needs {@link registerInternalTab}.
 */
export async function persistInternalTabMarker(
  tabId: number,
  record: InternalTabRecord,
): Promise<boolean> {
  return setSessionStorageValues({ [`${KEY_PREFIX}${tabId}`]: record })
}

/** Register before navigation; only persisted ownership survives worker restarts. */
export async function registerInternalTab(
  tabId: number,
  record: InternalTabRecord,
): Promise<boolean> {
  internalTabIds.add(tabId)
  return await persistInternalTabMarker(tabId, record)
}

/**
 * Whether this worker is still holding the tab.
 *
 * Ownership claimed here is claimed before the marker is written, so anything a
 * sweep can see in storage already has a live owner if it has one at all. That
 * is what keeps a temp context that is still being created out of a sweep.
 */
export function isInternalTabOwned(tabId: number): boolean {
  return internalTabIds.has(tabId)
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
    (id) =>
      internalTabIds.has(id) ||
      parseMarker(values[`${KEY_PREFIX}${id}`]) !== null,
  )
}

/**
 * Enumerates every persisted ownership marker so a worker that inherited no
 * pool can find the tabs it is still responsible for.
 *
 * The scan reads the session area in full because tab ids cannot be guessed,
 * and it exposes only keys shaped like ownership markers: values stored under
 * any other key are discarded unread. A failed read rejects instead of
 * reporting "no owned tabs", because reclamation must not treat unknown state
 * as clean state.
 */
export async function listInternalTabRecords(): Promise<
  InternalTabOwnership[]
> {
  const values = await getSessionStorageValues(null)

  const records: InternalTabOwnership[] = []
  for (const [key, value] of Object.entries(values)) {
    const tabId = parseMarkerTabId(key)
    if (tabId === null) continue

    const marker = parseMarker(value)
    if (!marker) continue

    records.push({ tabId, ...marker })
  }

  return records.sort((a, b) => a.tabId - b.tabId)
}
