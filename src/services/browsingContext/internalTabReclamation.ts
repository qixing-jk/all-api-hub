import { createAlarm, getAlarm } from "~/utils/browser/alarms"
import { removeTabOwningWindow } from "~/utils/browser/ownedTabRemoval"
import { getAllTabs, removeTab } from "~/utils/browser/tabs"
import { getAllWindows, hasWindowsAPI } from "~/utils/browser/windows"
import { getErrorMessage } from "~/utils/core/error"
import { createLogger } from "~/utils/core/logger"

import {
  INTERNAL_TAB_WINDOW_SCOPES,
  listInternalTabRecords,
  readInternalTabBrowserSession,
  unregisterInternalTab,
  type InternalTabWindowScope,
} from "./internalTabsBackground"

const logger = createLogger("InternalTabReclamation")

/** One-shot alarm that retries a reclamation whose close was rejected. */
export const TEMP_PAGE_RECLAIM_RETRY_ALARM = "tempPageReclaimRetry"

/**
 * One minute: comfortably above Chrome's 30-second floor for alarms, and late
 * enough that a retry never races the close it is retrying.
 */
const TEMP_PAGE_RECLAIM_RETRY_DELAY_MINUTES = 1

/**
 * How long a still-held temp page keeps the retry armed.
 *
 * A live request means the risky window (its delayed close) has not passed yet,
 * so the alarm stays pending; a context older than this is treated as something
 * that will not finish on its own, and the heartbeat stops rather than waking
 * the worker every minute forever.
 */
const TEMP_PAGE_RECLAIM_RETRY_TRACKED_MAX_AGE_MS = 10 * 60 * 1000

/**
 * Arms the retry alarm unless it is already armed.
 *
 * Nothing else persists the retry: an alarm that never fires (the browser closed
 * first) costs nothing, because the markers it would have acted on are still
 * there for the next start to sweep.
 */
export async function scheduleTempPageReclaimRetry(): Promise<boolean> {
  try {
    if (await getAlarm(TEMP_PAGE_RECLAIM_RETRY_ALARM)) return false

    await createAlarm(TEMP_PAGE_RECLAIM_RETRY_ALARM, {
      delayInMinutes: TEMP_PAGE_RECLAIM_RETRY_DELAY_MINUTES,
    })
    logger.info("Armed a temp-page reclamation retry", {
      delayInMinutes: TEMP_PAGE_RECLAIM_RETRY_DELAY_MINUTES,
    })
    return true
  } catch (error) {
    logger.warn("Unable to arm a temp-page reclamation retry", {
      error: getErrorMessage(error),
    })
    return false
  }
}

/** What reclamation did with one persisted ownership marker. */
export const INTERNAL_TAB_RECLAMATION_OUTCOMES = {
  ClosedWindow: "closed-window",
  ClosedTab: "closed-tab",
  SkippedTracked: "skipped-tracked",
  SkippedVisible: "skipped-visible",
  SkippedMissing: "skipped-missing",
  SkippedStaleSession: "skipped-stale-session",
  Failed: "failed",
} as const

export type InternalTabReclamationOutcomeKind =
  (typeof INTERNAL_TAB_RECLAMATION_OUTCOMES)[keyof typeof INTERNAL_TAB_RECLAMATION_OUTCOMES]

export type InternalTabReclamationOutcome = {
  kind: InternalTabReclamationOutcomeKind
  tabId: number
  reason?: string
}

export type InternalTabReclamationSummary = {
  outcomes: InternalTabReclamationOutcome[]
  reclaimedCount: number
}

/**
 * Reads the windows the user is currently looking at. `null` means focus could
 * not be observed on this browser, which must not be read as "no window is
 * focused".
 */
async function readFocusedWindowIds(): Promise<Set<number> | null> {
  if (!hasWindowsAPI()) return null

  const windows = await getAllWindows()
  const focusedIds = windows
    .filter(
      (window) => window.focused === true && typeof window.id === "number",
    )
    .map((window) => window.id as number)

  return new Set(focusedIds)
}

/** Whether the tab is the one the user is looking at right now. */
function isTabOnScreen(
  tab: browser.tabs.Tab,
  focusedWindowIds: Set<number> | null,
): boolean {
  if (tab.active !== true) return false
  if (focusedWindowIds === null) return true

  return typeof tab.windowId === "number" && focusedWindowIds.has(tab.windowId)
}

/** Whether a marker was written recently enough to belong to a live request. */
function isRecentMarker(createdAt: number | null, now: number): boolean {
  if (createdAt === null) return false

  return now - createdAt <= TEMP_PAGE_RECLAIM_RETRY_TRACKED_MAX_AGE_MS
}

/** Closes one orphan, restoring the close semantics of its ownership record. */
async function closeOrphan(
  tab: browser.tabs.Tab,
  windowScope: InternalTabWindowScope,
  tabId: number,
): Promise<InternalTabReclamationOutcomeKind> {
  if (windowScope !== INTERNAL_TAB_WINDOW_SCOPES.Owned) {
    await removeTab(tabId)
    return INTERNAL_TAB_RECLAMATION_OUTCOMES.ClosedTab
  }

  const removed = await removeTabOwningWindow(tabId, tab.windowId)
  return removed === "window"
    ? INTERNAL_TAB_RECLAMATION_OUTCOMES.ClosedWindow
    : INTERNAL_TAB_RECLAMATION_OUTCOMES.ClosedTab
}

