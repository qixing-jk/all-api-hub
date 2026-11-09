import { useTranslation } from "react-i18next"

import { FieldHelpPopover } from "~/components/FieldHelpPopover"
import { getDeclaredInputLimit } from "~/services/verification/modelQuality/contextLimits"
import type { ContextCounterInfo } from "~/services/verification/modelQuality/contextTokens"
import {
  NEEDLE_DEFAULTS,
  NEEDLE_PLAN_SOURCES,
} from "~/services/verification/modelQuality/needleConstants"
import type { NeedlePlan } from "~/services/verification/modelQuality/needlePlan"

import { formatContextTokens } from "./contextTokenDisplay"

/** Explain the current length rules beside the setting without expanding the preview. */
export function NeedlePlanHelp({
  plan,
  counter,
}: {
  plan: NeedlePlan
  counter: ContextCounterInfo | null
}) {
  const { t } = useTranslation("aiApiVerification")
  const title = t("verifyDialog.tools.needle.planDetails")
  const limit = formatContextTokens(plan.limit)
  const exactValue = (tokens: number) =>
    `${formatContextTokens(tokens)} (${tokens.toLocaleString()})`
  const declaredLimit = counter
    ? getDeclaredInputLimit(counter, NEEDLE_DEFAULTS.maxOutputTokens)
    : undefined
  const source =
    plan.source === NEEDLE_PLAN_SOURCES.Declared &&
    counter &&
    declaredLimit !== undefined
      ? declaredLimit === counter.declaredInput
        ? t("verifyDialog.tools.needle.sources.declaredInput", {
            input: exactValue(declaredLimit),
          })
        : t("verifyDialog.tools.needle.sources.declaredContext", {
            context: exactValue(counter.declaredContext!),
            reserve: exactValue(NEEDLE_DEFAULTS.maxOutputTokens),
            input: exactValue(declaredLimit),
          })
      : plan.source === NEEDLE_PLAN_SOURCES.Measured
        ? t("verifyDialog.tools.needle.sources.measured", { limit })
        : plan.source === NEEDLE_PLAN_SOURCES.Custom
          ? t("verifyDialog.tools.needle.sources.custom", { limit })
          : t("verifyDialog.tools.needle.sources.fallback", { limit })

  return (
    <FieldHelpPopover
      label={title}
      contentClassName="text-muted-foreground max-h-(--radix-popover-content-available-height) w-88 overflow-y-auto text-xs leading-relaxed"
      content={
        <div className="space-y-3">
          <p className="text-foreground text-sm font-medium">{title}</p>
          <p>{source}</p>
          {plan.capped ? <p>{t("verifyDialog.tools.needle.capped")}</p> : null}
          <p>
            {plan.lengths.length === 1
              ? t("verifyDialog.tools.needle.singleLengthRule", { limit })
              : t("verifyDialog.tools.needle.lengthRule", { limit })}
          </p>
          <p>
            {t("verifyDialog.tools.needle.positionRule", {
              positions: plan.depths.map((depth) => `${depth}%`).join(" / "),
            })}
          </p>
          <div className="border-border-subtle space-y-1 border-t pt-3">
            <p>
              {t("verifyDialog.tools.needle.exactLengths", {
                lengths: plan.lengths
                  .map((length) => length.toLocaleString())
                  .join(" / "),
              })}
            </p>
            <p>
              {t("verifyDialog.tools.needle.exactTotal", {
                tokens: plan.totalInputTokens.toLocaleString(),
              })}
            </p>
            <p>{t("verifyDialog.tools.needle.tokenUnits")}</p>
          </div>
        </div>
      }
    />
  )
}
