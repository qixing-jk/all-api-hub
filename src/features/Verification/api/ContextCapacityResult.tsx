import { useTranslation } from "react-i18next"

import { Badge, CollapsibleSection } from "~/components/ui"
import { CONTEXT_CAPACITY_REASONS } from "~/services/verification/modelQuality/contextCapacityConstants"

import type { ContextCapacityPresentation } from "./contextCapacityPresentation"
import { formatContextTokens } from "./contextTokenDisplay"
import type { ContextCapacityController } from "./useContextCapacity"
import { VERIFICATION_HISTORY_KINDS } from "./VerificationHistoryBadge"
import { VerificationStatusBadge } from "./VerificationStatusBadge"

type Props = {
  controller: Pick<
    ContextCapacityController,
    "running" | "result" | "error" | "stopped"
  >
  presentation: ContextCapacityPresentation
}

/** Present capacity conclusions independently of request accounting. */
export function ContextCapacityResultSummary({
  controller,
  presentation,
}: Props) {
  const { t } = useTranslation("aiApiVerification")
  const {
    observation,
    lower,
    reason,
    title,
    reasonText,
    historical,
    hasComparison,
    declaredContext,
  } = presentation
  if (controller.running && lower === 0) return null
  return controller.running ||
    observation ||
    controller.error ||
    controller.stopped ? (
    <div
      className="space-y-2"
      role="status"
      aria-label={t("verifyDialog.tools.context.resultLabel")}
    >
      {controller.running ? (
        t("verifyDialog.tools.context.acceptedTitle", {
          tokens: formatContextTokens(lower),
        })
      ) : (
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
            <p className="text-base font-semibold text-foreground">
              {t("verifyDialog.tools.context.acceptedTitle", {
                tokens: formatContextTokens(lower),
              })}
              {hasComparison ? (
                <>
                  {" "}
                  ·{" "}
                  {t("verifyDialog.tools.context.comparison", {
                    expected: formatContextTokens(declaredContext!),
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
      )}
    </div>
  ) : null
}

/** Present capacity coverage and status without equating history to a current run. */
export function ContextCapacityStatus({ controller, presentation }: Props) {
  const { t } = useTranslation("aiApiVerification")
  const {
    observation,
    lower,
    historical,
    coverageVariant,
    hasComparison,
    declaredContext,
    status,
    statusLabel,
  } = presentation
  return (
    <>
      {controller.running ||
      !(observation || controller.error || controller.stopped) ? (
        <Badge variant="outline" size="sm">
          {controller.running
            ? t("verifyDialog.actions.running")
            : t("verifyDialog.status.pending")}
        </Badge>
      ) : (
        <>
          {lower > 0 ? (
            <Badge
              variant={historical ? "secondary" : coverageVariant}
              size="sm"
            >
              {hasComparison
                ? t("verifyDialog.tools.context.coverage", {
                    percent: Number(
                      ((lower / declaredContext!) * 100).toFixed(1),
                    ),
                  })
                : t("verifyDialog.tools.context.measuredBadge", {
                    tokens: formatContextTokens(lower),
                  })}
            </Badge>
          ) : null}
          <VerificationStatusBadge
            historyKind={
              historical ? VERIFICATION_HISTORY_KINDS.Context : undefined
            }
            status={status}
            label={statusLabel}
            latencyMs={controller.result?.latencyMs ?? historical?.latencyMs}
            mode={controller.result?.mode ?? historical?.mode}
          />
        </>
      )}
    </>
  )
}

/** Present capacity measurement and request details on demand. */
export function ContextCapacityDiagnostics({
  controller,
  presentation,
}: Props) {
  const { t } = useTranslation("aiApiVerification")
  const {
    observation,
    outputLimited,
    lower,
    reason,
    emptyResponse,
    lastAttempt,
    live,
  } = presentation
  return observation || controller.error ? (
    <CollapsibleSection
      title={t("verifyDialog.tools.context.details")}
      className="overflow-hidden"
      buttonClassName="px-0 py-1"
      panelClassName="bg-transparent mt-2 rounded-none border-0 px-0 py-2"
    >
      <section aria-label={t("verifyDialog.tools.context.details")}>
        <div className="space-y-density-3 text-xs text-muted-foreground">
          <div className="space-y-density-1">
            <p className="font-medium text-foreground">
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
          <div className="space-y-density-1 border-t border-border-subtle pt-density-2">
            <p className="font-medium text-foreground">
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
  ) : null
}
