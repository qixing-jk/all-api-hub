import { useTranslation } from "react-i18next"

import {
  resolvePriceAmount,
  type TokenPricesUSD,
} from "~/services/models/utils/modelPricing"
import { CurrencyType } from "~/types"

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
    { key: "input", label: t("input"), amount: usdPrices.input, tone: "blue" },
    {
      key: "output",
      label: t("output"),
      amount: usdPrices.output,
      tone: "green",
    },
    ...(usdPrices.cacheRead !== undefined
      ? [
          {
            key: "cache-read",
            label: t("cacheRead"),
            amount: usdPrices.cacheRead,
            tone: "amber",
          },
        ]
      : []),
    ...(usdPrices.cacheWrite !== undefined
      ? [
          {
            key: "cache-write",
            label: t("cacheWrite"),
            amount: usdPrices.cacheWrite,
            tone: "purple",
          },
        ]
      : []),
  ]
  const availableToneClasses: Record<string, string> = {
    blue: "text-blue-600",
    green: "text-green-600",
    amber: "text-amber-600",
    purple: "text-purple-600",
  }

  return (
    <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
      {priceItems.map((item) => (
        <div key={item.key} className="flex items-center space-x-2">
          <span className="dark:text-dark-text-primary text-sm text-gray-600">
            {item.label}
          </span>
          <span
            className={`text-sm ${
              isAvailableForUser
                ? availableToneClasses[item.tone]
                : "text-gray-500"
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
