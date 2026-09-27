import {
  getAllTabs,
  getAllWindows,
  hasWindowsAPI,
  removeTab,
} from "~/utils/browser/browserApi"
import { removeTabOwningWindow } from "~/utils/browser/ownedTabRemoval"
import { getErrorMessage } from "~/utils/core/error"
import { createLogger } from "~/utils/core/logger"

import {
  INTERNAL_TAB_WINDOW_SCOPES,
  listInternalTabRecords,
  unregisterInternalTab,
  type InternalTabWindowScope,
} from "./internalTabsBackground"

const logger = createLogger("InternalTabReclamation")

/** What reclamation did with one persisted ownership marker. */
export const INTERNAL_TAB_RECLAMATION_OUTCOMES = {
  ClosedWindow: "closed-window",
  ClosedTab: "closed-tab",
  SkippedTracked: "skipped-tracked",
  SkippedVisible: "skipped-visible",
  SkippedMissing: "skipped-missing",
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
 * A tab is left alone when the live pool still tracks it, or when it is the
 * active tab of a focused window: a temp window deliberately handed to the user
 * must not disappear under their hands. Markers survive a failed close so the
 * next sweep retries.
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

  const focusedWindowIds = await readFocusedWindowIds()
  const outcomes: InternalTabReclamationOutcome[] = []

  for (const record of records) {
    const { tabId } = record
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

  logReclamation(outcomes, reclaimedCount)

  return { outcomes, reclaimedCount }
}

/** Reports what the sweep found without logging any site or page detail. */
function logReclamation(
  outcomes: InternalTabReclamationOutcome[],
  reclaimedCount: number,
) {
  const failureCount = outcomes.filter(
    (outcome) => outcome.kind === INTERNAL_TAB_RECLAMATION_OUTCOMES.Failed,
  ).length

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
