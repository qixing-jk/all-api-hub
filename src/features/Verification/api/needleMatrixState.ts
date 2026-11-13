import type { TFunction } from "i18next"

import {
  NEEDLE_OUTCOMES,
  NEEDLE_RUN_REASONS,
} from "~/services/verification/modelQuality/needleConstants"
import {
  isSameNeedleCoordinate,
  type NeedleCoordinate,
} from "~/services/verification/modelQuality/needlePlan"
import type { NeedleResult } from "~/services/verification/modelQuality/needleRun"

export const NEEDLE_CELL_STATES = {
  ...NEEDLE_OUTCOMES,
  Running: "running",
  Preparing: "preparing",
  Pending: "pending",
  Stopping: "stopping",
  Cancelled: "cancelled",
  Planned: "planned",
  NotRun: "not-run",
  NotScheduled: "not-scheduled",
} as const

export type NeedleCellState =
  (typeof NEEDLE_CELL_STATES)[keyof typeof NEEDLE_CELL_STATES]

/** One state projection for the matrix, scope controls and selected-cell details. */
export function getNeedleMatrixState(
  result: NeedleResult | null | undefined,
  running: boolean,
  plannedCells: NeedleCoordinate[],
) {
  const live =
    running &&
    (result?.reason === NEEDLE_RUN_REASONS.Running ||
      result?.inFlightCells?.length ||
      result?.preparingCells?.length)
      ? result
      : undefined
  const pending = running ? (live?.pending ?? plannedCells) : []
  const cancelled = !running || live ? (result?.cancelled ?? []) : []
  const getCell = (coordinate: NeedleCoordinate) => {
    const cell = result?.cells.find((item) =>
      isSameNeedleCoordinate(item, coordinate),
    )
    const stopped = cancelled.some((item) =>
      isSameNeedleCoordinate(item, coordinate),
    )
    const state: NeedleCellState = (
      live?.inFlightCells ?? [live?.inFlight]
    ).some((item) => isSameNeedleCoordinate(coordinate, item))
      ? stopped
        ? NEEDLE_CELL_STATES.Stopping
        : NEEDLE_CELL_STATES.Running
      : (live?.preparingCells ?? [live?.preparing]).some((item) =>
            isSameNeedleCoordinate(coordinate, item),
          )
        ? stopped
          ? NEEDLE_CELL_STATES.Stopping
          : NEEDLE_CELL_STATES.Preparing
        : stopped
          ? NEEDLE_CELL_STATES.Cancelled
          : pending.some((item) => isSameNeedleCoordinate(item, coordinate))
            ? NEEDLE_CELL_STATES.Pending
            : cell
              ? cell.outcome
              : plannedCells.some((item) =>
                    isSameNeedleCoordinate(item, coordinate),
                  )
                ? result
                  ? NEEDLE_CELL_STATES.NotRun
                  : NEEDLE_CELL_STATES.Planned
                : NEEDLE_CELL_STATES.NotScheduled
    return {
      cell,
      output: result?.outputs?.find((entry) =>
        isSameNeedleCoordinate(entry, coordinate),
      ),
      state,
      canStop:
        state === NEEDLE_CELL_STATES.Running ||
        state === NEEDLE_CELL_STATES.Preparing ||
        state === NEEDLE_CELL_STATES.Pending,
    }
  }
  return { getCell }
}

/** Keep state labels identical in the table and its execution details. */
export function getNeedleCellStateLabel(
  state: NeedleCellState,
  t: TFunction<"aiApiVerification">,
) {
  const labels: Record<NeedleCellState, string> = {
    [NEEDLE_CELL_STATES.Hit]: t(
      "aiApiVerification:verifyDialog.tools.needle.outcomes.hit",
    ),
    [NEEDLE_CELL_STATES.Miss]: t(
      "aiApiVerification:verifyDialog.tools.needle.outcomes.miss",
    ),
    [NEEDLE_CELL_STATES.Error]: t(
      "aiApiVerification:verifyDialog.tools.needle.outcomes.error",
    ),
    [NEEDLE_CELL_STATES.ContextLimit]: t(
      "aiApiVerification:verifyDialog.tools.needle.outcomes.contextLimit",
    ),
    [NEEDLE_CELL_STATES.Incomplete]: t(
      "aiApiVerification:verifyDialog.tools.needle.outcomes.incomplete",
    ),
    [NEEDLE_CELL_STATES.Interrupted]: t(
      "aiApiVerification:verifyDialog.tools.needle.outcomes.interrupted",
    ),
    [NEEDLE_CELL_STATES.Running]: t(
      "aiApiVerification:verifyDialog.actions.running",
    ),
    [NEEDLE_CELL_STATES.Preparing]: t(
      "aiApiVerification:verifyDialog.tools.needle.preparingCellState",
    ),
    [NEEDLE_CELL_STATES.Pending]: t(
      "aiApiVerification:verifyDialog.status.pending",
    ),
    [NEEDLE_CELL_STATES.Stopping]: t(
      "aiApiVerification:verifyDialog.tools.needle.stoppingCell",
    ),
    [NEEDLE_CELL_STATES.Cancelled]: t(
      "aiApiVerification:verifyDialog.tools.needle.cancelledCell",
    ),
    [NEEDLE_CELL_STATES.Planned]: t(
      "aiApiVerification:verifyDialog.tools.needle.planned",
    ),
    [NEEDLE_CELL_STATES.NotRun]: t(
      "aiApiVerification:verifyDialog.tools.needle.notRun",
    ),
    [NEEDLE_CELL_STATES.NotScheduled]: t(
      "aiApiVerification:verifyDialog.tools.needle.notScheduled",
    ),
  }
  return labels[state]
}
