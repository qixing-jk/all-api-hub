import { formatPriceCompact, PerCallPrice } from "~/utils/modelPricing"

import { PriceView } from "./ModelItemPicingView"

interface ModelItemPerCallPricingViewProps {
  perCallPrice: PerCallPrice
  isAvailableForUser: boolean
  exchangeRate: number
  showRealPrice: boolean
  tokenBillingType: boolean
}

export const ModelItemPerCallPricingView = ({
  perCallPrice,
  isAvailableForUser,
  exchangeRate,
  showRealPrice,
  tokenBillingType,
}: ModelItemPerCallPricingViewProps) => {
  if (typeof perCallPrice === "number") {
    return (
      <span
        className={`text-sm ${
          isAvailableForUser ? "text-purple-600" : "text-gray-500"
        }`}
      >
        {showRealPrice
          ? formatPriceCompact((perCallPrice || 0) * exchangeRate, "CNY")
          : formatPriceCompact(perCallPrice || 0, "USD")}
      </span>
    )
  } else {
    const calculatedPrice: CalculatedPrice = {
      inputUSD: perCallPrice.input,
      inputCNY: perCallPrice.input * exchangeRate,
      outputUSD: perCallPrice.output,
      outputCNY: perCallPrice.output * exchangeRate,
      perCallPrice: 0,
    }
    return (
      <PriceView
        calculatedPrice={calculatedPrice}
        showRealPrice={showRealPrice}
        tokenBillingType={tokenBillingType}
        isAvailableForUser={isAvailableForUser}
        formatPriceCompact={formatPriceCompact}
      />
    )
  }
}
