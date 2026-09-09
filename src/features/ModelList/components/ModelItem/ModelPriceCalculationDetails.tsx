import { useTranslation } from "react-i18next"

import {
  pricingRangeLabel,
  pricingScenarioOptions,
} from "~/features/ModelList/pricingScenarioOptions"
import {
  PRICE_RATE_UNITS,
  PRICING_CONDITION_KINDS,
  PRICING_SOURCE_KINDS,
  QUOTE_STATUSES,
  QUOTE_UNITS,
  TOKENS_PER_MILLION,
} from "~/services/modelPricing/pricingConstants"
import type {
  PriceMeter,
  QuoteResult,
} from "~/services/modelPricing/pricingPlan"
import { formatPrice } from "~/services/models/utils/modelPricing"

/** Explains the computed quote with its line items, schedules and source evidence. */
export function ModelPriceCalculationDetails({
  calculationId,
  quote,
  displayedSchedule,
  showsPublishedSchedule,
  indexUnitLabel,
  meterLabels,
  sourceLabel,
  effectiveGroup,
}: {
  calculationId: string
  quote: QuoteResult
  displayedSchedule: QuoteResult["schedule"]
  showsPublishedSchedule: boolean
  indexUnitLabel: string
  meterLabels: Record<PriceMeter, string>
  sourceLabel?: string
  effectiveGroup?: string
}) {
  const { t, i18n } = useTranslation("modelList")
  const options = pricingScenarioOptions(t)
  const unitLabels = {
    page: t("scenario.page"),
    megapixel: t("scenario.megapixel"),
    token: t("scenario.perMillionTokens"),
    request: t("perCall"),
    image: t("scenario.image"),
    second: t("scenario.second"),
    character: t("scenario.character"),
    search: t("scenario.search"),
    "search-unit": t("scenario.searchUnit"),
  }
  const pricingDescription = i18n.language.startsWith("zh")
    ? quote.source.pricingDescription?.zh ?? quote.source.pricingDescription?.en
    : quote.source.pricingDescription?.en ?? quote.source.pricingDescription?.zh

  /** Formats each published predicate separately from the schedule's markup. */
  const formatCondition = (
    condition: QuoteResult["schedule"][number]["conditions"][number],
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
      return `${options.labels[condition.axis]}: ${condition.gt === undefined ? "≥ 0" : `> ${condition.gt}`}${condition.lte === undefined ? "" : `, ≤ ${condition.lte}`}`
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
    <div id={calculationId} className="space-y-3">
      <h4 className="text-sm font-medium">
        {t("scenario.calculationDetails")}
      </h4>
      {quote.calculation && (
        <p className="text-muted-foreground">
          {t("scenario.appliedMultiplier", {
            value: quote.calculation.groupMultiplier,
          })}
          {quote.calculation.cnyPerUsd !== undefined &&
            quote.lines.some(
              (line) => line.rate.currency !== quote.currency,
            ) && (
              <>
                {" "}
                ·{" "}
                {t("scenario.appliedConversion", {
                  value: quote.calculation.cnyPerUsd,
                })}
              </>
            )}
        </p>
      )}
      {showsPublishedSchedule && <p>{t("scenario.publishedPrices")}</p>}
      {quote.calculation?.comparisonQuantity !== undefined && (
        <p>
          {t("scenario.taskBasis")} · {quote.calculation.comparisonQuantity}{" "}
          {quote.unit === QUOTE_UNITS.THOUSAND_CHARACTERS
            ? unitLabels.character
            : indexUnitLabel}
        </p>
      )}
      {quote.lines.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs tabular-nums">
            <thead>
              <tr>
                <th className="py-2 pr-3">{t("scenario.calculationItem")}</th>
                <th className="py-2 pr-3">{t("scenario.effectiveRate")}</th>
                <th className="py-2 pr-3">{t("scenario.calculationShare")}</th>
                <th className="py-2">{t("scenario.contribution")}</th>
              </tr>
            </thead>
            <tbody>
              {quote.lines.map((line) => (
                <tr key={line.meter} className="border-t">
                  <td className="py-2 pr-3">{meterLabels[line.meter]}</td>
                  <td className="py-2 pr-3">
                    {line.effectiveUnitRate === undefined
                      ? "—"
                      : formatPrice(line.effectiveUnitRate, quote.currency, 6)}
                    {" / "}
                    {unitLabels[line.rate.unit]}
                    <div className="text-muted-foreground">
                      {t("scenario.originalRate")}:{" "}
                      {formatPrice(
                        (line.rate.amount / line.rate.per) *
                          (line.rate.unit === PRICE_RATE_UNITS.TOKEN
                            ? TOKENS_PER_MILLION
                            : 1),
                        line.rate.currency,
                        6,
                      )}
                      {" / "}
                      {unitLabels[line.rate.unit]}
                    </div>
                  </td>
                  <td className="py-2 pr-3">
                    {quote.calculation?.totalWeight
                      ? new Intl.NumberFormat(i18n.language, {
                          style: "percent",
                          maximumFractionDigits: 2,
                        }).format(line.quantity / quote.calculation.totalWeight)
                      : line.quantity}
                    {line.billableQuantity !== undefined && (
                      <div className="text-muted-foreground">
                        {t("scenario.billableQuantity", {
                          value: line.billableQuantity,
                        })}
                      </div>
                    )}
                  </td>
                  <td className="py-2">
                    {formatPrice(line.amount, quote.currency, 6)}
                  </td>
                </tr>
              ))}
            </tbody>
            {quote.amount !== null && (
              <tfoot>
                <tr className="border-t font-medium">
                  <td colSpan={3} className="py-2 pr-3">
                    {t(
                      quote.status === QUOTE_STATUSES.COMPLETE
                        ? "scenario.calculationTotal"
                        : "scenario.knownPrice",
                    )}
                  </td>
                  <td className="py-2">
                    {formatPrice(quote.amount, quote.currency, 6)}
                  </td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      )}
      {displayedSchedule.length > 0 && (
        <div className="grid [grid-template-columns:repeat(auto-fit,minmax(min(100%,16rem),1fr))] gap-3">
          {displayedSchedule.map((rule) => (
            <fieldset
              key={rule.id}
              className={
                quote.matchedRules.some((matched) => matched.id === rule.id)
                  ? "min-w-0 rounded border border-blue-500 p-2"
                  : "min-w-0 rounded border p-2"
              }
            >
              <legend>
                {rule.conditions.length === 0
                  ? t("scenario.baseRates")
                  : rule.conditions.map(formatCondition).join(" · ")}
              </legend>
              {quote.matchedRules.some((matched) => matched.id === rule.id) && (
                <p>{t("scenario.matched")}</p>
              )}
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
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
      {pricingDescription && (
        <p className="text-muted-foreground whitespace-pre-line">
          {t("scenario.sitePricingDescription")}: {pricingDescription}
        </p>
      )}
      {quote.source.hasUnpricedCharges && (
        <p className="text-muted-foreground">
          {t("scenario.additionalChargesExcluded")}
        </p>
      )}
      {quote.source.kind === PRICING_SOURCE_KINDS.CATALOG && (
        <p className="text-muted-foreground">
          {t("scenario.catalogExplanation")}
        </p>
      )}
      {quote.source.conversion && (
        <p className="text-muted-foreground">
          {t("scenario.siteConversion", {
            rate: quote.source.conversion.cnyPerUsd,
          })}
        </p>
      )}
      {quote.source.capturedAt && (
        <p className="text-muted-foreground">
          {t("scenario.collected", { time: quote.source.capturedAt })}
        </p>
      )}
      {quote.source.url && (
        <a
          href={quote.source.url}
          target="_blank"
          rel="noopener noreferrer"
          className="underline"
        >
          {t("scenario.source")}
        </a>
      )}
    </div>
  )
}
