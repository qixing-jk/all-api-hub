import type { TFunction } from "i18next"

import { API_VERIFICATION_PROBE_STATUSES } from "~/services/verification/aiApiVerification"
import {
  CONTEXT_ATTEMPT_FAILURE_REASONS,
  CONTEXT_ATTEMPT_OUTCOMES,
  CONTEXT_CAPACITY_REASONS,
} from "~/services/verification/modelQuality/contextCapacityConstants"
import {
  API_VERIFICATION_HISTORY_STATUSES,
  CONTEXT_CAPACITY_INCONCLUSIVE_REASONS,
} from "~/services/verification/verificationResultHistory/types"

import { formatContextTokens } from "./contextTokenDisplay"
import type { ContextCapacityController } from "./useContextCapacity"

const CONTEXT_COVERAGE_THRESHOLDS = {
  NearDeclared: 0.99,
  BelowDeclared: 0.95,
} as const

/** Project live and restored observations using the existing capacity evidence rules. */
export function getContextCapacityPresentation(
  controller: Pick<
    ContextCapacityController,
    "result" | "progress" | "running" | "error" | "stopped" | "history"
  >,
  t: TFunction<"aiApiVerification">,
) {
  const live = controller.result ?? controller.progress
  const historical =
    !controller.running && !live && !controller.error && !controller.stopped
      ? controller.history
      : null
  const observation = live ?? historical
  const idle =
    !controller.running &&
    !observation &&
    !controller.error &&
    !controller.stopped
  const lower = observation?.lowerBoundTokens ?? 0
  const declaredContext =
    controller.result?.counter.declaredContext ?? historical?.declaredContext
  const hasComparison =
    lower > 0 &&
    declaredContext !== undefined &&
    Number.isFinite(declaredContext) &&
    declaredContext > 0
  const reason = controller.stopped
    ? CONTEXT_CAPACITY_REASONS.Stopped
    : controller.error
      ? CONTEXT_CAPACITY_REASONS.Error
      : observation?.reason
  const coverageRatio = hasComparison ? lower / declaredContext! : null
  // Display tolerances, not model-capacity guarantees. A low accepted sample
  // alone cannot establish a shortfall; require a confirmed rejection boundary.
  const coverageVariant =
    !controller.running &&
    coverageRatio !== null &&
    (reason === CONTEXT_CAPACITY_REASONS.Bracketed ||
      reason === CONTEXT_CAPACITY_REASONS.TestLimit) &&
    coverageRatio >= CONTEXT_COVERAGE_THRESHOLDS.NearDeclared
      ? "success"
      : !controller.running &&
          hasComparison &&
          reason === CONTEXT_CAPACITY_REASONS.Bracketed &&
          observation?.upperBoundTokens !== undefined &&
          observation.upperBoundTokens / declaredContext! <
            CONTEXT_COVERAGE_THRESHOLDS.BelowDeclared
        ? "warning"
        : "secondary"
  const lastAttempt = live?.attempts.at(-1)
  const timedOut =
    reason === CONTEXT_CAPACITY_REASONS.Inconclusive &&
    (lastAttempt?.failureReason === CONTEXT_ATTEMPT_FAILURE_REASONS.Timeout ||
      historical?.inconclusiveReason ===
        CONTEXT_CAPACITY_INCONCLUSIVE_REASONS.Timeout)
  const interrupted =
    lastAttempt?.failureReason ===
      CONTEXT_ATTEMPT_FAILURE_REASONS.Interrupted ||
    historical?.inconclusiveReason ===
      CONTEXT_CAPACITY_INCONCLUSIVE_REASONS.Interrupted
  const emptyResponse =
    reason === CONTEXT_CAPACITY_REASONS.Inconclusive &&
    (lastAttempt?.finishReason === "stop" ||
      historical?.inconclusiveReason ===
        CONTEXT_CAPACITY_INCONCLUSIVE_REASONS.EmptyResponse)
  const statusLabel =
    reason === CONTEXT_CAPACITY_REASONS.Stopped
      ? t("verifyDialog.status.stopped")
      : reason === CONTEXT_CAPACITY_REASONS.Budget
        ? t("verifyDialog.status.paused")
        : timedOut
          ? t("verifyDialog.status.timeout")
          : emptyResponse
            ? t("verifyDialog.status.emptyResponse")
            : reason === CONTEXT_CAPACITY_REASONS.Inconclusive
              ? t("verifyDialog.status.inconclusive")
              : undefined
  const outputLimited = lastAttempt
    ? lastAttempt.outcome === CONTEXT_ATTEMPT_OUTCOMES.Accepted &&
      lastAttempt.finishReason === "length"
    : historical?.outputLimited
  const canContinue =
    controller.result?.reason === CONTEXT_CAPACITY_REASONS.Budget &&
    !controller.stopped
  const runLabel = canContinue
    ? t("verifyDialog.tools.context.continue")
    : t("verifyDialog.tools.context.run")
  const status = historical?.requiresCredentialVerification
    ? API_VERIFICATION_HISTORY_STATUSES.Unverified
    : reason === CONTEXT_CAPACITY_REASONS.Error
      ? API_VERIFICATION_PROBE_STATUSES.Fail
      : lower > 0 &&
          (reason === CONTEXT_CAPACITY_REASONS.Bracketed ||
            reason === CONTEXT_CAPACITY_REASONS.TestLimit)
        ? API_VERIFICATION_PROBE_STATUSES.Pass
        : API_VERIFICATION_HISTORY_STATUSES.Unverified
  const title =
    reason === CONTEXT_CAPACITY_REASONS.Stopped ||
    (reason === CONTEXT_CAPACITY_REASONS.Inconclusive && lower > 0)
      ? t("verifyDialog.tools.context.stoppedTitle")
      : reason === CONTEXT_CAPACITY_REASONS.Error
        ? t("verifyDialog.tools.context.errorTitle")
        : reason === CONTEXT_CAPACITY_REASONS.Budget
          ? t("verifyDialog.tools.context.pausedTitle")
          : lower > 0
            ? t("verifyDialog.tools.context.acceptedTitle", {
                tokens: formatContextTokens(lower),
              })
            : t("verifyDialog.tools.context.unableTitle")
  const reasonText =
    reason === CONTEXT_CAPACITY_REASONS.Bracketed
      ? t("verifyDialog.tools.context.reasons.bracketed")
      : reason === CONTEXT_CAPACITY_REASONS.TestLimit
        ? t("verifyDialog.tools.context.reasons.test-limit")
        : reason === CONTEXT_CAPACITY_REASONS.Budget
          ? t("verifyDialog.tools.context.reasons.budget")
          : reason === CONTEXT_CAPACITY_REASONS.Inconclusive
            ? interrupted
              ? t("verifyDialog.tools.context.interrupted")
              : timedOut
                ? t("verifyDialog.tools.context.reasons.timeout")
                : emptyResponse
                  ? t("verifyDialog.tools.context.emptyResponse")
                  : t("verifyDialog.tools.context.reasons.inconclusive")
            : null
  return {
    live,
    historical,
    observation,
    idle,
    lower,
    declaredContext,
    hasComparison,
    reason,
    coverageVariant,
    lastAttempt,
    emptyResponse,
    statusLabel,
    outputLimited,
    canContinue,
    runLabel,
    status,
    title,
    reasonText,
  } as const
}

export type ContextCapacityPresentation = ReturnType<
  typeof getContextCapacityPresentation
>
