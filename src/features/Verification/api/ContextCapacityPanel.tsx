import { useTranslation } from "react-i18next"

import { HelpHintIcon } from "~/components/icons/productIcons"
import Tooltip from "~/components/Tooltip"
import { Button } from "~/components/ui"
import { CONTEXT_CAPACITY_TEST_ID } from "~/services/verification/modelQuality/contextCapacityConstants"

import { getContextCapacityPresentation } from "./contextCapacityPresentation"
import {
  ContextCapacityDiagnostics,
  ContextCapacityResultSummary,
  ContextCapacityStatus,
} from "./ContextCapacityResult"
import type { ContextCapacityController } from "./useContextCapacity"
import { VerificationProbeDetails } from "./VerificationProbeDetails"
import { VerificationProbeIntroduction } from "./VerificationProbeIntroduction"
import { VerificationRunAction } from "./VerificationRunAction"
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
            <div className="gap-y-density-1 flex min-w-0 flex-wrap items-center gap-x-2">
              <div className="flex min-w-0 items-center gap-1.5">
                <div className="text-foreground min-w-0 truncate text-sm font-medium">
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
                <p>{t("verifyDialog.tools.context.startHint")}</p>
              </div>
            }
          >
            <button
              type="button"
              className="dark:text-muted-foreground text-faint-foreground hover:text-muted-foreground focus-visible:ring-ring dark:hover:text-secondary-foreground inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full transition-colors focus-visible:ring-2 focus-visible:ring-offset-1 focus-visible:outline-none"
              aria-label={t("verifyDialog.tools.context.about")}
            >
              <HelpHintIcon className="h-4 w-4" aria-hidden="true" />
            </button>
          </Tooltip>
        }
        description={
          !idle ? (
            <p className="text-muted-foreground text-xs">
              {t("verifyDialog.tools.context.hint")}
            </p>
          ) : undefined
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
          observation || controller.error ? (
            <ContextCapacityDiagnostics
              controller={controller}
              presentation={presentation}
            />
          ) : null
        }
      >
        {controller.checkpointLimitReached && controller.discardCheckpoints ? (
          <div className="gap-density-2 flex min-w-0 flex-col">
            <p className="text-muted-foreground text-xs" role="alert">
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
          <p className="text-muted-foreground text-xs" role="status">
            {t("verifyDialog.tools.context.historyError")}
          </p>
        ) : null}
      </VerificationProbeDetails>
    </section>
  )
}
