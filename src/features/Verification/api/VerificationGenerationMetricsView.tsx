import { useTranslation } from "react-i18next"

import type { VerificationGenerationMetrics } from "~/services/verification/aiApiVerification/generationMetrics"

import { formatLatency } from "./utils"

const METRIC_KINDS = { Time: "time", Speed: "speed", Tokens: "tokens" } as const

/** Preserve per-step measurements instead of combining unlike throughput values. */
export function VerificationGenerationMetricsView({
  steps,
  compact = false,
}: {
  steps: VerificationGenerationMetrics[]
  compact?: boolean
}) {
  const { t } = useTranslation("aiApiVerification")
  return steps.map((step, index) => (
    <div key={index} className="space-y-2">
      {steps.length > 1 ? (
        <p className="text-xs text-muted-foreground">
          {t("verifyDialog.generation.step", { step: index + 1 })}
        </p>
      ) : null}
      <dl
        className={
          compact
            ? "flex flex-wrap gap-x-4 gap-y-2 text-xs"
            : "grid grid-cols-2 gap-x-6 gap-y-4 text-sm sm:grid-cols-3"
        }
      >
        {(
          [
            [
              t("verifyDialog.generation.responseTime"),
              step.responseTimeMs,
              METRIC_KINDS.Time,
            ],
            [
              t("verifyDialog.generation.firstOutput"),
              step.timeToFirstOutputMs,
              METRIC_KINDS.Time,
            ],
            [
              t("verifyDialog.generation.outputSpeed"),
              step.outputTokensPerSecond,
              METRIC_KINDS.Speed,
            ],
            ...(!compact
              ? ([
                  [
                    t("verifyDialog.generation.effectiveSpeed"),
                    step.effectiveOutputTokensPerSecond,
                    METRIC_KINDS.Speed,
                  ],
                  [
                    t("verifyDialog.generation.inputTokens"),
                    step.inputTokens,
                    METRIC_KINDS.Tokens,
                  ],
                  [
                    t("verifyDialog.generation.outputTokens"),
                    step.outputTokens,
                    METRIC_KINDS.Tokens,
                  ],
                  [
                    t("verifyDialog.generation.reasoningTokens"),
                    step.reasoningTokens,
                    METRIC_KINDS.Tokens,
                  ],
                  [
                    t("verifyDialog.generation.cachedTokens"),
                    step.cachedInputTokens,
                    METRIC_KINDS.Tokens,
                  ],
                ] as const)
              : []),
          ] as const
        ).map(([label, value, kind]) =>
          value === undefined ? null : (
            <div
              key={label}
              className={
                compact
                  ? "flex flex-wrap items-baseline gap-x-1.5"
                  : "space-y-1"
              }
            >
              <dt className="text-muted-foreground">{label}</dt>
              <dd className="font-medium text-foreground tabular-nums">
                {kind === METRIC_KINDS.Time
                  ? formatLatency(value)
                  : `${value.toLocaleString(undefined, { maximumFractionDigits: 1 })}${kind === METRIC_KINDS.Speed ? " token/s" : ""}`}
              </dd>
            </div>
          ),
        )}
      </dl>
    </div>
  ))
}
