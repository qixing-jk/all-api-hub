import { useTranslation } from "react-i18next"

import {
  resolvePriceAmount,
  type TokenPricesUSD,
} from "~/services/models/utils/modelPricing"
import { type CurrencyType } from "~/types"

interface PriceViewProps {
  prices: TokenPricesUSD
  sourceCurrency?: CurrencyType
  exchangeRate: number
  showRealPrice: boolean
  tokenBillingType: boolean
  isAvailableForUser: boolean
  formatPriceCompact: (price: number, currency?: CurrencyType) => string
}
export const PriceView = ({
  prices,
  sourceCurrency = "USD",
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
      amount: prices.input,
      className: "text-pricing-input",
    },
    {
      key: "output",
      label: t("output"),
      amount: prices.output,
      className: "text-pricing-output",
    },
    ...(prices.cacheRead !== undefined
      ? [
          {
            key: "cache-read",
            label: t("cacheRead"),
            amount: prices.cacheRead,
            className: "text-pricing-cache-read",
          },
        ]
      : []),
    ...(prices.cacheWrite !== undefined
      ? [
          {
            key: "cache-write",
            label: t("cacheWrite"),
            amount: prices.cacheWrite,
            className: "text-pricing-cache-write",
          },
        ]
      : []),
  ]

  return (
    <PriceRateView
      isAvailableForUser={isAvailableForUser}
      items={priceItems.map((item) => ({
        ...item,
        value: `${formatPriceCompact(
          sourceCurrency === currency
            ? item.amount
            : sourceCurrency === "CNY"
              ? item.amount / exchangeRate
              : resolvePriceAmount(item.amount, currency, exchangeRate),
          currency,
        )}${tokenBillingType ? "/M" : ""}`,
      }))}
    />
  )
}

/** Shared rate-row layout for monetary and native quota assets. */
export function PriceRateView({
  items,
  isAvailableForUser,
}: {
  items: { key: string; label: string; value: string; className: string }[]
  isAvailableForUser: boolean
}) {
  return (
    <div className="gap-y-density-2 flex flex-wrap items-center gap-x-6">
      {items.map((item) => (
        <div key={item.key} className="flex items-center space-x-2">
          <span className="dark:text-foreground text-muted-foreground text-sm">
            {item.label}
          </span>
          <span
            className={`text-sm ${isAvailableForUser ? item.className : "text-muted-foreground"}`}
          >
            {item.value}
          </span>
        </div>
      ))}
    </div>
  )
}
