import { useMemo } from "react"
import { useTranslation } from "react-i18next"

import { Alert, Heading6 } from "~/components/ui"
import { PelicanTestResult } from "~/features/Verification/api/PelicanTestResult"
import { VERIFICATION_RAIL_STATUS_VARIANTS } from "~/features/Verification/api/types"
import {
  VERIFICATION_TOOL_STATUSES,
  type VerificationToolsController,
} from "~/features/Verification/api/useVerificationTools"
import { VerificationProbeDetails } from "~/features/Verification/api/VerificationProbeDetails"
import { VerificationProbeIntroduction } from "~/features/Verification/api/VerificationProbeIntroduction"
import { VerificationRunAction } from "~/features/Verification/api/VerificationRunAction"
import { VerificationTestLabel } from "~/features/Verification/api/VerificationTestLabel"
import { VERIFICATION_GENERATION_PART_TYPES } from "~/services/verification/aiApiVerification/generationProgress"
import { API_VERIFICATION_PROBE_STATUSES } from "~/services/verification/aiApiVerification/types"
import { PELICAN_PROMPT_ID } from "~/services/verification/promptOverrides"

import { getPelicanPresentation } from "./pelicanPresentation"
import { PelicanSettings } from "./PelicanSettings"
import { getPelicanStatusLabel, PelicanStatus } from "./PelicanStatus"
import { useVerificationRunPrompt } from "./useVerificationRunPrompt"
import { VerificationGenerationOutput } from "./VerificationGenerationOutput"
import { VerificationPromptEditor } from "./VerificationPromptEditor"

/** Drawing configuration, outcome and artifact presentation. */
export function PelicanPanel({
  controller,
}: {
  controller: VerificationToolsController
}) {
  const { t } = useTranslation("aiApiVerification")
  const {
    isPelicanRunning,
    pelicanStatus,
    pelican,
    pelicanErrorMessage,
    runPelican,
    stopPelican,
  } = controller

  const drawingResult = useMemo(
    () =>
      pelican
        ? {
            summary: pelican.text,
            status: pelican.svg
              ? API_VERIFICATION_PROBE_STATUSES.Pass
              : API_VERIFICATION_PROBE_STATUSES.Fail,
          }
        : null,
    [pelican],
  )
  const question = useVerificationRunPrompt({
    running: isPelicanRunning,
    startedAt: controller.pelicanStartedAt,
    draft:
      controller.promptDraft.pelican?.trim() ||
      controller.getDefaultPrompt(PELICAN_PROMPT_ID) ||
      undefined,
  })
  const presentation = getPelicanPresentation(controller)
  const { historical, idle } = presentation

  return (
    <section
      aria-label={t("verifyDialog.tools.pelican.title")}
      data-testid="verification-tools"
    >
      <div data-testid="verification-tools-panel">
        <VerificationProbeDetails
          settings={<PelicanSettings controller={controller} />}
          testId={PELICAN_PROMPT_ID}
          running={isPelicanRunning}
          statusLabel={getPelicanStatusLabel(t, controller, presentation)}
          statusVariant={
            isPelicanRunning
              ? VERIFICATION_RAIL_STATUS_VARIANTS.Running
              : drawingResult?.status === API_VERIFICATION_PROBE_STATUSES.Pass
                ? VERIFICATION_RAIL_STATUS_VARIANTS.Success
                : drawingResult?.status === API_VERIFICATION_PROBE_STATUSES.Fail
                  ? VERIFICATION_RAIL_STATUS_VARIANTS.Danger
                  : undefined
          }
          composer={
            <VerificationPromptEditor
              controller={controller}
              probeId={PELICAN_PROMPT_ID}
              running={isPelicanRunning}
              action={{
                onClick: isPelicanRunning ? stopPelican : runPelican,
                disabled: !isPelicanRunning && !controller.canRunPelican,
              }}
            />
          }
          label={t("verifyDialog.tools.pelican.title")}
          result={drawingResult}
          idleContent={
            idle || historical ? (
              <VerificationProbeIntroduction
                probeId={PELICAN_PROMPT_ID}
                title={t("verifyDialog.tools.pelican.title")}
                onRun={runPelican}
                disabled={!controller.canRunPelican}
                note={
                  historical
                    ? t("verifyDialog.history.storage.drawing")
                    : undefined
                }
              />
            ) : undefined
          }
          heading={
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-density-2">
                <Heading6 className="flex items-center gap-2 text-sm text-foreground">
                  <VerificationTestLabel testId={PELICAN_PROMPT_ID}>
                    {t("verifyDialog.tools.pelican.title")}
                  </VerificationTestLabel>
                </Heading6>
              </div>
            </div>
          }
          status={
            <PelicanStatus
              controller={controller}
              presentation={presentation}
            />
          }
          statusInteractive={historical}
          action={
            <VerificationRunAction
              running={isPelicanRunning}
              canRun={controller.canRunPelican}
              onRun={runPelican}
              onStop={stopPelican}
              runLabel={t("verifyDialog.tools.pelican.run")}
              title={
                isPelicanRunning
                  ? t("verifyDialog.tools.stop")
                  : t("verifyDialog.tools.pelican.run")
              }
            />
          }
          detailsContent={
            pelican ||
            isPelicanRunning ||
            controller.pelicanProgress ||
            question ? (
              <VerificationGenerationOutput
                question={question}
                progress={controller.pelicanProgress}
                metrics={pelican?.metrics}
                startedAt={controller.pelicanStartedAt}
                running={isPelicanRunning}
                partial={
                  !isPelicanRunning &&
                  (!pelican || pelican.responseComplete === false)
                }
              >
                {pelican ? (
                  <PelicanTestResult
                    pelican={pelican}
                    showAgentCalls={
                      !controller.pelicanProgress?.parts?.some(
                        (part) =>
                          part.type === VERIFICATION_GENERATION_PART_TYPES.Tool,
                      )
                    }
                  />
                ) : null}
              </VerificationGenerationOutput>
            ) : undefined
          }
        >
          {pelicanStatus === VERIFICATION_TOOL_STATUSES.Stopped ? (
            <div className="text-xs text-muted-foreground" role="status">
              {t("verifyDialog.tools.stopped")}
            </div>
          ) : null}
          {pelicanErrorMessage &&
          !controller.pelicanProgress?.parts?.some(
            (part) => part.type === VERIFICATION_GENERATION_PART_TYPES.Error,
          ) ? (
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
