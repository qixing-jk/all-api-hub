import { useTranslation } from "react-i18next"

import { ModelPricingSchedule } from "~/features/ModelList/presentation/ModelItem/ModelPricingSchedule"
import { pricingRateUnitLabels } from "~/features/ModelList/pricing/pricingScenarioOptions"
import {
  PRICE_RATE_UNITS,
  QUOTE_STATUSES,
  QUOTE_UNITS,
  TOKENS_PER_MILLION,
} from "~/services/modelPricing/pricingConstants"
import type {
  PriceMeter,
  QuoteResult,
} from "~/services/modelPricing/pricingPlan"
import { formatPrice } from "~/services/models/utils/modelPricing"

/** Renders published pricing schedules and optional computed quote details. */
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
  const unitLabels = pricingRateUnitLabels(t)
  const showsGroupMultiplier =
    !!quote.calculation &&
    (!!effectiveGroup || quote.calculation.groupMultiplier !== 1)
  const showsConversion =
    quote.calculation?.cnyPerUsd !== undefined &&
    quote.lines.some((line) => line.rate.currency !== quote.currency)

  return (
    <div id={calculationId} className="space-y-density-3">
      <h4 className="text-sm font-medium">
        {t("scenario.calculationDetails")}
      </h4>
      {quote.calculation && (showsGroupMultiplier || showsConversion) && (
        <p className="text-muted-foreground">
          {showsGroupMultiplier &&
            t("scenario.appliedMultiplier", {
              value: quote.calculation.groupMultiplier,
            })}
          {showsConversion && (
            <>
              {showsGroupMultiplier && " · "}
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
                <th className="py-density-2 pr-3">
                  {t("scenario.calculationItem")}
                </th>
                <th className="py-density-2 pr-3">
                  {t("scenario.effectiveRate")}
                </th>
                <th className="py-density-2 pr-3">
                  {t("scenario.calculationShare")}
                </th>
                <th className="py-density-2">{t("scenario.contribution")}</th>
              </tr>
            </thead>
            <tbody>
              {quote.lines.map((line) => (
                <tr key={line.meter} className="border-t">
                  <td className="py-density-2 pr-3">
                    {meterLabels[line.meter]}
                  </td>
                  <td className="py-density-2 pr-3">
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
                  <td className="py-density-2 pr-3">
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
                  <td className="py-density-2">
                    {formatPrice(line.amount, quote.currency, 6)}
                  </td>
                </tr>
              ))}
            </tbody>
            {quote.amount !== null && (
              <tfoot>
                <tr className="border-t font-medium">
                  <td colSpan={3} className="py-density-2 pr-3">
                    {t(
                      quote.status === QUOTE_STATUSES.COMPLETE
                        ? "scenario.calculationTotal"
                        : "scenario.knownPrice",
                    )}
                  </td>
                  <td className="py-density-2">
                    {formatPrice(quote.amount, quote.currency, 6)}
                  </td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      )}
      <ModelPricingSchedule
        schedule={displayedSchedule}
        source={quote.source}
        matchedRuleIds={quote.matchedRules.map((rule) => rule.id)}
        sourceLabel={sourceLabel}
        effectiveGroup={effectiveGroup}
        explainQuote
      />
    </div>
  )
}
