import { Eye } from "lucide-react"
import { useContext, useEffect, useId, useState, type ReactNode } from "react"
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
import {
  VerificationDetailContext,
  VerificationSelectionContext,
} from "./VerificationSelectionContext"

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
  const workspace = useContext(VerificationSelectionContext)
  const headerTarget = useContext(VerificationDetailContext)?.headerTarget
  const previewTitleId = useId()
  const [selected, setSelected] = useState<NeedleCoordinate | null>(null)
  const [showResult, setShowResult] = useState(true)
  const active = running && !historical
  const latestCompleted =
    active && result?.reason !== NEEDLE_RUN_REASONS.Running
      ? 0
      : (result?.processed ?? result?.cells.length ?? 0)
  const latestTotal = active
    ? plannedCells.length
    : (result?.scheduled?.length ?? result?.plan.requests ?? 0)
  const latestProgress = { completed: latestCompleted, total: latestTotal }
  const showLatestProgress =
    result &&
    (active ||
      latestTotal !== result.plan.requests ||
      latestCompleted !== latestTotal)
  const showHeaderScore =
    result && (active || result.reason !== NEEDLE_RUN_REASONS.Complete)
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
          className="mt-3 border-t border-border pt-3"
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
              className="flex items-center gap-2 text-sm font-semibold text-foreground"
            >
              <Eye
                className="size-4 shrink-0 text-muted-foreground"
                aria-hidden="true"
              />
              {t("verifyDialog.tools.needle.previewTitle")}
            </Heading6>
            {actions}
          </div>
          {planSummary}
        </div>
        {matrix ? (
          <div className="border-t border-border p-4">{matrix}</div>
        ) : null}
      </Card>
    )
  return (
    <VerificationResultCard
      bodyHidden={!workspace && !showResult}
      onToggle={workspace ? undefined : () => setShowResult(!showResult)}
      status={
        <>
          {!workspace && status ? (
            <Badge variant="outline" size="sm">
              {status}
            </Badge>
          ) : null}
          {actions}
        </>
      }
      summary={
        headerTarget ? (
          showHeaderScore || showLatestProgress ? (
            <span
              className="inline-flex flex-wrap items-center gap-x-3 gap-y-1 tabular-nums"
              aria-live="polite"
            >
              {showHeaderScore ? (
                <span className="font-medium whitespace-nowrap text-foreground">
                  {t("verifyDialog.tools.needle.score", {
                    hits,
                    total: result!.plan.requests,
                  })}
                </span>
              ) : null}
              {showLatestProgress ? (
                <span
                  className="whitespace-nowrap tabular-nums"
                  title={t(
                    "verifyDialog.tools.needle.progress",
                    latestProgress,
                  )}
                >
                  {t("verifyDialog.tools.needle.scopeProgress", latestProgress)}
                </span>
              ) : null}
            </span>
          ) : null
        ) : (
          <div className="space-y-3">
            {result ? (
              <div className="space-y-1" aria-live="polite">
                <p className="font-semibold tabular-nums">
                  {t("verifyDialog.tools.needle.cumulativeScore", {
                    hits,
                    total: result.plan.requests,
                  })}
                </p>
                {!active && graded === 0 ? (
                  <p className="text-xs text-muted-foreground">
                    {t("verifyDialog.tools.needle.cancelledUnknown")}
                  </p>
                ) : null}
                <p className="text-xs text-muted-foreground tabular-nums">
                  {t("verifyDialog.tools.needle.progress", latestProgress)}
                </p>
                {historical ? (
                  <p className="text-xs text-muted-foreground">
                    {t("verifyDialog.tools.needle.savedResult")}
                  </p>
                ) : null}
              </div>
            ) : null}
          </div>
        )
      }
    >
      {planSummary}
      {matrix}
      {result ? (
        <CollapsibleSection
          title={t("verifyDialog.tools.needle.resultDetails")}
          className="border-t border-border pt-2"
          buttonClassName="px-0 py-2"
          panelClassName="bg-transparent mt-0 space-y-density-2 rounded-none border-0 px-0 py-2"
        >
          <p className="text-xs text-muted-foreground">
            {t("verifyDialog.tools.needle.exactLengths", {
              lengths: result.plan.lengths
                .map((length) => length.toLocaleString())
                .join(" / "),
            })}
          </p>
          <p className="text-xs text-muted-foreground">
            {t("verifyDialog.tools.needle.tokenUnits")}
          </p>
          <p className="text-xs text-muted-foreground">
            {t("verifyDialog.tools.needle.reproduce", {
              seed: result.seed,
              encoding: result.counter.encoding,
            })}{" "}
            {result.counter.estimated
              ? t("verifyDialog.tools.context.estimated")
              : t("verifyDialog.tools.context.matched")}
          </p>
          <p className="text-xs text-muted-foreground">
            {t("verifyDialog.tools.needle.limitation")}
          </p>
        </CollapsibleSection>
      ) : null}
    </VerificationResultCard>
  )
}
