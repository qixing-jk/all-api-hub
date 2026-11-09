import { CircleAlert, Play, RotateCcw, Square } from "lucide-react"
import { useTranslation } from "react-i18next"

import Tooltip from "~/components/Tooltip"
import { Button } from "~/components/ui"
import {
  matchesNeedleSelection,
  selectNeedleCells,
  type NeedleCoordinate,
  type NeedlePlan,
  type NeedleSelection,
} from "~/services/verification/modelQuality/needlePlan"
import type { NeedleResult } from "~/services/verification/modelQuality/needleRun"

import { formatContextTokens } from "./contextTokenDisplay"
import {
  NEEDLE_CELL_STATES,
  type getNeedleMatrixState,
} from "./needleMatrixState"

/** A row or column action owns its progress, retry label and cancellation availability. */
export function NeedleScopeAction({
  selection,
  plan,
  result,
  running,
  plannedCells,
  getCell,
  onRun,
  onStop,
  canRun,
  stopFailed,
}: {
  selection: NeedleSelection
  plan: NeedlePlan
  result?: NeedleResult | null
  running: boolean
  plannedCells: NeedleCoordinate[]
  getCell: ReturnType<typeof getNeedleMatrixState>["getCell"]
  onRun: (selection: NeedleSelection) => void
  onStop?: (selection: NeedleSelection) => void
  canRun: boolean
  stopFailed: boolean
}) {
  const { t } = useTranslation("aiApiVerification")
  const scope = plannedCells.filter((cell) =>
    matchesNeedleSelection(cell, selection),
  )
  const states = scope.map(getCell)
  const canStop = running && states.some((cell) => cell.canStop)
  const active =
    canStop ||
    (running &&
      states.some((cell) => cell.state === NEEDLE_CELL_STATES.Stopping))
  const working =
    running &&
    states.some(
      (cell) =>
        cell.state === NEEDLE_CELL_STATES.Running ||
        cell.state === NEEDLE_CELL_STATES.Preparing ||
        cell.state === NEEDLE_CELL_STATES.Stopping,
    )
  const completed = states.filter(
    (cell) =>
      cell.cell &&
      !cell.canStop &&
      cell.state !== NEEDLE_CELL_STATES.Stopping &&
      cell.state !== NEEDLE_CELL_STATES.Cancelled,
  ).length
  const { cells, retest } = selectNeedleCells(plan, selection, result?.cells)
  const label = t(
    selection.targetTokens === undefined
      ? active
        ? "verifyDialog.tools.needle.stopColumn"
        : retest
          ? "verifyDialog.tools.needle.retestColumn"
          : "verifyDialog.tools.needle.runColumn"
      : active
        ? "verifyDialog.tools.needle.stopRow"
        : retest
          ? "verifyDialog.tools.needle.retestRow"
          : "verifyDialog.tools.needle.runRow",
    {
      length:
        selection.targetTokens === undefined
          ? undefined
          : formatContextTokens(selection.targetTokens),
      depth: selection.depth,
      requests: t("verifyDialog.tools.needle.requestCount", {
        count: cells.length,
      }),
    },
  )
  return (
    <div className="flex items-center gap-1">
      {running && scope.length ? (
        <span
          className="text-muted-foreground text-xs font-normal tabular-nums"
          aria-label={t("verifyDialog.tools.needle.scopeProgress", {
            completed,
            total: scope.length,
          })}
        >
          {completed}/{scope.length}
        </span>
      ) : null}
      <Tooltip
        content={stopFailed ? t("verifyDialog.tools.needle.stopFailed") : label}
        anchorAsChild
      >
        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          aria-label={label}
          aria-busy={working || undefined}
          className={
            active
              ? "text-info-soft-foreground hover:bg-info-soft @sm/needle-matrix:size-(--density-control-sm)"
              : "text-muted-foreground @sm/needle-matrix:size-(--density-control-sm)"
          }
          disabled={active ? !canStop || !onStop : !canRun || running}
          onClick={() => (active ? onStop?.(selection) : onRun(selection))}
        >
          {stopFailed ? (
            <CircleAlert className="size-3" aria-hidden="true" />
          ) : active ? (
            <Square className="size-3" aria-hidden="true" />
          ) : retest ? (
            <RotateCcw className="size-3" aria-hidden="true" />
          ) : (
            <Play className="size-3" aria-hidden="true" />
          )}
        </Button>
      </Tooltip>
    </div>
  )
}
