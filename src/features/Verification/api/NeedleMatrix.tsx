import { CircleAlert, Loader2, Square } from "lucide-react"
import { useTranslation } from "react-i18next"

import Tooltip from "~/components/Tooltip"
import { Button } from "~/components/ui"
import { cn } from "~/lib/utils"
import {
  isSameNeedleCoordinate,
  type NeedleCoordinate,
  type NeedlePlan,
  type NeedleSelection,
} from "~/services/verification/modelQuality/needlePlan"
import type { NeedleResult } from "~/services/verification/modelQuality/needleRun"

import { formatContextTokens } from "./contextTokenDisplay"
import {
  getNeedleCellStateLabel,
  getNeedleMatrixState,
  NEEDLE_CELL_STATES,
} from "./needleMatrixState"
import { NeedleScopeAction } from "./NeedleScopeAction"

/** One matrix for choosing requests and inspecting their accumulated results. */
export function NeedleMatrix({
  plan,
  result,
  running = false,
  onRun,
  canRun,
  plannedCells,
  onStop,
  stopError,
  selected,
  onSelect,
}: {
  plan: NeedlePlan
  result?: NeedleResult | null
  running?: boolean
  onRun: (selection: NeedleSelection) => void
  canRun: boolean
  plannedCells: NeedleCoordinate[]
  onStop?: (selection: NeedleSelection) => void
  stopError?: NeedleSelection | null
  selected?: NeedleCoordinate | null
  onSelect: (coordinate: NeedleCoordinate) => void
}) {
  const { t } = useTranslation("aiApiVerification")
  const { getCell } = getNeedleMatrixState(result, running, plannedCells)
  const failed = (scope: NeedleSelection) =>
    Boolean(
      stopError &&
        stopError.targetTokens === scope.targetTokens &&
        stopError.depth === scope.depth,
    )
  const stopCell = (selection: NeedleCoordinate) => {
    const label = t("verifyDialog.tools.needle.stopCell", {
      length: formatContextTokens(selection.targetTokens),
      depth: selection.depth,
    })
    return (
      <Tooltip
        content={
          failed(selection) ? t("verifyDialog.tools.needle.stopFailed") : label
        }
        anchorAsChild
      >
        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          aria-label={label}
          className="text-muted-foreground hover:text-foreground border-border-subtle h-8 w-full shrink-0 rounded-none rounded-b-md border-t @sm/needle-matrix:h-auto @sm/needle-matrix:min-h-8 @sm/needle-matrix:w-8 @sm/needle-matrix:rounded-tr-md @sm/needle-matrix:rounded-bl-none @sm/needle-matrix:border-t-0 @sm/needle-matrix:border-l"
          disabled={!onStop}
          onClick={() => onStop?.(selection)}
        >
          {failed(selection) ? (
            <CircleAlert className="size-3" aria-hidden="true" />
          ) : (
            <Square className="size-3" aria-hidden="true" />
          )}
        </Button>
      </Tooltip>
    )
  }
  return (
    <div className="@container/needle-matrix space-y-2">
      <p className="text-muted-foreground text-xs">
        {t("verifyDialog.tools.needle.matrixHint")}
      </p>
      <div className="overflow-x-auto">
        <table
          className="w-full text-center text-xs"
          aria-label={t("verifyDialog.tools.needle.matrix")}
        >
          <thead className="bg-surface-subtle">
            <tr>
              <th className="px-1.5 py-2 text-left font-medium whitespace-nowrap @sm/needle-matrix:px-3">
                {t("verifyDialog.tools.needle.length")}
              </th>
              {plan.depths.map((depth) => (
                <th
                  key={depth}
                  scope="col"
                  className="px-1 py-2 font-medium @sm/needle-matrix:px-2"
                >
                  <div className="flex flex-col items-center justify-center gap-0.5 whitespace-nowrap @sm/needle-matrix:flex-row @sm/needle-matrix:gap-1">
                    {depth}%
                    <NeedleScopeAction
                      selection={{ depth }}
                      plan={plan}
                      result={result}
                      running={running}
                      plannedCells={plannedCells}
                      getCell={getCell}
                      onRun={onRun}
                      onStop={onStop}
                      canRun={canRun}
                      stopFailed={failed({ depth })}
                    />
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-border-subtle divide-y">
            {plan.lengths.map((length) => (
              <tr key={length}>
                <th
                  scope="row"
                  className="px-1.5 py-2 text-left font-normal tabular-nums @sm/needle-matrix:px-3"
                  title={`${length.toLocaleString()} tokens`}
                  aria-label={`${length.toLocaleString()} tokens`}
                >
                  <div className="flex flex-col items-start gap-0.5 whitespace-nowrap @sm/needle-matrix:flex-row @sm/needle-matrix:items-center @sm/needle-matrix:gap-1">
                    {formatContextTokens(length)}
                    <NeedleScopeAction
                      selection={{ targetTokens: length }}
                      plan={plan}
                      result={result}
                      running={running}
                      plannedCells={plannedCells}
                      getCell={getCell}
                      onRun={onRun}
                      onStop={onStop}
                      canRun={canRun}
                      stopFailed={failed({ targetTokens: length })}
                    />
                  </div>
                </th>
                {plan.depths.map((depth) => {
                  const coordinate = { targetTokens: length, depth }
                  const { state, canStop } = getCell(coordinate)
                  const label = getNeedleCellStateLabel(state, t)
                  const isSelected = isSameNeedleCoordinate(
                    coordinate,
                    selected,
                  )
                  const working =
                    state === NEEDLE_CELL_STATES.Preparing ||
                    state === NEEDLE_CELL_STATES.Running ||
                    state === NEEDLE_CELL_STATES.Stopping
                  return (
                    <td
                      key={depth}
                      className="px-1 py-1.5 @sm/needle-matrix:px-1.5"
                    >
                      <div
                        className={cn(
                          "flex max-w-full flex-col items-stretch justify-center rounded-md @sm/needle-matrix:inline-flex @sm/needle-matrix:flex-row",
                          isSelected
                            ? "bg-secondary"
                            : working
                              ? "bg-info-soft"
                              : undefined,
                        )}
                      >
                        <button
                          type="button"
                          aria-label={`${length} tokens · ${depth}%: ${label}`}
                          aria-pressed={isSelected}
                          onClick={() => onSelect(coordinate)}
                          className={cn(
                            "focus-visible:ring-ring hover:bg-surface-subtle flex h-auto min-h-8 w-full min-w-0 flex-1 items-center justify-center gap-1 rounded-md px-1 py-1.5 text-xs transition-colors focus-visible:ring-2 focus-visible:outline-none motion-reduce:transition-none @sm/needle-matrix:w-auto @sm/needle-matrix:flex-none @sm/needle-matrix:px-2",
                            canStop &&
                              "rounded-b-none @sm/needle-matrix:rounded-tr-none @sm/needle-matrix:rounded-bl-md",
                            isSelected && "hover:bg-secondary",
                            working
                              ? "text-info-soft-foreground"
                              : state === NEEDLE_CELL_STATES.Hit
                                ? "text-success-soft-foreground"
                                : state === NEEDLE_CELL_STATES.Miss ||
                                    state === NEEDLE_CELL_STATES.Error
                                  ? "text-destructive-soft-foreground"
                                  : "text-muted-foreground",
                          )}
                        >
                          {working ? (
                            <Loader2
                              className="hidden size-3 shrink-0 animate-spin motion-reduce:animate-none @sm/needle-matrix:block"
                              aria-hidden="true"
                            />
                          ) : null}
                          <span
                            className={
                              working ? "whitespace-nowrap" : "break-words"
                            }
                          >
                            {label}
                          </span>
                        </button>
                        {canStop ? stopCell(coordinate) : null}
                      </div>
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
