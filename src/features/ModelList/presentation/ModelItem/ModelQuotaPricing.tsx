import { useTranslation } from "react-i18next"

import Tooltip from "~/components/Tooltip"
import { PriceRateView } from "~/features/ModelList/presentation/ModelItem/ModelItemPicingView"
import { TOKENS_PER_MILLION } from "~/services/modelPricing/pricingConstants"
import {
  QUOTA_QUOTE_STATUSES,
  quotaPricingPlanSchema,
  type QuotaPricingPlan,
  type QuotaQuote,
} from "~/services/modelPricing/quotaPricing"
import { formatQuotaAmount } from "~/services/quotaAssets/quotaAsset"

/** Adapts native assets to the same published-rate rows used by currency prices. */
export function ModelQuotaPricing({
  plan,
  quote,
  isComparisonActive = false,
  isAvailableForUser = true,
}: {
  plan: QuotaPricingPlan
  quote?: QuotaQuote
  isComparisonActive?: boolean
  isAvailableForUser?: boolean
}) {
  const { t, i18n } = useTranslation("modelList")
  const parsed = quotaPricingPlanSchema.safeParse(plan)
  if (!parsed.success)
    return (
      <p className="text-muted-foreground mt-density-2 text-xs">
        {t("quotaBilling.invalid")}
      </p>
    )
  const current = parsed.data
  const quantity = (value: number) =>
    formatQuotaAmount(value, current.unit, i18n.language)
  const meters = [
    { key: "input", label: t("input"), className: "text-pricing-input" },
    { key: "output", label: t("output"), className: "text-pricing-output" },
    {
      key: "cacheRead",
      label: t("cacheRead"),
      className: "text-pricing-cache-read",
    },
    {
      key: "cacheWrite",
      label: t("cacheWrite"),
      className: "text-pricing-cache-write",
    },
  ] as const
  const items = meters.flatMap((meter) => {
    const rate = current.rates[meter.key]
    return rate
      ? [
          {
            ...meter,
            value: `${quantity((rate.amount / rate.per) * TOKENS_PER_MILLION)}/M`,
          },
        ]
      : []
  })
  const rules = current.adjustments.length
    ? `${t("quotaBilling.reference")} ${t("quotaBilling.adjustments", {
        names: current.adjustments
          .map((item) =>
            i18n.language.startsWith("zh")
              ? item.label.zh ?? item.label.en
              : item.label.en,
          )
          .join(", "),
      })}`
    : t("quotaBilling.source")
  return (
    <div className="mt-density-2 space-y-density-2">
      <div className="gap-y-density-2 flex flex-wrap items-center gap-x-6">
        <PriceRateView items={items} isAvailableForUser={isAvailableForUser} />
        <Tooltip content={rules} anchorAsChild>
          <a
            href={current.sourceUrl}
            target="_blank"
            rel="noreferrer noopener"
            className="text-muted-foreground text-xs underline underline-offset-2"
          >
            {t("quotaBilling.source")}
          </a>
        </Tooltip>
      </div>
      {isComparisonActive &&
        quote?.baseAmount != null &&
        quote.status !== QUOTA_QUOTE_STATUSES.Unavailable && (
          <p className="text-muted-foreground text-xs">
            {t("quotaBilling.comparison", {
              amount: quantity(quote.amount ?? quote.baseAmount),
            })}
            {quote.status === QUOTA_QUOTE_STATUSES.Reference &&
              ` ${t("quotaBilling.reference")}`}
          </p>
        )}
    </div>
  )
}
