import {
  reclaimOrphanedInternalTabs,
  type InternalTabReclamationSummary,
} from "~/services/browsingContext/internalTabReclamation"
import { isInternalTabOwned } from "~/services/browsingContext/internalTabsBackground"

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
