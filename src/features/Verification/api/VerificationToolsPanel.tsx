import { useId, useMemo } from "react"
import { useTranslation } from "react-i18next"

import { Alert, Badge, Heading6, Switch } from "~/components/ui"
import { PelicanTestResult } from "~/features/Verification/api/PelicanTestResult"
import {
  VERIFICATION_TOOL_STATUSES,
  type VerificationToolsController,
} from "~/features/Verification/api/useVerificationTools"
import { formatLatency } from "~/features/Verification/api/utils"
import { VerificationProbeDetails } from "~/features/Verification/api/VerificationProbeDetails"
import { VerificationProbeIntroduction } from "~/features/Verification/api/VerificationProbeIntroduction"
import { VerificationPromptEditor } from "~/features/Verification/api/VerificationPromptEditor"
import { VerificationRunButton } from "~/features/Verification/api/VerificationRunButton"
import { VerificationTestLabel } from "~/features/Verification/api/VerificationTestLabel"
import {
  DRAWING_VERIFICATION_OUTCOMES,
  PELICAN_EXECUTION_MODES,
} from "~/services/verification/modelQuality/constants"
import { PELICAN_PROMPT_ID } from "~/services/verification/promptOverrides"
import { formatFullTime, formatRelativeTime } from "~/utils/core/formatters"

import { ContextCapacityPanel } from "./ContextCapacityPanel"

export type VerificationToolsPanelProps = {
  controller: VerificationToolsController
}

/**
 * Shared verification tools, embedded unchanged by every verification dialog:
 * on-demand drawing and context-capacity tests.
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
  const transient =
    isPelicanRunning || pelicanStatus === VERIFICATION_TOOL_STATUSES.Stopped
  const outcome =
    pelicanStatus === VERIFICATION_TOOL_STATUSES.Error
      ? DRAWING_VERIFICATION_OUTCOMES.Error
      : transient
        ? undefined
        : pelican
          ? pelican.svg
            ? DRAWING_VERIFICATION_OUTCOMES.Generated
            : DRAWING_VERIFICATION_OUTCOMES.NoArtifact
          : pelicanSummary?.outcome
  const latencyMs =
    transient || pelicanStatus === VERIFICATION_TOOL_STATUSES.Error
      ? undefined
      : pelican?.latencyMs ?? pelicanSummary?.latencyMs
  const idle =
    pelicanStatus === VERIFICATION_TOOL_STATUSES.Idle &&
    !pelican &&
    !pelicanSummary &&
    !pelicanErrorMessage &&
    !isPelicanRunning

  return (
    <>
      <section
        aria-label={t("verifyDialog.tools.pelican.title")}
        data-testid="verification-tools"
      >
        <div data-testid="verification-tools-panel">
          <VerificationProbeDetails
            label={t("verifyDialog.tools.pelican.title")}
            result={drawingResult}
            idleContent={
              idle ? (
                <VerificationProbeIntroduction
                  probeId={PELICAN_PROMPT_ID}
                  title={t("verifyDialog.tools.pelican.title")}
                  onRun={runPelican}
                  disabled={!controller.canRunPelican}
                />
              ) : undefined
            }
            heading={
              <div className="min-w-0">
                <div className="gap-density-2 flex flex-wrap items-center">
                  <Heading6 className="text-foreground flex items-center gap-2 text-sm">
                    <VerificationTestLabel testId={PELICAN_PROMPT_ID}>
                      {t("verifyDialog.tools.pelican.title")}
                    </VerificationTestLabel>
                  </Heading6>
                </div>
              </div>
            }
            description={
              !idle ? (
                <p className="text-muted-foreground mt-density-1 text-xs">
                  {t("verifyDialog.tools.pelican.description")}
                </p>
              ) : null
            }
            status={
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
                    {isPelicanRunning
                      ? t("verifyDialog.actions.running")
                      : pelicanStatus === VERIFICATION_TOOL_STATUSES.Stopped
                        ? t("verifyDialog.status.stopped")
                        : outcome === DRAWING_VERIFICATION_OUTCOMES.Generated
                          ? t("verifyDialog.tools.pelican.outcomes.generated")
                          : outcome === DRAWING_VERIFICATION_OUTCOMES.Error
                            ? t("verifyDialog.tools.pelican.outcomes.error")
                            : outcome ===
                                DRAWING_VERIFICATION_OUTCOMES.NoArtifact
                              ? t(
                                  "verifyDialog.tools.pelican.outcomes.no-artifact",
                                )
                              : t("verifyDialog.status.pending")}
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
                      {formatRelativeTime(new Date(pelicanSummary.verifiedAt))}
                    </time>
                  ) : null}
                </div>
                {pelicanSummary && !pelican ? (
                  <p>{t("verifyDialog.tools.pelican.historyOnly")}</p>
                ) : null}
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
              pelican ? <PelicanTestResult pelican={pelican} /> : undefined
            }
          >
            <div className="space-y-1">
              <div className="flex items-center justify-between gap-3">
                <label
                  htmlFor={agentSwitchId}
                  className="text-muted-foreground py-1 text-xs"
                >
                  {t("verifyDialog.tools.agent.label")}
                </label>
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
              <p className="text-muted-foreground text-xs leading-relaxed">
                {t("verifyDialog.tools.agent.hint")}
              </p>
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
      {controller.contextCapacity ? (
        <ContextCapacityPanel controller={controller.contextCapacity} />
      ) : null}
    </>
  )
}
