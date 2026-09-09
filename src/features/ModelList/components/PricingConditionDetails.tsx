import { useTranslation } from "react-i18next"

import {
  getPricingConditionTargets,
  usePricingScenarioNavigation,
} from "~/features/ModelList/pricingScenarioNavigation"
import {
  pricingMeterLabels,
  pricingScenarioOptions,
} from "~/features/ModelList/pricingScenarioOptions"
import {
  PRICING_ISSUE_CODES,
  PRICING_SELECTION_AXES,
} from "~/services/modelPricing/pricingConstants"
import type { QuoteResult } from "~/services/modelPricing/pricingPlan"
import { normalizeVideoQuality } from "~/services/modelPricing/videoQuality"

/** Explain the same selection gaps in the model list and diagnostic report. */
export function PricingConditionDetails({
  details,
  requirements,
  issues,
  actions = false,
}: {
  details: QuoteResult["conditionDetails"]
  requirements?: QuoteResult["requirementDetails"]
  issues?: QuoteResult["issues"]
  actions?: boolean
}) {
  const { t } = useTranslation("modelList")
  const options = pricingScenarioOptions(t)
  const navigation = usePricingScenarioNavigation()
  const targets = getPricingConditionTargets({
    conditionDetails: details,
    requirementDetails: requirements,
    issues,
  })
  const labels: Record<string, string> = {
    ...pricingMeterLabels(t),
    ...options.labels,
    inputTokens: t("scenario.input"),
    outputTokens: t("scenario.output"),
    totalTokens: t("scenario.totalTokens"),
    at: t("scenario.pricingTime"),
  }
  const priceMessages = [
    ...(issues?.some(
      (issue) => issue.code === PRICING_ISSUE_CODES.SOURCE_UNAVAILABLE,
    )
      ? [t("scenario.pricingSourceUnavailable")]
      : []),
    ...(issues?.some(
      (issue) => issue.code === PRICING_ISSUE_CODES.PRICE_UNAVAILABLE,
    )
      ? [t("scenario.fixedPriceUnavailable")]
      : []),
    ...(issues?.some(
      (issue) => issue.code === PRICING_ISSUE_CODES.OUTPUT_TOKEN_MIX,
    )
      ? [t("scenario.outputTokenMix")]
      : []),
  ]
  if (!details?.length && !requirements?.length && !priceMessages.length)
    return null
  return (
    <ul className="text-muted-foreground space-y-1 text-xs">
      {priceMessages.map((message) => (
        <li key={message}>{message}</li>
      ))}
      {(details ?? []).map((detail) => {
        const label = (value: string) => {
          const normalized =
            detail.axis === PRICING_SELECTION_AXES.VIDEO_QUALITY
              ? normalizeVideoQuality(value)
              : value
          return (
            options[detail.axis].find((option) => option.value === normalized)
              ?.label ?? normalized
          )
        }
        return (
          <li key={detail.axis}>
            {detail.selected === undefined
              ? t("scenario.selectionMissing", {
                  field: options.labels[detail.axis],
                  values: detail.available.map(label).join(" / "),
                })
              : t("scenario.selectionUnavailable", {
                  field: options.labels[detail.axis],
                  selected: label(detail.selected),
                  values: detail.available.map(label).join(" / "),
                })}
          </li>
        )
      })}
      {requirements?.map((detail) => {
        const ranges = [
          ...new Set(
            detail.ranges?.map((range) =>
              [
                range.min === undefined
                  ? ""
                  : `${range.minExclusive ? ">" : "≥"} ${range.min}`,
                range.max === undefined
                  ? ""
                  : `${range.maxExclusive ? "<" : "≤"} ${range.max}`,
              ]
                .filter(Boolean)
                .join(", "),
            ) ?? [],
          ),
        ].join(" / ")
        const current =
          detail.value === undefined ||
          detail.value === null ||
          (typeof detail.value === "number" && !Number.isFinite(detail.value))
            ? "—"
            : String(detail.value)
        return (
          <li key={detail.axis}>
            {detail.kind === "time"
              ? t("scenario.timeRequirement", {
                  field: labels[detail.axis],
                  current,
                })
              : t("scenario.numericRequirement", {
                  field: labels[detail.axis] ?? detail.axis,
                  current,
                  ranges: ranges || "≥ 0",
                })}
          </li>
        )
      })}
      {actions && navigation && targets.length > 0 && (
        <li>
          <button
            type="button"
            className="text-primary cursor-pointer underline underline-offset-2"
            onClick={() => navigation.configure(targets)}
          >
            {t("scenario.configure")}
          </button>
        </li>
      )}
    </ul>
  )
}
