import { useTranslation } from "react-i18next"

import { HelpHintIcon } from "~/components/icons/productIcons"
import Tooltip from "~/components/Tooltip"
import { IconButton } from "~/components/ui"
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
    <Tooltip
      anchorAsChild
      openOnClick
      className="max-w-[min(22rem,calc(100vw-2rem))] leading-relaxed"
      content={
        <div className="max-h-[min(24rem,calc(var(--available-height,100dvh)-2rem))] space-y-3 overflow-y-auto">
          <p className="text-sm font-medium">{title}</p>
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
          <div className="space-y-1 border-t border-current/20 pt-3">
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
    >
      <IconButton
        type="button"
        variant="ghost"
        size="none"
        className="size-5 min-h-0 shrink-0 p-0 text-muted-foreground"
        aria-label={title}
      >
        <HelpHintIcon className="size-4" aria-hidden="true" />
      </IconButton>
    </Tooltip>
  )
}
