import { useMemo } from "react"
import { useTranslation } from "react-i18next"

import { Alert, Heading6 } from "~/components/ui"
import { PelicanTestResult } from "~/features/Verification/api/PelicanTestResult"
import {
  VERIFICATION_TOOL_STATUSES,
  type VerificationToolsController,
} from "~/features/Verification/api/useVerificationTools"
import { VerificationProbeDetails } from "~/features/Verification/api/VerificationProbeDetails"
import { VerificationProbeIntroduction } from "~/features/Verification/api/VerificationProbeIntroduction"
import { VerificationRunAction } from "~/features/Verification/api/VerificationRunAction"
import { VerificationTestLabel } from "~/features/Verification/api/VerificationTestLabel"
import { PELICAN_PROMPT_ID } from "~/services/verification/promptOverrides"

import { getPelicanPresentation } from "./pelicanPresentation"
import { PelicanSettings } from "./PelicanSettings"
import { PelicanStatus } from "./PelicanStatus"

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
    () => (pelican ? { summary: pelican.text } : null),
    [pelican],
  )
  const presentation = getPelicanPresentation(controller)
  const { historical, idle } = presentation

  return (
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
            pelican ? <PelicanTestResult pelican={pelican} /> : undefined
          }
        >
          <PelicanSettings controller={controller} idle={idle} />
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
