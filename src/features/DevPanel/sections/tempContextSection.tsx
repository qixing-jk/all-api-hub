import { Trash2 } from "lucide-react"
import { useCallback, useEffect, useMemo, useState } from "react"

import { RuntimeActionIds } from "~/constants/runtimeActions"
import toast from "~/lib/notify"
import { reloadRuntime, sendRuntimeMessage } from "~/utils/browser/browserApi"
import { getErrorMessage } from "~/utils/core/error"
import { createLogger } from "~/utils/core/logger"

import type { DevPanelInfoRow, DevPanelSection } from "../types"

const logger = createLogger("DevTempContextSection")

/** Action ids shared by the action wiring and the per-action spinner. */
const ACTION_IDS = {
  leakOwnedWindow: "leak-owned-window",
  leakSharedTab: "leak-shared-tab",
  leakVisibleTab: "leak-visible-tab",
  openTrackedContext: "open-tracked-context",
  reclaimNow: "reclaim-now",
  restartWorker: "restart-worker",
  refresh: "refresh",
} as const

type TempContextActionId = (typeof ACTION_IDS)[keyof typeof ACTION_IDS]

type TempContextReclamationOutcomeRow = { tabId: number; kind: string }

type TempContextMarkerRow = {
  tabId: number
  windowScope: string
  createdAt: number | null
  tracked: boolean
}

/** Union of what the debug actions answer, keyed by the action asked. */
type TempContextReclamationRun = {
  at: number
  summary: {
    reclaimedCount: number
    outcomes: TempContextReclamationOutcomeRow[]
  }
}

type TempContextDebugData = {
  markers?: TempContextMarkerRow[]
  /** Recent runs of the worker answering the read, newest first. */
  runs?: TempContextReclamationRun[]
  tabId?: number
  windowId?: number
  windowScope?: string
  requestId?: string
  summary?: {
    reclaimedCount: number
    outcomes: TempContextReclamationOutcomeRow[]
  }
}

type TempContextDebugResponse = {
  success: boolean
  error?: string
  data?: TempContextDebugData
}

/** Last read of the background state, with the instant the ages are relative to. */
type TempContextSnapshot = {
  markers: TempContextMarkerRow[]
  runs: TempContextReclamationRun[]
  readAt: number
}

const EMPTY_SNAPSHOT: TempContextSnapshot = {
  markers: [],
  runs: [],
  readAt: 0,
}

/** Age of a marker, in the unit that keeps the row short. */
function formatAge(createdAt: number | null, now: number): string {
  if (createdAt === null) return "age unknown"

  const seconds = Math.max(0, Math.round((now - createdAt) / 1000))
  return seconds < 60 ? `${seconds}s old` : `${Math.round(seconds / 60)}m old`
}

/** One line per marker, capped so a pile of leftovers cannot flood the panel. */
function formatMarkerHint(
  markers: readonly TempContextMarkerRow[],
  now: number,
): string {
  if (markers.length === 0) return "No temp page is currently marked"

  const shown = markers
    .slice(0, 5)
    .map(
      (marker) =>
        `tab ${marker.tabId} · ${marker.windowScope} · ${
          marker.tracked ? "tracked" : "orphan"
        } · ${formatAge(marker.createdAt, now)}`,
    )
  const hiddenCount = markers.length - shown.length

  return [...shown, ...(hiddenCount > 0 ? [`+${hiddenCount} more`] : [])].join(
    "\n",
  )
}

/** Reclamation outcomes as panel lines, with their per-tab decision. */
function formatOutcomeHint(
  outcomes: readonly TempContextReclamationOutcomeRow[],
): string {
  if (outcomes.length === 0) return "nothing marked"

  return outcomes
    .map((outcome) => `tab ${outcome.tabId} · ${outcome.kind}`)
    .join("\n")
}

/**
 * Reproduces temp pages left behind by a dead worker, and runs the same
 * reclamation the background start does, so the mechanism can be checked in a
 * real browser instead of only through unit tests.
 */
