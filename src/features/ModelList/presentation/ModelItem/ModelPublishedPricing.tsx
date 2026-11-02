import { useTranslation } from "react-i18next"

import { PriceRateView } from "~/features/ModelList/presentation/ModelItem/ModelItemPicingView"
import { ModelPriceEvidenceBadge } from "~/features/ModelList/presentation/ModelItem/ModelPriceEvidenceBadge"
import { ModelPricingSchedule } from "~/features/ModelList/presentation/ModelItem/ModelPricingSchedule"
import {
  pricingMeterLabels,
  pricingRateUnitLabels,
} from "~/features/ModelList/pricing/pricingScenarioOptions"
import type { ModelPricePrecisionKind } from "~/services/modelList/pricingModel"
import {
  PRICE_RATE_UNITS,
  PRICING_ISSUE_REASONS,
} from "~/services/modelPricing/pricingConstants"
import type { PriceMeter } from "~/services/modelPricing/pricingPlan"
import {
  normalizePublishedSchedule,
  type PublishedPricing,
} from "~/services/modelPricing/publishedPricing"
import { formatPriceCompact } from "~/services/models/utils/modelPricing"

/** Browses published rates without requiring a usage scenario. */
export function ModelPublishedPricing({
  pricing,
  details = false,
  isAvailableForUser = true,
  pricePrecision,
  sourceLabel,
  effectiveGroup,
  metadata,
  exchangeRate = 1,
  showRealPrice = false,
}: {
  pricing: PublishedPricing
  details?: boolean
  isAvailableForUser?: boolean
  pricePrecision?: ModelPricePrecisionKind
  sourceLabel?: string
  effectiveGroup?: string
  metadata?: React.ReactNode
  exchangeRate?: number
  showRealPrice?: boolean
}) {
  const { t } = useTranslation("modelList")
  const schedule = normalizePublishedSchedule(pricing.schedule)
  const labels = pricingMeterLabels(t)
  const unitLabels = pricingRateUnitLabels(t)
  const currency = showRealPrice ? "CNY" : "USD"
  const conditional = schedule.some((rule) => rule.conditions.length > 0)
  const hasExplanation =
    !!pricing.source.pricingDescription || !!pricing.source.notes?.length
  const isReferenceRate =
    !!pricing.source.rulesUnavailable &&
    !conditional &&
    schedule.length === 1 &&
    Object.keys(schedule[0]!.rates).length === 1
  return (
    <div className="mt-density-2 space-y-density-2 text-xs">
      {details || conditional ? (
        <>
          <h4 className="text-sm font-medium">
            {t("scenario.publishedPrices")}
          </h4>
          <ModelPriceEvidenceBadge kind={pricePrecision} />
          <ModelPricingSchedule
            schedule={schedule}
            source={pricing.source}
            sourceLabel={sourceLabel}
            effectiveGroup={effectiveGroup}
          />
          {!details && !hasExplanation && pricing.source.rulesUnavailable && (
            <p className="text-muted-foreground w-full">
              {t("scenario.websiteRulesUnavailable")}
            </p>
          )}
        </>
      ) : (
        <div className="gap-y-density-1-5 flex flex-wrap items-center gap-x-3">
          <PriceRateView
            isAvailableForUser={isAvailableForUser}
            items={schedule.flatMap((rule) =>
              Object.entries(rule.rates).map(([meter, rate]) => {
                const canConvert =
                  Number.isFinite(exchangeRate) && exchangeRate > 0
                const displayCurrency = canConvert ? currency : rate.currency
                const amount =
                  rate.currency === displayCurrency
                    ? rate.amount
                    : rate.currency === "USD"
                      ? rate.amount * exchangeRate
                      : rate.amount / exchangeRate
                return {
                  key: `${rule.id}:${meter}`,
                  label: isReferenceRate
                    ? t("scenario.referenceRate")
                    : labels[meter as PriceMeter],
                  value: `${formatPriceCompact(amount, displayCurrency)}${rate.unit === PRICE_RATE_UNITS.TOKEN ? "/M" : ` / ${unitLabels[rate.unit]}`}`,
                  className: isReferenceRate
                    ? "text-foreground font-medium"
                    : (
                        {
                          input: "text-pricing-input",
                          output: "text-pricing-output",
                          cacheRead: "text-pricing-cache-read",
                          cacheWrite: "text-pricing-cache-write",
                        } as Partial<Record<PriceMeter, string>>
                      )[meter as PriceMeter] ?? "text-secondary-foreground",
                }
              }),
            )}
          />
          <ModelPriceEvidenceBadge kind={pricePrecision} />
          {!details && !hasExplanation && pricing.source.rulesUnavailable && (
            <p className="text-muted-foreground w-full">
              {t("scenario.websiteRulesUnavailable")}
            </p>
          )}
        </div>
      )}
      {!details && !conditional && hasExplanation && (
        <ModelPricingSchedule schedule={[]} source={pricing.source} />
      )}
      {pricing.issues?.some(
        (issue) => issue.reason === PRICING_ISSUE_REASONS.SOURCE_CONFLICT,
      ) && (
        <p className="text-muted-foreground">{t("scenario.sourceConflict")}</p>
      )}
      {metadata}
    </div>
  )
}
