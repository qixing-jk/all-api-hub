import { CircleAlert, Play, RotateCcw, Square } from "lucide-react"
import { useTranslation } from "react-i18next"

import Tooltip from "~/components/Tooltip"
import { Badge, CollapsibleSection } from "~/components/ui"
import type { NeedleCoordinate } from "~/services/verification/modelQuality/needlePlan"
import type { NeedleCell } from "~/services/verification/modelQuality/needleRun"

import { formatContextTokens } from "./contextTokenDisplay"
import {
  getNeedleCellStateLabel,
  NEEDLE_CELL_STATES,
  type NeedleCellState,
} from "./needleMatrixState"
import { VerificationGenerationOutput } from "./VerificationGenerationOutput"
import { VerificationRunButton } from "./VerificationRunButton"

/** Live details and an explicit run action for the cell selected in the matrix. */
export function NeedleCellDetails({
  coordinate,
  state,
  cell,
  output,
  onRun,
  canRun,
  canStop,
  onStop,
  stopFailed,
}: {
  coordinate: NeedleCoordinate
  state: NeedleCellState
  output?: NonNullable<
    import("~/services/verification/modelQuality/needleRun").NeedleResult["outputs"]
  >[number]
  cell?: NeedleCell
  onRun: () => void
  canRun: boolean
  canStop: boolean
  onStop?: () => void
  stopFailed: boolean
}) {
  const { t } = useTranslation("aiApiVerification")
  const retest = Boolean(cell) || state === NEEDLE_CELL_STATES.Cancelled
  const stopping = state === NEEDLE_CELL_STATES.Stopping
  const active = canStop || stopping
  const actionLabel = active
    ? t("verifyDialog.tools.needle.stopCell", {
        length: formatContextTokens(coordinate.targetTokens),
        depth: coordinate.depth,
      })
    : retest
      ? t("verifyDialog.tools.needle.retestCell")
      : t("verifyDialog.tools.needle.runCell")
  const ActionIcon = stopFailed
    ? CircleAlert
    : active
      ? Square
      : retest
        ? RotateCcw
        : Play
  const measurement = [
    NEEDLE_CELL_STATES.Running,
    NEEDLE_CELL_STATES.Preparing,
    NEEDLE_CELL_STATES.Pending,
    NEEDLE_CELL_STATES.Stopping,
  ].some((candidate) => candidate === state)
    ? undefined
    : cell
  return (
    <div className="space-y-2 text-xs">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <p className="font-medium text-foreground">
            {formatContextTokens(coordinate.targetTokens)} · {coordinate.depth}%
          </p>
          <Badge variant="outline" size="sm">
            {getNeedleCellStateLabel(state, t)}
          </Badge>
        </div>
        <Tooltip
          anchorAsChild
          content={
            stopFailed ? t("verifyDialog.tools.needle.stopFailed") : actionLabel
          }
        >
          <VerificationRunButton
            type="button"
            aria-label={actionLabel}
            aria-busy={active || undefined}
            disabled={active ? !canStop || !onStop : !canRun}
            onClick={active ? onStop : onRun}
            leftIcon={<ActionIcon className="size-3.5" aria-hidden="true" />}
          >
            {stopping
              ? t("verifyDialog.tools.needle.stoppingCell")
              : canStop
                ? t("verifyDialog.tools.stop")
                : actionLabel}
          </VerificationRunButton>
        </Tooltip>
      </div>
      {state === NEEDLE_CELL_STATES.Cancelled && measurement ? (
        <p>
          {measurement.outcome === NEEDLE_CELL_STATES.Interrupted
            ? t("verifyDialog.tools.needle.cancelledUnknown")
            : t("verifyDialog.tools.needle.previousResult")}
        </p>
      ) : null}
      {output || measurement?.metrics ? (
        <VerificationGenerationOutput
          progress={output?.progress}
          metrics={measurement?.metrics}
          running={state === NEEDLE_CELL_STATES.Running}
          startedAt={output?.startedAt}
          partial={
            state === NEEDLE_CELL_STATES.Interrupted ||
            state === NEEDLE_CELL_STATES.Cancelled ||
            state === NEEDLE_CELL_STATES.Incomplete ||
            state === NEEDLE_CELL_STATES.Error
          }
        />
      ) : null}
      {measurement ? (
        <>
          {measurement.localInputTokens > 0 &&
          measurement.latencyMs !== undefined ? (
            <p>
              {t("verifyDialog.tools.needle.cell", {
                tokens: measurement.localInputTokens.toLocaleString(),
                depth: measurement.actualDepth.toFixed(1),
                latency: Math.round(measurement.latencyMs),
              })}
            </p>
          ) : null}
          {measurement.inputTokens !== undefined &&
          measurement.outputTokens !== undefined ? (
            <p>
              {t("verifyDialog.tools.context.reportedUsage", {
                input: measurement.inputTokens,
                output: measurement.outputTokens,
                total: measurement.inputTokens + measurement.outputTokens,
              })}
            </p>
          ) : null}
          {measurement.expected || measurement.response !== undefined ? (
            <CollapsibleSection
              title={t("verifyDialog.tools.needle.requestDetails")}
              buttonClassName="px-0 py-2"
              panelClassName="bg-transparent mt-0 space-y-2 rounded-none border-0 px-0"
            >
              {measurement.expected ? (
                <p className="break-all">
                  {t("verifyDialog.tools.needle.expected", {
                    value: measurement.expected,
                  })}
                </p>
              ) : null}
              {measurement.response !== undefined ? (
                <pre className="max-h-48 overflow-auto border-l-2 border-border pl-3 break-words whitespace-pre-wrap">
                  {measurement.response}
                </pre>
              ) : null}
            </CollapsibleSection>
          ) : null}
          {measurement.message ? (
            <p className="break-words">{measurement.message}</p>
          ) : null}
        </>
      ) : null}
    </div>
  )
}