/**
 * Closes extension-owned temp tabs/windows that no live temp context holds any
 * more, using persisted ownership rather than the page the tab happens to show.
 *
 * This is the recovery path for closes that a dying service worker never
 * performed and for browser removals that were rejected: such leftovers are
 * often still sitting on the initial `about:blank`, so nothing about their URL
 * identifies them. Ownership is the only reliable identifier.
 *
 * A tab is left alone when the live worker still owns it, or when it is the
 * active tab of a focused window: a temp window deliberately handed to the user
 * must not disappear under their hands. Markers survive a failed close so the
 * next sweep retries.
 *
 * A marker written by another browser session is only cleared: tab ids do not
 * carry over between sessions, so closing what it names could close an
 * unrelated tab.
 */
export async function reclaimOrphanedInternalTabs(options: {
  /** Consulted per tab, so a context created mid-sweep is never reclaimed. */
  isTabTracked: (tabId: number) => boolean
}): Promise<InternalTabReclamationSummary> {
  const records = await listInternalTabRecords()
  if (records.length === 0) {
    return { outcomes: [], reclaimedCount: 0 }
  }

  const tabsById = new Map<number, browser.tabs.Tab>()
  for (const tab of await getAllTabs()) {
    if (typeof tab.id === "number") tabsById.set(tab.id, tab)
  }

  const browserSession = await readInternalTabBrowserSession()
  const focusedWindowIds = await readFocusedWindowIds()
  const now = Date.now()
  const outcomes: InternalTabReclamationOutcome[] = []
  let holdsLiveTempPage = false

  for (const record of records) {
    const { tabId } = record

    if (record.browserSession !== browserSession) {
      await unregisterInternalTab(tabId)
      outcomes.push({
        kind: INTERNAL_TAB_RECLAMATION_OUTCOMES.SkippedStaleSession,
        tabId,
      })
      continue
    }

    const tab = tabsById.get(tabId)

    if (!tab) {
      await unregisterInternalTab(tabId)
      outcomes.push({
        kind: INTERNAL_TAB_RECLAMATION_OUTCOMES.SkippedMissing,
        tabId,
      })
      continue
    }

    if (options.isTabTracked(tabId)) {
      // Its delayed close has not happened yet, which is exactly the window a
      // dying worker never completes.
      holdsLiveTempPage ||= isRecentMarker(record.createdAt, now)
      outcomes.push({
        kind: INTERNAL_TAB_RECLAMATION_OUTCOMES.SkippedTracked,
        tabId,
      })
      continue
    }

    if (isTabOnScreen(tab, focusedWindowIds)) {
      outcomes.push({
        kind: INTERNAL_TAB_RECLAMATION_OUTCOMES.SkippedVisible,
        tabId,
      })
      continue
    }

    // Re-read before acting: if the session rotated while this sweep was
    // deciding, the ids read at the start belong to a session that has ended.
    if ((await readInternalTabBrowserSession()) !== browserSession) {
      await unregisterInternalTab(tabId)
      outcomes.push({
        kind: INTERNAL_TAB_RECLAMATION_OUTCOMES.SkippedStaleSession,
        tabId,
      })
      continue
    }

    try {
      const kind = await closeOrphan(tab, record.windowScope, tabId)
      await unregisterInternalTab(tabId)
      outcomes.push({ kind, tabId })
    } catch (error) {
      outcomes.push({
        kind: INTERNAL_TAB_RECLAMATION_OUTCOMES.Failed,
        tabId,
        reason: getErrorMessage(error),
      })
    }
  }

  const reclaimedCount = outcomes.filter(
    (outcome) =>
      outcome.kind === INTERNAL_TAB_RECLAMATION_OUTCOMES.ClosedTab ||
      outcome.kind === INTERNAL_TAB_RECLAMATION_OUTCOMES.ClosedWindow,
  ).length
  const failureCount = outcomes.filter(
    (outcome) => outcome.kind === INTERNAL_TAB_RECLAMATION_OUTCOMES.Failed,
  ).length

  logReclamation(outcomes, reclaimedCount, failureCount)

  // Come back on the next minute for a close the browser refused, and keep
  // coming back while a live request still holds a temp page: its close has not
  // run yet, and nothing else would retry it if this worker died first.
  if (failureCount > 0 || holdsLiveTempPage) {
    await scheduleTempPageReclaimRetry()
  }

  return { outcomes, reclaimedCount }
}

/** Reports what the sweep found without logging any site or page detail. */
function logReclamation(
  outcomes: InternalTabReclamationOutcome[],
  reclaimedCount: number,
  failureCount: number,
) {
  if (reclaimedCount > 0) {
    logger.info("Reclaimed orphaned temporary pages", {
      reclaimedCount,
      failedCount: failureCount,
      outcomes: outcomes.map((outcome) => ({
        tabId: outcome.tabId,
        kind: outcome.kind,
      })),
    })
    return
  }

  if (failureCount > 0) {
    logger.warn("Orphaned temporary pages could not be reclaimed", {
      outcomes: outcomes.map((outcome) => ({
        tabId: outcome.tabId,
        kind: outcome.kind,
        reason: outcome.reason ?? null,
      })),
    })
  }
}