export function useTempContextDevSection(): DevPanelSection {
  // The panel re-registers a section whenever its identity changes, so every
  // value it renders from is fixed at read time: a clock read during render
  // would make the section new on every render and re-register forever.
  const [snapshot, setSnapshot] = useState<TempContextSnapshot>(EMPTY_SNAPSHOT)
  const [readsState, setReadsState] = useState(false)
  const [pendingActionId, setPendingActionId] =
    useState<TempContextActionId | null>(null)

  const readState = useCallback(async () => {
    const response = await sendRuntimeMessage<TempContextDebugResponse>({
      action: RuntimeActionIds.TempContextDebugListMarkers,
    })
    if (!response?.success) {
      throw new Error(response?.error ?? "Temp page state unavailable")
    }
    setSnapshot({
      markers: response.data?.markers ?? [],
      runs: response.data?.runs ?? [],
      readAt: Date.now(),
    })
  }, [])

  useEffect(() => {
    void readState().catch((error) => {
      logger.debug("Failed to read temp page state", error)
    })
  }, [readState])

  const runAction = useCallback(
    async (
      actionId: TempContextActionId,
      request: Record<string, unknown>,
      describe: (response: TempContextDebugResponse) => string,
    ) => {
      setPendingActionId(actionId)
      const toastId = toast.loading("Running temp page debug action…")
      try {
        const response =
          await sendRuntimeMessage<TempContextDebugResponse>(request)
        if (!response?.success) {
          toast.error(response?.error ?? "Temp page debug action failed", {
            id: toastId,
          })
          return
        }

        toast.success(describe(response), { id: toastId })
        await readState()
      } catch (error) {
        logger.error("Temp page debug action failed", error)
        toast.error(getErrorMessage(error), { id: toastId })
      } finally {
        setPendingActionId(null)
      }
    },
    [readState],
  )

  const leakOrphan = useCallback(
    (scenario: string) =>
      runAction(
        scenario === "owned-window"
          ? ACTION_IDS.leakOwnedWindow
          : scenario === "visible-tab"
            ? ACTION_IDS.leakVisibleTab
            : ACTION_IDS.leakSharedTab,
        {
          action: RuntimeActionIds.TempContextDebugCreateOrphan,
          scenario,
        },
        (response) =>
          `Leaked tab ${response.data?.tabId ?? "?"} (${scenario}). Reclamation closes orphans; a visible tab stays.`,
      ),
    [runAction],
  )

  const openTrackedContext = useCallback(
    () =>
      runAction(
        ACTION_IDS.openTrackedContext,
        { action: RuntimeActionIds.TempContextDebugCreateTrackedContext },
        (response) =>
          `Opened a tracked temp context on tab ${
            response.data?.tabId ?? "?"
          }. Reclamation skips it until this worker is gone.`,
      ),
    [runAction],
  )

  const reclaimNow = useCallback(
    () =>
      runAction(
        ACTION_IDS.reclaimNow,
        { action: RuntimeActionIds.TempContextDebugReclaimNow },
        (response) =>
          `Reclaimed ${
            response.data?.summary?.reclaimedCount ?? 0
          } temp page(s).`,
      ),
    [runAction],
  )

  const refresh = useCallback(() => {
    setReadsState(true)
    void readState()
      .catch((error) => {
        logger.debug("Failed to refresh temp page state", error)
        toast.error(getErrorMessage(error))
      })
      .finally(() => setReadsState(false))
  }, [readState])

  const restartWorker = useCallback(() => {
    toast.info(
      "Restarting the background worker. Reopen this page to see whether the next start reclaimed the leak.",
    )
    reloadRuntime()
  }, [])

  const rows = useMemo<DevPanelInfoRow[]>(() => {
    const { markers, runs, readAt } = snapshot
    const lastRun = runs[0] ?? null

    return [
      {
        id: "markers",
        label: "Marked temp pages",
        value: `${markers.length} (${
          markers.filter((marker) => !marker.tracked).length
        } orphan)`,
        hint: formatMarkerHint(markers, readAt),
        tone: "runtime",
      },
      {
        id: "last-run",
        label: "Recent reclamations (this worker)",
        value: lastRun
          ? `${lastRun.summary.reclaimedCount} reclaimed`
          : "not run yet",
        hint: lastRun
          ? runs
              .map(
                (run) =>
                  `${formatAge(run.at, readAt)}: ${formatOutcomeHint(run.summary.outcomes)}`,
              )
              .join("\n")
          : "A worker start reclaims leftovers before the panel is open",
        tone: "best-effort",
      },
    ]
  }, [snapshot])

  const isBusy = pendingActionId !== null

  return useMemo(
    () => ({
      id: "temp-context-debug",
      title: "Temporary pages",
      icon: Trash2,
      description:
        "Reproduce a temp window/tab left behind, restart the worker, then reclaim it.",
      rows,
      surfaces: ["options"],
      actions: [
        {
          id: ACTION_IDS.leakOwnedWindow,
          label: "Dev: Leak an owned popup window",
          disabled: isBusy,
          loading: pendingActionId === ACTION_IDS.leakOwnedWindow,
          run: () => leakOrphan("owned-window"),
        },
        {
          id: ACTION_IDS.leakSharedTab,
          label: "Dev: Leak a shared background tab",
          disabled: isBusy,
          loading: pendingActionId === ACTION_IDS.leakSharedTab,
          run: () => leakOrphan("shared-tab"),
        },
        {
          id: ACTION_IDS.leakVisibleTab,
          label: "Dev: Leak a visible tab",
          disabled: isBusy,
          loading: pendingActionId === ACTION_IDS.leakVisibleTab,
          run: () => leakOrphan("visible-tab"),
        },
        {
          id: ACTION_IDS.openTrackedContext,
          label: "Dev: Open a tracked temp context",
          disabled: isBusy,
          loading: pendingActionId === ACTION_IDS.openTrackedContext,
          run: openTrackedContext,
        },
        {
          id: ACTION_IDS.reclaimNow,
          label: "Dev: Run reclamation now",
          disabled: isBusy,
          loading: pendingActionId === ACTION_IDS.reclaimNow,
          run: reclaimNow,
        },
        {
          id: ACTION_IDS.refresh,
          label: "Dev: Refresh temp page state",
          disabled: isBusy,
          loading: readsState,
          run: refresh,
        },
        {
          id: ACTION_IDS.restartWorker,
          label: "Dev: Restart background worker",
          disabled: isBusy,
          run: restartWorker,
        },
      ],
    }),
    [
      isBusy,
      leakOrphan,
      openTrackedContext,
      pendingActionId,
      readsState,
      reclaimNow,
      refresh,
      restartWorker,
      rows,
    ],
  )
}
