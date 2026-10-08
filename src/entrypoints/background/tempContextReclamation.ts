import {
  reclaimOrphanedInternalTabs,
  TEMP_PAGE_RECLAIM_RETRY_ALARM,
  type InternalTabReclamationSummary,
} from "~/services/browsingContext/internalTabReclamation"
import {
  isInternalTabOwned,
  rotateInternalTabBrowserSession,
} from "~/services/browsingContext/internalTabsBackground"
import { getAlarm, onAlarm } from "~/utils/browser/alarms"

/** One reclamation run of this worker, kept for the dev reproduction panel. */
export type TempPageReclamationRun = {
  at: number
  summary: InternalTabReclamationSummary
}

/**
 * Recent runs, newest first. A worker start reclaims before anything else can
 * ask, so keeping only the last run would hide what the start actually did.
 */
const RECLAMATION_HISTORY_LIMIT = 5

const history: TempPageReclamationRun[] = []

/**
 * Closes temporary tabs/windows that no live temp context holds any more.
 *
 * Temp-window closes are timer-based and in-memory: a background worker that
 * dies before its timers fire leaves the window behind, and a rejected
 * `tabs.remove`/`windows.remove` is logged and forgotten. The ownership markers
 * written before navigation survive both, so they are what the sweep keys on.
 */
export async function reclaimOrphanedTempPages() {
  const summary = await reclaimOrphanedInternalTabs({
    // The same live ownership the browsing-context filter reads: a tab is kept
    // when the worker still holds it, whichever flow created it.
    isTabTracked: isInternalTabOwned,
  })
  history.unshift({ at: Date.now(), summary })
  history.length = Math.min(history.length, RECLAMATION_HISTORY_LIMIT)
  return summary
}

/** Recent reclamations of this worker, newest first. */
export function readTempPageReclamationHistory(): TempPageReclamationRun[] {
  return [...history]
}

/**
 * Starts a new browser session for temp-page ownership.
 *
 * Called when the browser starts, which is not the same as an extension reload
 * or update: those keep the markers, so their leftovers stay reclaimable.
 */
export function rotateTempPageBrowserSession() {
  return rotateInternalTabBrowserSession()
}

/** Whether a reclamation retry is waiting, for the dev reproduction panel. */
export async function readTempPageReclaimRetryArmed(): Promise<boolean> {
  return Boolean(await getAlarm(TEMP_PAGE_RECLAIM_RETRY_ALARM))
}

/**
 * Runs a pending reclamation retry.
 *
 * Registered at background startup, before the first await, so an alarm that
 * wakes the worker is handled in the same activation. The sweep decides again
 * from the markers, so a retry that finds nothing is a no-op.
 */
export function setupTempPageReclaimRetryListener(): void {
  onAlarm(async (alarm) => {
    if (alarm.name !== TEMP_PAGE_RECLAIM_RETRY_ALARM) return

    await reclaimOrphanedTempPages()
  })
}
