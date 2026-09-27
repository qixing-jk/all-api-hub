import { INTERNAL_TAB_BROWSER_SESSION_STORAGE_KEY } from "~/services/core/storageKeys"
import {
  getLocalStorage,
  removeLocalStorage,
  setLocalStorage,
} from "~/utils/browser/browserApi"
import { safeRandomUUID } from "~/utils/core/identifier"
import { createLogger } from "~/utils/core/logger"
import { isRecord } from "~/utils/core/object"

const KEY_PREFIX = "internalBrowsingTab:"
const internalTabIds = new Set<number>()
const logger = createLogger("InternalBrowsingTabs")

/**
 * Browser session of this worker, minted on first use and rotated when the
 * browser starts.
 *
 * Markers carry it because they live in `storage.local` — that store survives
 * the extension reloads and updates that clear `storage.session`, which is what
 * makes a leftover reclaimable after them — while tab ids only mean something
 * inside one browser session.
 */
let browserSession: string | undefined
let browserSessionRead: Promise<string> | undefined
let browserSessionRotation: Promise<string> | undefined

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

/** Persisted ownership facts one caller states about an extension-owned tab. */
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
  /** `null` for markers written before browser sessions were recorded. */
  browserSession: string | null
}

/**
 * Reads one persisted marker. The key itself already proves extension
 * ownership, so an unusable value only narrows the facts we know: an unknown
 * scope stays shared, which never closes a window the extension does not own.
 */
function parseMarker(value: unknown): {
  windowScope: InternalTabWindowScope
  createdAt: number | null
  browserSession: string | null
} | null {
  if (value === true) {
    return {
      windowScope: INTERNAL_TAB_WINDOW_SCOPES.Shared,
      createdAt: null,
      browserSession: null,
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
    browserSession:
      typeof value.browserSession === "string" && value.browserSession.trim()
        ? value.browserSession
        : null,
  }
}

/** Reads the numeric tab id encoded in an ownership key, if it is one. */
function parseMarkerTabId(key: string): number | null {
  if (!key.startsWith(KEY_PREFIX)) return null

  const tabId = Number(key.slice(KEY_PREFIX.length))
  return Number.isSafeInteger(tabId) && tabId >= 0 ? tabId : null
}

/** Mints a session id and persists it, keeping it in memory either way. */
async function writeNewBrowserSession(): Promise<string> {
  const minted = safeRandomUUID("internal-browsing-session")
  try {
    await setLocalStorage({
      [INTERNAL_TAB_BROWSER_SESSION_STORAGE_KEY]: minted,
    })
  } catch (error) {
    logger.warn("Unable to persist the temp-page browser session", error)
  }
  return minted
}

/**
 * Browser session this worker stamps markers with, minting one when the profile
 * has none yet. A failed write still returns the value, so ownership stays
 * consistent inside this worker.
 */
export async function readInternalTabBrowserSession(): Promise<string> {
  if (browserSessionRotation) return await browserSessionRotation
  if (browserSession) return browserSession
  browserSessionRead ??= (async () => {
    let stored: string | null = null
    try {
      const values = await getLocalStorage(
        INTERNAL_TAB_BROWSER_SESSION_STORAGE_KEY,
      )
      const candidate = values[INTERNAL_TAB_BROWSER_SESSION_STORAGE_KEY]
      stored =
        typeof candidate === "string" && candidate.trim() ? candidate : null
    } catch (error) {
      logger.warn("Unable to read the temp-page browser session", error)
    }

    browserSession = stored ?? (await writeNewBrowserSession())
    return browserSession
  })().finally(() => {
    browserSessionRead = undefined
  })

  return await browserSessionRead
}

/**
 * Starts a new browser session, which makes every marker written before it
 * foreign. Called on browser startup, not on an extension reload or update.
 */
export async function rotateInternalTabBrowserSession(): Promise<string> {
  if (browserSessionRotation) return await browserSessionRotation

  const rotation = (async () => {
    // A read started before onStartup must not replace the new token after
    // rotation writes it.
    if (browserSessionRead) await browserSessionRead
    browserSession = await writeNewBrowserSession()
    return browserSession
  })()
  browserSessionRotation = rotation
  try {
    return await rotation
  } finally {
    browserSessionRotation = undefined
  }
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
  const marker = {
    ...record,
    browserSession: await readInternalTabBrowserSession(),
  }

  try {
    await setLocalStorage({ [`${KEY_PREFIX}${tabId}`]: marker })
    return true
  } catch {
    return false
  }
}

/** Register before navigation; only persisted ownership survives worker restarts. */
export async function registerInternalTab(
  tabId: number,
  record: InternalTabRecord,
): Promise<boolean> {
  internalTabIds.add(tabId)
  return await persistInternalTabMarker(tabId, record)
}

/** Remove ownership only after the browser reports that the tab was removed. */
export async function unregisterInternalTab(tabId: number): Promise<void> {
  internalTabIds.delete(tabId)
  try {
    await removeLocalStorage(`${KEY_PREFIX}${tabId}`)
  } catch (error) {
    logger.warn("Unable to clear internal tab ownership", error)
  }
}

/**
 * Whether this worker is still holding the tab.
 *
 * Ownership is claimed before the marker is written, so anything a sweep can
 * see in storage already has a live owner if it has one at all. That is what
 * keeps a temp context that is still being created out of a sweep.
 */
export function isInternalTabOwned(tabId: number): boolean {
  return internalTabIds.has(tabId)
}

/** Reads only candidate markers; never caches negative ownership across navigations. */
export async function getInternalTabIds(tabIds: number[]): Promise<number[]> {
  const candidates = [...new Set(tabIds)]
  const unknownIds = candidates.filter((id) => !internalTabIds.has(id))
  const values =
    unknownIds.length > 0
      ? await getLocalStorage(unknownIds.map((id) => `${KEY_PREFIX}${id}`))
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
 * The scan reads the stored area in full because tab ids cannot be guessed, and
 * it exposes only keys shaped like ownership markers: values stored under any
 * other key are discarded unread. A failed read rejects instead of reporting
 * "no owned tabs", because reclamation must not treat unknown state as clean
 * state.
 */
export async function listInternalTabRecords(): Promise<
  InternalTabOwnership[]
> {
  const values = await getLocalStorage(null)

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
