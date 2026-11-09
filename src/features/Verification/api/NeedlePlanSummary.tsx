import { useTranslation } from "react-i18next"

import { formatContextTokens } from "./contextTokenDisplay"

/** Keep planned lengths, positions and cost visible in the preview. */
export function NeedlePlanSummary({
  plan,
}: {
  plan: {
    lengths: readonly number[]
    depths: readonly number[]
    totalInputTokens: number
  }
}) {
  const { t } = useTranslation("aiApiVerification")
  return (
    <div className="space-y-2 text-xs leading-relaxed" aria-live="polite">
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
        <div
          role="group"
          aria-label={t("verifyDialog.tools.needle.plannedLengths")}
          className="text-foreground font-medium tabular-nums"
        >
          {plan.lengths.map((length, index) => (
            <span key={length}>
              {index > 0 ? (
                <span
                  className="text-muted-foreground mx-1.5"
                  aria-hidden="true"
                >
                  /
                </span>
              ) : null}
              <span title={`${length.toLocaleString()} tokens`}>
                {formatContextTokens(length)}
              </span>
            </span>
          ))}
          <span className="text-muted-foreground ml-1 font-normal">tokens</span>
        </div>
        <p className="text-muted-foreground">
          {t("verifyDialog.tools.needle.previewPositions", {
            positions: plan.depths.map((depth) => `${depth}%`).join(" / "),
          })}
        </p>
      </div>
      <p className="text-muted-foreground">
        {t("verifyDialog.tools.needle.budget", {
          tokens: formatContextTokens(plan.totalInputTokens),
        })}
      </p>
    </div>
  )
}
