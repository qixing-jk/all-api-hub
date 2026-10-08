import { PriceView } from "~/features/ModelList/presentation/ModelItem/ModelItemPicingView"
import type { PerCallPrice } from "~/services/modelList/pricingModel"
import {
  formatPriceCompact,
  resolvePriceAmount,
} from "~/services/models/utils/modelPricing"

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
          isAvailableForUser ? "text-pricing-per-call" : "text-muted-foreground"
        }`}
      >
        {showRealPrice
          ? formatPriceCompact(
              resolvePriceAmount(perCallPrice, "CNY", exchangeRate),
              "CNY",
            )
          : formatPriceCompact(perCallPrice, "USD")}
      </span>
    )
  } else {
    return (
      <PriceView
        prices={perCallPrice}
        exchangeRate={exchangeRate}
        showRealPrice={showRealPrice}
        tokenBillingType={tokenBillingType}
        isAvailableForUser={isAvailableForUser}
        formatPriceCompact={formatPriceCompact}
      />
    )
  }
}
