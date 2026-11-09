import type { TFunction } from "i18next"

import { API_VERIFICATION_PROBE_STATUSES } from "~/services/verification/aiApiVerification"
import {
  NEEDLE_OUTCOMES,
  NEEDLE_RUN_REASONS,
} from "~/services/verification/modelQuality/needleConstants"
import {
  selectNeedleCells,
  summarizeNeedleCells,
} from "~/services/verification/modelQuality/needlePlan"
import { API_VERIFICATION_HISTORY_STATUSES } from "~/services/verification/verificationResultHistory/types"

import type { NeedleController } from "./useNeedleTest"

/** Separate cumulative scores and the displayed run from the editable next plan. */
export function getNeedlePresentation(
  controller: Pick<
    NeedleController,
    "running" | "execution" | "plan" | "result" | "error"
  >,
  t: TFunction<"aiApiVerification">,
) {
  const { plan, result } = controller
  const executing = controller.running && !controller.execution?.settled
  const resultCells = result
    ? result.scheduled ?? selectNeedleCells(result.plan).cells
    : undefined
  const displayPlan =
    executing && controller.execution
      ? summarizeNeedleCells(controller.execution.cells)
      : resultCells
        ? summarizeNeedleCells(resultCells)
        : plan
  const plannedCells =
    controller.execution?.cells ??
    resultCells ??
    (plan ? selectNeedleCells(plan).cells : [])
  const idle = !result && !controller.running && !controller.error
  const reasons = {
    [NEEDLE_RUN_REASONS.Running]: t("verifyDialog.actions.running"),
    [NEEDLE_RUN_REASONS.Complete]: t(
      "verifyDialog.tools.needle.reasons.complete",
    ),
    [NEEDLE_RUN_REASONS.Stopped]: t("verifyDialog.status.stopped"),
    [NEEDLE_RUN_REASONS.Budget]: t("verifyDialog.tools.needle.reasons.budget"),
    [NEEDLE_RUN_REASONS.Interrupted]: t(
      "verifyDialog.tools.needle.reasons.interrupted",
    ),
    [NEEDLE_RUN_REASONS.Error]: t("verifyDialog.tools.needle.reasons.error"),
  }
  const hits =
    result?.cells.filter((cell) => cell.outcome === NEEDLE_OUTCOMES.Hit)
      .length ?? 0
  const graded =
    result?.cells.filter(
      (cell) =>
        cell.outcome === NEEDLE_OUTCOMES.Hit ||
        cell.outcome === NEEDLE_OUTCOMES.Miss,
    ).length ?? 0
  const status = executing
    ? reasons[NEEDLE_RUN_REASONS.Running]
    : result
      ? reasons[result.reason]
      : t("verifyDialog.status.pending")

  const badgeStatus =
    executing || !result
      ? API_VERIFICATION_HISTORY_STATUSES.Unverified
      : result.reason === NEEDLE_RUN_REASONS.Error
        ? API_VERIFICATION_PROBE_STATUSES.Fail
        : result.reason === NEEDLE_RUN_REASONS.Complete &&
            graded === result.plan.requests
          ? hits === graded
            ? API_VERIFICATION_PROBE_STATUSES.Pass
            : API_VERIFICATION_PROBE_STATUSES.Fail
          : API_VERIFICATION_HISTORY_STATUSES.Unverified
  const badgeLabel =
    !executing && result?.reason === NEEDLE_RUN_REASONS.Complete
      ? t("verifyDialog.tools.needle.score", {
          hits,
          total: result.plan.requests,
        })
      : status
  return {
    executing,
    displayPlan,
    plannedCells,
    idle,
    hits,
    graded,
    status,
    badgeStatus,
    badgeLabel,
  }
}
export type NeedlePresentation = ReturnType<typeof getNeedlePresentation>
