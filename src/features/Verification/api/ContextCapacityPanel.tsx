import { useTranslation } from "react-i18next"

import { HelpHintIcon } from "~/components/icons/productIcons"
import Tooltip from "~/components/Tooltip"
import { Button } from "~/components/ui"
import { VERIFICATION_RAIL_STATUS_VARIANTS } from "~/features/Verification/api/types"
import { API_VERIFICATION_PROBE_STATUSES } from "~/services/verification/aiApiVerification/types"
import { CONTEXT_CAPACITY_TEST_ID } from "~/services/verification/modelQuality/contextCapacityConstants"

import { getContextCapacityPresentation } from "./contextCapacityPresentation"
import {
  ContextCapacityDiagnostics,
  ContextCapacityResultSummary,
  ContextCapacityStatus,
} from "./ContextCapacityResult"
import type { ContextCapacityController } from "./useContextCapacity"
import { VerificationGenerationOutput } from "./VerificationGenerationOutput"
import { VerificationProbeDetails } from "./VerificationProbeDetails"
import { VerificationProbeIntroduction } from "./VerificationProbeIntroduction"
import { VerificationRunAction } from "./VerificationRunAction"
import { getVerificationStatusLabel } from "./VerificationStatusBadge"
import { VerificationTestLabel } from "./VerificationTestLabel"

/** Lead with the observed capacity; diagnostics and accounting stay in details. */
export function ContextCapacityPanel({
  controller,
}: {
  controller: ContextCapacityController
}) {
  const { t } = useTranslation("aiApiVerification")
  if (!controller.enabled && !controller.running) return null
  const presentation = getContextCapacityPresentation(controller, t)
  const { historical, observation, idle, canContinue, runLabel } = presentation
  return (
    <section aria-label={t("verifyDialog.tools.context.title")}>
      <VerificationProbeDetails
        testId={CONTEXT_CAPACITY_TEST_ID}
        running={controller.running}
        statusLabel={
          controller.running
            ? t("verifyDialog.actions.running")
            : (presentation.statusLabel ??
              (idle
                ? t("verifyDialog.status.pending")
                : getVerificationStatusLabel(t, presentation.status)))
        }
        statusVariant={
          controller.running
            ? VERIFICATION_RAIL_STATUS_VARIANTS.Running
            : controller.error
              ? VERIFICATION_RAIL_STATUS_VARIANTS.Danger
              : presentation.observation &&
                  "status" in presentation.observation &&
                  presentation.observation.status ===
                    API_VERIFICATION_PROBE_STATUSES.Pass
                ? VERIFICATION_RAIL_STATUS_VARIANTS.Success
                : undefined
        }
        label={t("verifyDialog.tools.context.title")}
        idleContent={
          idle ? (
            <VerificationProbeIntroduction
              probeId={CONTEXT_CAPACITY_TEST_ID}
              title={t("verifyDialog.tools.context.title")}
              onRun={controller.run}
              disabled={!controller.canRun}
            />
          ) : undefined
        }
        heading={
          <div className="min-w-0">
            <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-density-1">
              <div className="flex min-w-0 items-center gap-1.5">
                <div className="min-w-0 truncate text-sm font-medium text-foreground">
                  <VerificationTestLabel testId={CONTEXT_CAPACITY_TEST_ID}>
                    {t("verifyDialog.tools.context.title")}
                  </VerificationTestLabel>
                </div>
              </div>
            </div>
          </div>
        }
        headingAccessory={
          <Tooltip
            anchorAsChild
            content={
              <div className="max-w-[min(16rem,calc(100vw-6rem))] space-y-2">
                <p>{t("verifyDialog.tools.context.description")}</p>
                <p>{t("verifyDialog.tools.context.hint")}</p>
                <p>{t("verifyDialog.tools.context.startHint")}</p>
              </div>
            }
          >
            <button
              type="button"
              className="inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-faint-foreground transition-colors hover:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:outline-none dark:text-muted-foreground dark:hover:text-secondary-foreground"
              aria-label={t("verifyDialog.tools.context.about")}
            >
              <HelpHintIcon className="h-4 w-4" aria-hidden="true" />
            </button>
          </Tooltip>
        }
        detailAction={
          !idle && !controller.running ? (
            <VerificationRunAction
              running={controller.running}
              canRun={controller.canRun}
              onRun={controller.run}
              onStop={controller.stop}
              runLabel={runLabel}
              variant={controller.running ? "secondary" : "default"}
            >
              {canContinue ? runLabel : t("verifyDialog.actions.runOne")}
            </VerificationRunAction>
          ) : null
        }
        resultSummary={
          !idle ? (
            <ContextCapacityResultSummary
              controller={controller}
              presentation={presentation}
            />
          ) : null
        }
        status={
          <ContextCapacityStatus
            controller={controller}
            presentation={presentation}
          />
        }
        statusInteractive={Boolean(historical)}
        action={
          <VerificationRunAction
            running={controller.running}
            canRun={controller.canRun}
            onRun={controller.run}
            onStop={controller.stop}
            runLabel={runLabel}
            title={controller.running ? t("verifyDialog.tools.stop") : runLabel}
          >
            {canContinue ? runLabel : t("verifyDialog.actions.runOne")}
          </VerificationRunAction>
        }
        detailsContent={
          observation || controller.error || controller.running ? (
            <>
              <VerificationGenerationOutput
                progress={presentation.live?.generation}
                metrics={presentation.lastAttempt?.metrics}
                startedAt={presentation.live?.generationStartedAt}
                running={controller.running}
                partial={controller.stopped || Boolean(controller.error)}
              />
              <ContextCapacityDiagnostics
                controller={controller}
                presentation={presentation}
              />
            </>
          ) : null
        }
      >
        {controller.checkpointLimitReached && controller.discardCheckpoints ? (
          <div className="flex min-w-0 flex-col gap-density-2">
            <p className="text-xs text-muted-foreground" role="alert">
              {t("verifyDialog.tools.context.discardWarning")}
            </p>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="max-w-full self-start whitespace-normal"
              disabled={controller.running || controller.discardingCheckpoints}
              onClick={controller.discardCheckpoints}
            >
              {t("verifyDialog.tools.context.discard")}
            </Button>
          </div>
        ) : null}
        {controller.historyError ? (
          <p className="text-xs text-muted-foreground" role="status">
            {t("verifyDialog.tools.context.historyError")}
          </p>
        ) : null}
      </VerificationProbeDetails>
    </section>
  )
}
