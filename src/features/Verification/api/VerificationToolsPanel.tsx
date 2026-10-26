import { useId, useMemo, useState } from "react"
import { useTranslation } from "react-i18next"

import {
  Alert,
  Badge,
  CollapsibleSection,
  Heading6,
  Switch,
} from "~/components/ui"
import { AgentTestResult } from "~/features/Verification/api/AgentTestResult"
import {
  VERIFICATION_TOOL_STATUSES,
  type VerificationToolsController,
} from "~/features/Verification/api/useVerificationTools"
import { formatLatency } from "~/features/Verification/api/utils"
import { VerificationProbeDetails } from "~/features/Verification/api/VerificationProbeDetails"
import { VerificationPromptEditor } from "~/features/Verification/api/VerificationPromptEditor"
import { VerificationRunButton } from "~/features/Verification/api/VerificationRunButton"
import { VerificationTestLabel } from "~/features/Verification/api/VerificationTestLabel"
import {
  DRAWING_VERIFICATION_OUTCOMES,
  PELICAN_EXECUTION_MODES,
} from "~/services/verification/modelQuality/constants"
import { PELICAN_PROMPT_ID } from "~/services/verification/promptOverrides"
import { formatFullTime, formatRelativeTime } from "~/utils/core/formatters"

/** Inline preview of a model-drawn SVG, rendered as an image so scripts never run. */
function PelicanSvgPreview({ svg }: { svg: string }) {
  const { t } = useTranslation("aiApiVerification")
  const src = useMemo(
    () => `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`,
    [svg],
  )

  const [failedSrc, setFailedSrc] = useState<string | null>(null)
  if (failedSrc === src) {
    return (
      <Alert variant="warning">
        <p>{t("verifyDialog.tools.pelican.previewFailed")}</p>
      </Alert>
    )
  }

  return (
    <img
      src={src}
      onError={() => setFailedSrc(src)}
      alt={t("verifyDialog.tools.pelican.previewAlt")}
      className="border-border-subtle bg-surface-subtle max-h-80 w-full rounded-lg border object-contain p-3"
      data-testid="pelican-svg-preview"
    />
  )
}

export type VerificationToolsPanelProps = {
  controller: VerificationToolsController
}

/**
 * Shared verification tools, embedded unchanged by every verification dialog:
 * the on-demand pelican drawing test.
 */
