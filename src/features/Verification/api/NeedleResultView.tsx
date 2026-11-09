import { Eye } from "lucide-react"
import { useEffect, useId, useState, type ReactNode } from "react"
import { useTranslation } from "react-i18next"

import { Badge, Card, CollapsibleSection, Heading6 } from "~/components/ui"
import { NEEDLE_RUN_REASONS } from "~/services/verification/modelQuality/needleConstants"
import type {
  NeedleCoordinate,
  NeedlePlan,
  NeedleSelection,
} from "~/services/verification/modelQuality/needlePlan"
import type { NeedleResult } from "~/services/verification/modelQuality/needleRun"

import { NeedleCellDetails } from "./NeedleCellDetails"
import { NeedleMatrix } from "./NeedleMatrix"
import { getNeedleMatrixState } from "./needleMatrixState"
import { VerificationResultCard } from "./VerificationResultCard"

/** Keep retrieval results visible while accounting and reproduction details stay optional. */
export function NeedleResultView({
  result,
  status,
  historical,
  running,
  hits,
  graded,
  matrixPlan,
  onRun,
  canRun,
  plannedCells,
  onStop,
  stopError,
  planSummary,
  actions,
}: {
  result: NeedleResult | null
  status?: string
  historical: boolean
  running: boolean
  hits: number
  graded: number
  matrixPlan: NeedlePlan | null
  onRun: (selection: NeedleSelection) => void
  canRun: boolean
  plannedCells: NeedleCoordinate[]
  onStop?: (selection: NeedleSelection) => void
  stopError?: NeedleSelection | null
  planSummary?: ReactNode
  actions?: ReactNode
}) {
  const { t } = useTranslation("aiApiVerification")
  const previewTitleId = useId()
  const [selected, setSelected] = useState<NeedleCoordinate | null>(null)
  const [showResult, setShowResult] = useState(true)
  const active = running && !historical
  useEffect(() => {
    if (active) setShowResult(true)
  }, [active])
  const selectedCell =
    selected &&
    matrixPlan?.lengths.includes(selected.targetTokens) &&
    matrixPlan.depths.some((depth) => depth === selected.depth)
      ? getNeedleMatrixState(result, active, plannedCells).getCell(selected)
      : null
  const matrix = matrixPlan ? (
    <div className="overflow-hidden">
      <NeedleMatrix
        plan={matrixPlan}
        result={result}
        running={active}
        onRun={onRun}
        canRun={canRun}
        plannedCells={plannedCells}
        onStop={onStop}
        stopError={stopError}
        selected={selected}
        onSelect={setSelected}
      />
      {selected && selectedCell ? (
        <section
          aria-label={t("verifyDialog.tools.needle.cellDetails")}
          className="border-border mt-3 border-t pt-3"
        >
          <NeedleCellDetails
            coordinate={selected}
            {...selectedCell}
            onRun={() => onRun(selected)}
            canRun={canRun && !active}
            onStop={onStop ? () => onStop(selected) : undefined}
            stopFailed={Boolean(
              stopError &&
                stopError.targetTokens === selected.targetTokens &&
                stopError.depth === selected.depth,
            )}
          />
        </section>
      ) : null}
    </div>
  ) : null
  if (!result && !running)
    return (
      <Card
        role="region"
        aria-labelledby={previewTitleId}
        padding="none"
        className="overflow-hidden shadow-none"
      >
        <div className="space-y-3 p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <Heading6
              id={previewTitleId}
              className="text-foreground flex items-center gap-2 text-sm font-semibold"
            >
              <Eye
                className="text-muted-foreground size-4 shrink-0"
                aria-hidden="true"
              />
              {t("verifyDialog.tools.needle.previewTitle")}
            </Heading6>
            {actions}
          </div>
          {planSummary}
        </div>
        {matrix ? (
          <div className="border-border border-t p-4">{matrix}</div>
        ) : null}
      </Card>
    )
  return (
    <VerificationResultCard
      bodyHidden={!showResult}
      onToggle={() => setShowResult(!showResult)}
      status={
        <>
          {status ? (
            <Badge variant="outline" size="sm">
              {status}
            </Badge>
          ) : null}
          {actions}
        </>
      }
      summary={
        <div className="space-y-3">
          {result ? (
            <div className="space-y-1" aria-live="polite">
              <p className="font-semibold tabular-nums">
                {t("verifyDialog.tools.needle.cumulativeScore", {
                  hits,
                  graded,
                })}
              </p>
              <p className="text-muted-foreground text-xs tabular-nums">
                {t("verifyDialog.tools.needle.progress", {
                  completed:
                    active && result.reason !== NEEDLE_RUN_REASONS.Running
                      ? 0
                      : result.processed ?? result.cells.length,
                  total: active
                    ? plannedCells.length
                    : result.scheduled?.length ?? result.plan.requests,
                })}
              </p>
              {historical ? (
                <p className="text-muted-foreground text-xs">
                  {t("verifyDialog.tools.needle.savedResult")}
                </p>
              ) : null}
            </div>
          ) : null}
          {planSummary}
        </div>
      }
    >
      {matrix}
      {result ? (
        <CollapsibleSection
          title={t("verifyDialog.tools.needle.resultDetails")}
          className="border-border border-t pt-2"
          buttonClassName="px-0 py-2"
          panelClassName="bg-transparent mt-0 space-y-density-2 rounded-none border-0 px-0 py-2"
        >
          <p className="text-muted-foreground text-xs">
            {t("verifyDialog.tools.needle.exactLengths", {
              lengths: result.plan.lengths
                .map((length) => length.toLocaleString())
                .join(" / "),
            })}
          </p>
          <p className="text-muted-foreground text-xs">
            {t("verifyDialog.tools.needle.tokenUnits")}
          </p>
          <p className="text-muted-foreground text-xs">
            {t("verifyDialog.tools.needle.reproduce", {
              seed: result.seed,
              encoding: result.counter.encoding,
            })}{" "}
            {result.counter.estimated
              ? t("verifyDialog.tools.context.estimated")
              : t("verifyDialog.tools.context.matched")}
          </p>
          <p className="text-muted-foreground text-xs">
            {t("verifyDialog.tools.needle.limitation")}
          </p>
        </CollapsibleSection>
      ) : null}
    </VerificationResultCard>
  )
}
