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
  let inputPrice = formatPriceCompact(
    resolvePriceAmount(usdPrices.input, currency, exchangeRate),
    currency,
  )
  let outputPrice = formatPriceCompact(
    resolvePriceAmount(usdPrices.output, currency, exchangeRate),
    currency,
  )

  if (tokenBillingType) {
    inputPrice += "/M"
    outputPrice += "/M"
  }

  return (
    <div className="flex items-center gap-6">
      {/* 输入价格 */}
      <div className="flex items-center space-x-2">
        <span className="dark:text-dark-text-primary text-sm text-gray-600">
          {t("input")}
        </span>
        <span
          className={`text-sm ${
            isAvailableForUser ? "text-blue-600" : "text-gray-500"
          }`}
        >
          {inputPrice}
        </span>
      </div>

      {/* 输出价格 */}
      <div className="flex items-center space-x-2">
        <span className="dark:text-dark-text-primary text-sm text-gray-600">
          {t("output")}
        </span>
        <span
          className={`text-sm ${
            isAvailableForUser ? "text-green-600" : "text-gray-500"
          }`}
        >
          {outputPrice}
        </span>
      </div>
    </div>
  )
}
