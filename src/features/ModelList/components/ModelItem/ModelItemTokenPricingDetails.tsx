import { useTranslation } from "react-i18next"

import {
  formatPrice,
  resolvePriceAmount,
  type CalculatedTokenPrice,
} from "~/services/models/utils/modelPricing"

/** Shows the available flat token prices in USD and the account's display currency. */
export function ModelItemTokenPricingDetails({
  calculatedPrice,
  exchangeRate,
}: {
  calculatedPrice: CalculatedTokenPrice
  exchangeRate: number
}) {
  const prices = calculatedPrice.usdPerMillionTokens
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
            <div className="text-muted-foreground">{price.label}</div>
            <div className="text-foreground font-medium">
              USD: {formatPrice(price.amount, "USD")}
            </div>
            <div className="text-foreground font-medium">
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
