import { useTranslation } from "react-i18next"

import { HelpHintIcon } from "~/components/icons/productIcons"
import Tooltip from "~/components/Tooltip"
import { Badge, Button, CollapsibleSection } from "~/components/ui"
import { API_VERIFICATION_PROBE_STATUSES } from "~/services/verification/aiApiVerification"
import {
  CONTEXT_ATTEMPT_FAILURE_REASONS,
  CONTEXT_ATTEMPT_OUTCOMES,
  CONTEXT_CAPACITY_REASONS,
  CONTEXT_CAPACITY_TEST_ID,
} from "~/services/verification/modelQuality/contextCapacityConstants"
import { API_VERIFICATION_HISTORY_STATUSES } from "~/services/verification/verificationResultHistory/types"

import type { ContextCapacityController } from "./useContextCapacity"
import { VerificationProbeDetails } from "./VerificationProbeDetails"
import { VerificationRunButton } from "./VerificationRunButton"
import { VerificationStatusBadge } from "./VerificationStatusBadge"
import { VerificationTestLabel } from "./VerificationTestLabel"

const TOKEN_DISPLAY_UNITS = { Kilo: 1024, Mega: 1048576 } as const

const CONTEXT_COVERAGE_THRESHOLDS = {
  NearDeclared: 0.99,
  BelowDeclared: 0.95,
} as const

/** Compact display uses the same binary token units as the probe defaults. */
function readableTokens(tokens: number) {
  if (tokens >= TOKEN_DISPLAY_UNITS.Mega)
    return `${(tokens / TOKEN_DISPLAY_UNITS.Mega).toFixed(1).replace(/\.0$/, "")}M`
  if (tokens >= TOKEN_DISPLAY_UNITS.Kilo)
    return `${(tokens / TOKEN_DISPLAY_UNITS.Kilo).toFixed(1).replace(/\.0$/, "")}K`
  return tokens.toLocaleString()
}

