import { useTranslation } from "react-i18next"

import {
  formatPrice,
  resolvePriceAmount,
  type CalculatedTokenPrice,
  type TokenPricesUSD,
} from "~/services/models/utils/modelPricing"

/** Shows the same token meters for flat pricing and each context tier. */
function TokenPriceBreakdown({
  prices,
  exchangeRate,
}: {
  prices: TokenPricesUSD
  exchangeRate: number
}) {
  const { t } = useTranslation("modelList")
  const details = [
    { key: "input", label: t("input1MTokens"), amount: prices.input },
    { key: "output", label: t("output1MTokens"), amount: prices.output },
    {
      key: "cache-read",
      label: t("cacheRead1MTokens"),
      amount: prices.cacheRead,
    },
    {
      key: "cache-write",
      label: t("cacheWrite1MTokens"),
      amount: prices.cacheWrite,
    },
  ]

  return (
    <div className="grid grid-cols-2 gap-4 text-xs">
      {details.map((price) =>
        price.amount === undefined ? null : (
          <div key={price.key} className="space-y-1">
            <div className="dark:text-dark-text-tertiary text-gray-500">
              {price.label}
            </div>
            <div className="dark:text-dark-text-primary font-medium text-gray-900">
              USD: {formatPrice(price.amount, "USD")}
            </div>
            <div className="dark:text-dark-text-primary font-medium text-gray-900">
              CNY:{" "}
              {formatPrice(
                resolvePriceAmount(price.amount, "CNY", exchangeRate),
                "CNY",
              )}
            </div>
          </div>
        ),
      )}
    </div>
  )
}

/** Keeps every tier's prices and inclusive context bounds visible together. */
export function ModelItemTokenPricingDetails({
  calculatedPrice,
  exchangeRate,
}: {
  calculatedPrice: CalculatedTokenPrice
  exchangeRate: number
}) {
  const { t, i18n } = useTranslation("modelList")
  if (!calculatedPrice.tiers?.length) {
    return (
      <TokenPriceBreakdown
        prices={calculatedPrice.usdPerMillionTokens}
        exchangeRate={exchangeRate}
      />
    )
  }

  return (
    <div className="space-y-4">
      {calculatedPrice.tiers.map((tier) => (
        <fieldset key={tier.minContextTokens} className="min-w-0">
          <legend className="dark:text-dark-text-secondary mb-2 text-xs font-medium text-gray-700">
            {t("contextTokenRange", {
              min: tier.minContextTokens.toLocaleString(i18n.language),
              max: tier.maxContextTokens?.toLocaleString(i18n.language) ?? "∞",
            })}
          </legend>
          <TokenPriceBreakdown
            prices={tier.usdPerMillionTokens}
            exchangeRate={exchangeRate}
          />
        </fieldset>
      ))}
    </div>
  )
}
