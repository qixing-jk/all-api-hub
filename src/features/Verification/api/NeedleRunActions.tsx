import { useId } from "react"
import { useTranslation } from "react-i18next"

import type { NeedlePresentation } from "./needlePresentation"
import type { NeedleController } from "./useNeedleTest"
import { VerificationRunAction } from "./VerificationRunAction"

/** Keep the next request count attached to its action while displaying the previous run's plan. */
export function NeedleRunActions({
  controller,
  presentation,
}: {
  controller: Pick<
    NeedleController,
    "plan" | "result" | "run" | "stop" | "canRun"
  >
  presentation: Pick<NeedlePresentation, "executing" | "displayPlan">
}) {
  const { t } = useTranslation("aiApiVerification")
  const id = useId()
  const { plan } = controller
  const { executing, displayPlan } = presentation
  const nextRun = Boolean(controller.result && !executing && plan)
  return displayPlan ? (
    <div className="flex items-center gap-3">
      {!controller.result || executing ? (
        <span className="text-foreground text-sm font-medium tabular-nums">
          {t("verifyDialog.tools.needle.requestCount", {
            count: displayPlan.requests,
          })}
        </span>
      ) : null}
      <VerificationRunAction
        type="button"
        onRun={controller.run}
        onStop={controller.stop}
        canRun={controller.canRun}
        running={executing}
        aria-label={nextRun ? t("verifyDialog.actions.runOne") : undefined}
        aria-describedby={nextRun ? `${id}-run-requests` : undefined}
      >
        {t("verifyDialog.actions.runOne")}
        {nextRun && plan ? (
          <span
            id={`${id}-run-requests`}
            className="text-muted-foreground tabular-nums"
          >
            {t("verifyDialog.tools.needle.requestCount", {
              count: plan.requests,
            })}
          </span>
        ) : null}
      </VerificationRunAction>
    </div>
  ) : null
}