/** Lead with the observed capacity; diagnostics and accounting stay in details. */
export function ContextCapacityPanel({
  controller,
}: {
  controller: ContextCapacityController
}) {
  const { t } = useTranslation("aiApiVerification")
  if (!controller.enabled && !controller.running) return null
  const live = controller.result ?? controller.progress
  const historical =
    !controller.running && !live && !controller.error && !controller.stopped
      ? controller.history
      : null
  const observation = live ?? historical
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
      historical?.inconclusiveReason === "timeout")
  const interrupted =
    lastAttempt?.failureReason ===
      CONTEXT_ATTEMPT_FAILURE_REASONS.Interrupted ||
    historical?.inconclusiveReason === "interrupted"
  const emptyResponse =
    reason === CONTEXT_CAPACITY_REASONS.Inconclusive &&
    (lastAttempt?.finishReason === "stop" ||
      historical?.inconclusiveReason === "empty-response")
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
                tokens: readableTokens(lower),
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
  return (
    <section
      className="border-border-subtle mt-density-4 pt-density-4 border-t"
      aria-label={t("verifyDialog.tools.context.title")}
    >
      <VerificationProbeDetails
        heading={
          <div className="min-w-0 flex-1">
            <div className="gap-y-density-1 flex min-w-0 flex-wrap items-center gap-x-2">
              <div className="flex min-w-0 items-center gap-1.5">
                <div className="text-foreground min-w-0 truncate text-sm font-medium">
                  <VerificationTestLabel testId={CONTEXT_CAPACITY_TEST_ID}>
                    {t("verifyDialog.tools.context.title")}
                  </VerificationTestLabel>
                </div>
                <Tooltip
                  anchorAsChild
                  content={
                    <div className="max-w-sm space-y-2">
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
              </div>
              {controller.running ||
              !(observation || controller.error || controller.stopped) ? (
                <Badge variant="outline" size="sm">
                  {t("verifyDialog.status.pending")}
                </Badge>
              ) : (
                <>
                  {lower > 0 ? (
                    <Badge variant={coverageVariant} size="sm">
                      {hasComparison
                        ? t("verifyDialog.tools.context.coverage", {
                            percent: Number(
                              ((lower / declaredContext!) * 100).toFixed(1),
                            ),
                          })
                        : t("verifyDialog.tools.context.measuredBadge", {
                            tokens: readableTokens(lower),
                          })}
                    </Badge>
                  ) : null}
                  <VerificationStatusBadge
                    status={status}
                    label={statusLabel}
                    latencyMs={
                      controller.result?.latencyMs ?? historical?.latencyMs
                    }
                    mode={controller.result?.mode ?? historical?.mode}
                  />
                </>
              )}
            </div>
            <p className="text-muted-foreground mt-density-1 text-xs">
              {t("verifyDialog.tools.context.hint")}
            </p>
            <div
              className="dark:text-secondary-foreground text-muted-foreground mt-density-1 text-xs"
              role="status"
              aria-label={t("verifyDialog.tools.context.resultLabel")}
            >
              {controller.running ? (
                lower > 0 ? (
                  t("verifyDialog.tools.context.acceptedTitle", {
                    tokens: readableTokens(lower),
                  })
                ) : (
                  t("verifyDialog.actions.running")
                )
              ) : observation || controller.error || controller.stopped ? (
                <>
                  {reason === CONTEXT_CAPACITY_REASONS.Budget ||
                  reason === CONTEXT_CAPACITY_REASONS.Inconclusive ||
                  reason === CONTEXT_CAPACITY_REASONS.Error ||
                  reason === CONTEXT_CAPACITY_REASONS.Stopped ? (
                    <p>{title}</p>
                  ) : null}
                  {reasonText ? <p>{reasonText}</p> : null}
                  {historical?.requiresCredentialVerification ? (
                    <p>{t("verifyDialog.tools.context.maskedHistoryHint")}</p>
                  ) : null}
                  {lower > 0 ? (
                    <p className="text-foreground">
                      {t("verifyDialog.tools.context.acceptedTitle", {
                        tokens: readableTokens(lower),
                      })}
                      {hasComparison ? (
                        <>
                          {" "}
                          ·{" "}
                          {t("verifyDialog.tools.context.comparison", {
                            expected: readableTokens(declaredContext!),
                          })}
                        </>
                      ) : null}
                    </p>
                  ) : reason !== CONTEXT_CAPACITY_REASONS.Budget &&
                    reason !== CONTEXT_CAPACITY_REASONS.Error &&
                    reason !== CONTEXT_CAPACITY_REASONS.Stopped &&
                    reason !== CONTEXT_CAPACITY_REASONS.Inconclusive ? (
                    <p>{title}</p>
                  ) : null}
                </>
              ) : (
                t("verifyDialog.notRunYet")
              )}
            </div>
          </div>
        }
        action={
          <VerificationRunButton
            onClick={controller.running ? controller.stop : controller.run}
            disabled={!controller.running && !controller.canRun}
            loading={controller.running}
            aria-label={
              controller.running ? t("verifyDialog.tools.stop") : runLabel
            }
            title={controller.running ? t("verifyDialog.tools.stop") : runLabel}
          >
            {controller.running
              ? t("verifyDialog.tools.stop")
              : canContinue
                ? runLabel
                : t("verifyDialog.actions.runOne")}
          </VerificationRunButton>
        }
      >
        {observation || controller.error ? (
          <CollapsibleSection
            title={t("verifyDialog.tools.context.details")}
            className="border-border-subtle overflow-hidden rounded-md border"
            buttonClassName="px-3 py-2"
            panelClassName="bg-surface-subtle mt-0 rounded-none border-0 border-t px-3 py-3"
          >
            <section aria-label={t("verifyDialog.tools.context.details")}>
              <div className="text-muted-foreground space-y-density-3 text-xs">
                <div className="space-y-density-1">
                  <p className="text-foreground font-medium">
                    {t("verifyDialog.tools.context.measurementDetails")}
                  </p>
                  {outputLimited ? (
                    <p>{t("verifyDialog.tools.context.outputLimited")}</p>
                  ) : null}
                  {lower > 0 ? (
                    <p>
                      {t("verifyDialog.tools.context.lower", {
                        tokens: lower.toLocaleString(),
                      })}
                    </p>
                  ) : null}
                  {observation?.upperBoundTokens !== undefined ? (
                    <p>
                      {t("verifyDialog.tools.context.upper", {
                        tokens: observation.upperBoundTokens.toLocaleString(),
                      })}
                    </p>
                  ) : null}
                  {controller.result ? (
                    <p>
                      {t("verifyDialog.tools.context.counter", {
                        encoding: controller.result.counter.encoding,
                      })}{" "}
                      {controller.result.counter.estimated
                        ? t("verifyDialog.tools.context.estimated")
                        : t("verifyDialog.tools.context.matched")}
                    </p>
                  ) : null}
                  {reason === CONTEXT_CAPACITY_REASONS.Inconclusive &&
                  !emptyResponse &&
                  lastAttempt?.finishReason ? (
                    <p>
                      {t("verifyDialog.tools.context.incompleteResponse", {
                        reason: lastAttempt.finishReason,
                      })}
                    </p>
                  ) : null}
                  {controller.error || lastAttempt?.message ? (
                    <p>{controller.error ?? lastAttempt?.message}</p>
                  ) : null}
                </div>
                <div className="border-border-subtle space-y-density-1 pt-density-2 border-t">
                  <p className="text-foreground font-medium">
                    {t("verifyDialog.tools.context.requestDetails")}
                  </p>

                  {live ? (
                    <p>
                      {t("verifyDialog.tools.context.progress", {
                        requests: live.attempts.length,
                        tokens: live.attempts
                          .reduce(
                            (total, attempt) =>
                              total +
                              Math.max(
                                attempt.targetTokens,
                                attempt.inputTokens ?? 0,
                              ),
                            0,
                          )
                          .toLocaleString(),
                      })}
                    </p>
                  ) : null}
                  {lastAttempt?.inputTokens !== undefined &&
                  lastAttempt.outputTokens !== undefined ? (
                    <p>
                      {t("verifyDialog.tools.context.reportedUsage", {
                        input: lastAttempt.inputTokens.toLocaleString(),
                        output: lastAttempt.outputTokens.toLocaleString(),
                        total: (
                          lastAttempt.inputTokens + lastAttempt.outputTokens
                        ).toLocaleString(),
                      })}
                    </p>
                  ) : null}
                </div>
              </div>
            </section>
          </CollapsibleSection>
        ) : null}
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
