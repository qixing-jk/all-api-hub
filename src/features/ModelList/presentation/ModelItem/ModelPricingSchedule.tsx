import { useTranslation } from "react-i18next"

import {
  pricingMeterLabels,
  pricingRangeLabel,
  pricingRateUnitLabels,
  pricingScenarioOptions,
} from "~/features/ModelList/pricing/pricingScenarioOptions"
import { PricingSourceNotes } from "~/features/ModelList/pricing/PricingSourceNotes"
import {
  PRICING_CONDITION_KINDS,
  PRICING_SOURCE_KINDS,
} from "~/services/modelPricing/pricingConstants"
import type {
  PriceMeter,
  PricingPlan,
} from "~/services/modelPricing/pricingPlan"
import { formatPrice } from "~/services/models/utils/modelPricing"

/** Shared display of rate predicates, units and source facts; no scenario evaluation. */
export function ModelPricingSchedule({
  schedule,
  source,
  matchedRuleIds = [],
  sourceLabel,
  effectiveGroup,
  explainQuote = false,
}: {
  schedule: PricingPlan["rules"]
  source: PricingPlan["source"]
  matchedRuleIds?: string[]
  sourceLabel?: string
  effectiveGroup?: string
  explainQuote?: boolean
}) {
  const { t, i18n } = useTranslation("modelList")
  const options = pricingScenarioOptions(t)
  const meterLabels = pricingMeterLabels(t)
  const unitLabels = pricingRateUnitLabels(t)
  const pricingDescription = i18n.language.startsWith("zh")
    ? source.pricingDescription?.zh ?? source.pricingDescription?.en
    : source.pricingDescription?.en ?? source.pricingDescription?.zh
  /** Formats each published predicate separately from the schedule's markup. */
  const formatCondition = (
    condition: PricingPlan["rules"][number]["conditions"][number],
  ): string => {
    if (condition.kind === PRICING_CONDITION_KINDS.CALENDAR)
      return `${condition.timeZone} ${options.calendarLabels[condition.part]} ${condition.operator} ${condition.value}`
    if (condition.kind === PRICING_CONDITION_KINDS.SELECTION) {
      const value =
        options[condition.axis].find(
          (option) => option.value === condition.value,
        )?.label ?? condition.value
      return `${options.labels[condition.axis]}: ${value}`
    }
    if (condition.kind === PRICING_CONDITION_KINDS.MEASUREMENT)
      return `${options.labels[condition.axis]}: ${condition.eq === undefined ? `${condition.gt === undefined ? "≥ 0" : `> ${condition.gt}`}${condition.lte === undefined ? "" : `, ≤ ${condition.lte}`}` : `= ${condition.eq}`}`
    if (condition.kind === PRICING_CONDITION_KINDS.RANGE) {
      const basis = `${pricingRangeLabel(t, condition)} · `
      return `${basis}${t("contextTokenRange", {
        min: condition.min ?? 0,
        max:
          condition.maxExclusive === undefined
            ? "∞"
            : condition.maxExclusive - 1,
      })}`
    }
    if (condition.kind === PRICING_CONDITION_KINDS.DATE_WINDOW)
      return `${condition.start}–${condition.end ?? "∞"}`
    const timeZone =
      condition.kind === PRICING_CONDITION_KINDS.TIME_WINDOW
        ? condition.timeZone
        : "UTC"
    const clock = (minute: number) =>
      `${Math.floor(minute / 60)}:${String(minute % 60).padStart(2, "0")}`
    const days =
      condition.days
        ?.map((day) =>
          new Intl.DateTimeFormat(i18n.language, {
            weekday: "short",
            timeZone: "UTC",
          }).format(new Date(Date.UTC(2026, 8, 6 + day))),
        )
        .join(", ") ?? ""
    return `${timeZone} ${clock(condition.startMinute)}–${clock(condition.endMinute)} ${days}`
  }

  return (
    <>
      {schedule.length > 0 && (
        <div className="gap-y-density-3 grid [grid-template-columns:repeat(auto-fit,minmax(min(100%,16rem),1fr))] gap-x-3">
          {schedule.map((rule) => (
            <fieldset
              key={rule.id}
              className={
                matchedRuleIds.includes(rule.id)
                  ? "border-theme-500 py-density-2 min-w-0 rounded border px-2"
                  : "py-density-2 min-w-0 rounded border px-2"
              }
            >
              <legend>
                {rule.conditions.length === 0
                  ? t("scenario.baseRates")
                  : rule.conditions.map(formatCondition).join(" · ")}
              </legend>
              {matchedRuleIds.includes(rule.id) && (
                <p>{t("scenario.matched")}</p>
              )}
              <div className="gap-y-density-2 grid grid-cols-1 gap-x-2 sm:grid-cols-2">
                {Object.entries(rule.rates).map(([meter, rate]) => (
                  <div key={meter}>
                    <p>
                      {meterLabels[meter as PriceMeter]} ·{" "}
                      {unitLabels[rate.unit]}
                    </p>
                    <p>
                      {rate.currency}: {formatPrice(rate.amount, rate.currency)}
                    </p>
                    {!!rate.freeQuantity && (
                      <p className="text-muted-foreground">
                        {t("scenario.freeQuantity", {
                          value: rate.freeQuantity,
                        })}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            </fieldset>
          ))}
        </div>
      )}
      {sourceLabel && (
        <p className="text-muted-foreground">
          {sourceLabel}
          {effectiveGroup ? ` · ${effectiveGroup}` : ""}
        </p>
      )}
      <PricingSourceNotes notes={source.notes} />
      {pricingDescription && (
        <p className="text-muted-foreground whitespace-pre-line">
          {t("scenario.sitePricingDescription")}: {pricingDescription}
        </p>
      )}
      {source.hasUnpricedCharges && (
        <p className="text-muted-foreground">
          {t("scenario.additionalChargesExcluded")}
        </p>
      )}
      {explainQuote && source.kind === PRICING_SOURCE_KINDS.CATALOG && (
        <p className="text-muted-foreground">
          {t("scenario.catalogExplanation")}
        </p>
      )}
      {source.conversion && (
        <p className="text-muted-foreground">
          {t("scenario.siteConversion", {
            rate: source.conversion.cnyPerUsd,
          })}
        </p>
      )}
      {source.capturedAt && (
        <p className="text-muted-foreground">
          {t("scenario.collected", { time: source.capturedAt })}
        </p>
      )}
      {source.url && (
        <a
          href={source.url}
          target="_blank"
          rel="noopener noreferrer"
          className="underline"
        >
          {t("scenario.source")}
        </a>
      )}
    </>
  )
}