export function VerificationToolsPanel({
  controller,
}: VerificationToolsPanelProps) {
  const { t } = useTranslation("aiApiVerification")
  const agentSwitchId = useId()
  const {
    isPelicanRunning,
    pelicanStatus,
    pelican,
    pelicanSummary,
    pelicanErrorMessage,
    runPelican,
    stopPelican,
  } = controller

  const drawingResult = useMemo(
    () => (pelican ? { summary: pelican.text } : null),
    [pelican],
  )
  const outcome = pelican
    ? pelican.svg
      ? DRAWING_VERIFICATION_OUTCOMES.Generated
      : DRAWING_VERIFICATION_OUTCOMES.NoArtifact
    : pelicanSummary?.outcome
  const latencyMs = pelican?.latencyMs ?? pelicanSummary?.latencyMs

  return (
    <section
      aria-label={t("verifyDialog.tools.pelican.title")}
      data-testid="verification-tools"
    >
      <div data-testid="verification-tools-panel">
        <VerificationProbeDetails
          result={drawingResult}
          heading={
            <div className="min-w-0 flex-1">
              <div className="gap-density-2 flex flex-wrap items-center">
                <Heading6 className="text-foreground flex items-center gap-2 text-sm">
                  <VerificationTestLabel testId={PELICAN_PROMPT_ID}>
                    {t("verifyDialog.tools.pelican.title")}
                  </VerificationTestLabel>
                </Heading6>
                <div
                  data-testid={
                    pelicanSummary ? "pelican-history-summary" : undefined
                  }
                  className="text-muted-foreground space-y-density-1 text-xs"
                >
                  <div className="gap-density-2 flex flex-wrap items-center">
                    <Badge
                      variant={
                        outcome === DRAWING_VERIFICATION_OUTCOMES.Generated
                          ? "success"
                          : outcome === DRAWING_VERIFICATION_OUTCOMES.Error
                            ? "destructive"
                            : "outline"
                      }
                      size="sm"
                    >
                      {outcome === DRAWING_VERIFICATION_OUTCOMES.Generated
                        ? t("verifyDialog.tools.pelican.outcomes.generated")
                        : outcome === DRAWING_VERIFICATION_OUTCOMES.Error
                          ? t("verifyDialog.tools.pelican.outcomes.error")
                          : outcome === DRAWING_VERIFICATION_OUTCOMES.NoArtifact
                            ? t(
                                "verifyDialog.tools.pelican.outcomes.no-artifact",
                              )
                            : t("verifyDialog.tools.manualBadge")}
                      {latencyMs != null && latencyMs > 0 ? (
                        <>
                          <span aria-hidden="true">·</span>
                          <span>{formatLatency(latencyMs)}</span>
                        </>
                      ) : null}
                    </Badge>
                    {pelicanSummary ? (
                      <time
                        dateTime={new Date(
                          pelicanSummary.verifiedAt,
                        ).toISOString()}
                        title={formatFullTime(
                          new Date(pelicanSummary.verifiedAt),
                        )}
                      >
                        {formatRelativeTime(
                          new Date(pelicanSummary.verifiedAt),
                        )}
                      </time>
                    ) : null}
                  </div>
                  {pelicanSummary && !pelican ? (
                    <p>{t("verifyDialog.tools.pelican.historyOnly")}</p>
                  ) : null}
                </div>
              </div>
              <p className="text-muted-foreground mt-density-1 text-xs">
                {t("verifyDialog.tools.pelican.description")}
              </p>
            </div>
          }
          action={
            <VerificationRunButton
              aria-label={
                isPelicanRunning
                  ? t("verifyDialog.tools.stop")
                  : t("verifyDialog.tools.pelican.run")
              }
              title={
                isPelicanRunning
                  ? t("verifyDialog.tools.stop")
                  : t("verifyDialog.tools.pelican.run")
              }
              onClick={isPelicanRunning ? stopPelican : runPelican}
              loading={isPelicanRunning}
              disabled={!isPelicanRunning && !controller.canRunPelican}
            >
              {isPelicanRunning
                ? t("verifyDialog.tools.stop")
                : t("verifyDialog.actions.runOne")}
            </VerificationRunButton>
          }
          detailsContent={
            pelican ? (
              <div className="space-y-density-3" data-testid="pelican-result">
                {pelican.svg && pelican.analysis.safe ? (
                  <PelicanSvgPreview svg={pelican.svg} />
                ) : null}
                <div className="text-muted-foreground text-xs">
                  {pelican.svg
                    ? t("verifyDialog.tools.pelican.analysis", {
                        shapes: pelican.analysis.shapeCount,
                        wheels: pelican.analysis.wheelClues,
                        viewBox: pelican.analysis.viewBox ?? "-",
                      })
                    : t("verifyDialog.tools.pelican.noSvg")}
                </div>
                {pelican.svg && !pelican.analysis.safe ? (
                  <Alert variant="warning">
                    <p>{t("verifyDialog.tools.pelican.unsafe")}</p>
                  </Alert>
                ) : null}
                {pelican.agent ? (
                  <AgentTestResult
                    agent={pelican.agent}
                    latencyMs={pelican.latencyMs}
                  />
                ) : null}
                <CollapsibleSection
                  title={t("verifyDialog.tools.pelican.raw")}
                  buttonClassName="border-border-subtle rounded-md border px-3 py-2"
                >
                  <pre className="text-secondary-foreground max-h-64 overflow-auto text-xs break-words whitespace-pre-wrap">
                    {pelican.text}
                  </pre>
                </CollapsibleSection>
              </div>
            ) : undefined
          }
        >
          <div className="gap-density-3 grid sm:grid-cols-[minmax(0,10rem)_minmax(0,1fr)]">
            <label
              htmlFor={agentSwitchId}
              className="text-muted-foreground py-1 text-xs"
            >
              {t("verifyDialog.tools.agent.label")}
            </label>
            <div className="gap-density-3 flex items-start justify-between">
              <p className="text-muted-foreground min-w-0 flex-1 text-xs leading-relaxed">
                {t("verifyDialog.tools.agent.hint")}
              </p>
              <Switch
                id={agentSwitchId}
                size="sm"
                checked={
                  controller.pelicanExecutionMode ===
                  PELICAN_EXECUTION_MODES.Agent
                }
                onChange={(checked) =>
                  controller.setPelicanExecutionMode(
                    checked
                      ? PELICAN_EXECUTION_MODES.Agent
                      : PELICAN_EXECUTION_MODES.Reply,
                  )
                }
                disabled={isPelicanRunning}
              />
            </div>
          </div>
          <VerificationPromptEditor
            controller={controller}
            probeId={PELICAN_PROMPT_ID}
          />
          {pelicanStatus === VERIFICATION_TOOL_STATUSES.Stopped ? (
            <div className="text-muted-foreground text-xs" role="status">
              {t("verifyDialog.tools.stopped")}
            </div>
          ) : null}
          {pelicanErrorMessage ? (
            <Alert variant="warning">
              <p>
                {t("verifyDialog.tools.errors.unexpected", {
                  message: pelicanErrorMessage,
                })}
              </p>
            </Alert>
          ) : null}
        </VerificationProbeDetails>
      </div>
    </section>
  )
}
