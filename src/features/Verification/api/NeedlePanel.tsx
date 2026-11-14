import { useTranslation } from "react-i18next"

import { Alert, Button } from "~/components/ui"
import { VERIFICATION_RAIL_STATUS_VARIANTS } from "~/features/Verification/api/types"
import { API_VERIFICATION_PROBE_STATUSES } from "~/services/verification/aiApiVerification"
import { NEEDLE_TEST_ID } from "~/services/verification/modelQuality/needleConstants"

import { NeedlePlanSummary } from "./NeedlePlanSummary"
import { getNeedlePresentation } from "./needlePresentation"
import { NeedleResultView } from "./NeedleResultView"
import { NeedleRunActions } from "./NeedleRunActions"
import { NeedleSettings } from "./NeedleSettings"
import type { NeedleController } from "./useNeedleTest"
import { VERIFICATION_HISTORY_KINDS } from "./VerificationHistoryBadge"
import { VerificationProbeDetails } from "./VerificationProbeDetails"
import { VerificationProbeIntroduction } from "./VerificationProbeIntroduction"
import { VerificationRunAction } from "./VerificationRunAction"
import { VerificationStatusBadge } from "./VerificationStatusBadge"
import { VerificationTestLabel } from "./VerificationTestLabel"

/** Editable test settings, their generated plan and a length/depth result matrix. */
export function NeedlePanel({
  controller,
  runCapacity,
  canRunCapacity,
  capacityRunning = false,
}: {
  controller: NeedleController
  runCapacity: () => void
  canRunCapacity: boolean
  capacityRunning?: boolean
}) {
  const { t } = useTranslation("aiApiVerification")
  const { result } = controller
  const presentation = getNeedlePresentation(controller, t)
  const {
    executing,
    displayPlan,
    plannedCells,
    idle,
    hits,
    graded,
    status,
    badgeStatus,
    badgeLabel,
  } = presentation
  const runButtonProps = {
    onRun: controller.run,
    onStop: controller.stop,
    canRun: controller.canRun,
    running: executing,
  }
  const planSummary = displayPlan ? (
    <NeedlePlanSummary plan={displayPlan} />
  ) : !controller.error && !controller.invalid ? (
    <p className="text-xs text-muted-foreground" role="status">
      {t("verifyDialog.tools.needle.preparing")}
    </p>
  ) : null
  const configuration = (
    <NeedleSettings
      key="needle-settings"
      controller={controller}
      runCapacity={runCapacity}
      canRunCapacity={canRunCapacity}
      capacityRunning={capacityRunning}
    />
  )

  return (
    <section aria-label={t("verifyDialog.tools.needle.title")}>
      <VerificationProbeDetails
        settings={configuration}
        testId={NEEDLE_TEST_ID}
        running={executing}
        statusLabel={badgeLabel}
        statusVariant={
          executing
            ? VERIFICATION_RAIL_STATUS_VARIANTS.Running
            : badgeStatus === API_VERIFICATION_PROBE_STATUSES.Pass
              ? VERIFICATION_RAIL_STATUS_VARIANTS.Success
              : badgeStatus === API_VERIFICATION_PROBE_STATUSES.Fail
                ? VERIFICATION_RAIL_STATUS_VARIANTS.Danger
                : undefined
        }
        label={t("verifyDialog.tools.needle.title")}
        idleContent={
          idle ? (
            <VerificationProbeIntroduction
              probeId={NEEDLE_TEST_ID}
              title={t("verifyDialog.tools.needle.title")}
              onRun={controller.run}
              disabled={!controller.canRun}
            />
          ) : undefined
        }
        heading={
          <span className="text-sm font-medium text-foreground">
            <VerificationTestLabel testId={NEEDLE_TEST_ID}>
              {t("verifyDialog.tools.needle.title")}
            </VerificationTestLabel>
          </span>
        }
        status={
          <VerificationStatusBadge
            historyKind={
              !executing && controller.historical
                ? VERIFICATION_HISTORY_KINDS.Needle
                : undefined
            }
            status={badgeStatus}
            label={badgeLabel}
          />
        }
        statusInteractive={!executing && controller.historical}
        action={
          <VerificationRunAction
            runLabel={t("verifyDialog.tools.needle.run")}
            {...runButtonProps}
          />
        }
        description={
          !idle && !result ? (
            <p className="text-xs leading-relaxed text-muted-foreground">
              {t("verifyDialog.tools.needle.description")}
            </p>
          ) : undefined
        }
      >
        {controller.error ? (
          <Alert variant="warning">
            <p className="text-xs break-words">{controller.error}</p>
            {!controller.counter ? (
              <Button size="sm" onClick={controller.retry}>
                {t("verifyDialog.tools.needle.retry")}
              </Button>
            ) : null}
            {controller.discard ? (
              <Button size="sm" variant="outline" onClick={controller.discard}>
                {t("verifyDialog.tools.context.discard")}
              </Button>
            ) : null}
          </Alert>
        ) : null}
        {controller.historyError ? (
          <p className="text-xs text-muted-foreground">
            {t("verifyDialog.tools.context.historyError")}
          </p>
        ) : null}
        {controller.matrixPlan || planSummary ? (
          <NeedleResultView
            status={status}
            result={result}
            historical={controller.historical}
            running={executing}
            matrixPlan={controller.matrixPlan}
            onRun={controller.runSelection}
            canRun={controller.canRunSelection}
            plannedCells={plannedCells}
            onStop={controller.stopSelection}
            stopError={controller.stopError}
            hits={hits}
            graded={graded}
            planSummary={planSummary}
            actions={
              <NeedleRunActions
                controller={controller}
                presentation={presentation}
              />
            }
          />
        ) : null}
      </VerificationProbeDetails>
    </section>
  )
}
