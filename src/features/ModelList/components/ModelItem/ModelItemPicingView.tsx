import { useTranslation } from "react-i18next"

import {
  resolvePriceAmount,
  type TokenPricesUSD,
} from "~/services/models/utils/modelPricing"
import { type CurrencyType } from "~/types"

interface PriceViewProps {
  usdPrices: TokenPricesUSD
  exchangeRate: number
  showRealPrice: boolean
  tokenBillingType: boolean
  isAvailableForUser: boolean
  formatPriceCompact: (price: number, currency?: CurrencyType) => string
}
export const PriceView = ({
  usdPrices,
  exchangeRate,
  showRealPrice,
  tokenBillingType,
  isAvailableForUser,
  formatPriceCompact,
}: PriceViewProps) => {
  const { t } = useTranslation("modelList")
  const currency = showRealPrice ? "CNY" : "USD"
  const priceItems = [
    {
      key: "input",
      label: t("input"),
      amount: usdPrices.input,
      className: "text-pricing-input",
    },
    {
      key: "output",
      label: t("output"),
      amount: usdPrices.output,
      className: "text-pricing-output",
    },
    ...(usdPrices.cacheRead !== undefined
      ? [
          {
            key: "cache-read",
            label: t("cacheRead"),
            amount: usdPrices.cacheRead,
            className: "text-pricing-cache-read",
          },
        ]
      : []),
    ...(usdPrices.cacheWrite !== undefined
      ? [
          {
            key: "cache-write",
            label: t("cacheWrite"),
            amount: usdPrices.cacheWrite,
            className: "text-pricing-cache-write",
          },
        ]
      : []),
  ]

  return (
    <div className="gap-y-density-2 flex flex-wrap items-center gap-x-6">
      {priceItems.map((item) => (
        <div key={item.key} className="flex items-center space-x-2">
          <span className="dark:text-foreground text-muted-foreground text-sm">
            {item.label}
          </span>
          <span
            className={`text-sm ${
              isAvailableForUser ? item.className : "text-muted-foreground"
            }`}
          >
            {formatPriceCompact(
              resolvePriceAmount(item.amount, currency, exchangeRate),
              currency,
            )}
            {tokenBillingType ? "/M" : ""}
          </span>
        </div>
      ))}
    </div>
  )
}
