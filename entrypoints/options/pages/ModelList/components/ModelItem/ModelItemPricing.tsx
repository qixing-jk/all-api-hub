import React from "react"

import type { ModelPricing } from "~/services/apiService/common/type"
import {
  formatPriceCompact,
  isTokenBillingType,
  type CalculatedPrice
} from "~/utils/modelPricing"

import { ModelItemPerCallPricingView } from "./ModelItemPerCallPricingView"
import { PriceView } from "./ModelItemPicingView"

interface ModelItemPricingProps {
  model: ModelPricing
  calculatedPrice: CalculatedPrice
  exchangeRate: number
  showRealPrice: boolean
  showRatioColumn: boolean
  isAvailableForUser: boolean
}

export const ModelItemPricing: React.FC<ModelItemPricingProps> = ({
  model,
  calculatedPrice,
  exchangeRate,
  showRealPrice,
  showRatioColumn,
  isAvailableForUser
}) => {
  const tokenBillingType = isTokenBillingType(model.quota_type)
  const perCallPrice = calculatedPrice.perCallPrice
  return (
    <div className="mt-2">
      {tokenBillingType ? (
        // 按量计费 - 横向并排显示价格
        <div className="flex items-center gap-6">
          {/* 输入价格 */}
          <PriceView
            calculatedPrice={calculatedPrice}
            showRealPrice={showRealPrice}
            tokenBillingType={tokenBillingType}
            isAvailableForUser={isAvailableForUser}
            formatPriceCompact={formatPriceCompact}
          />

          {/* 倍率显示 */}
          {showRatioColumn && (
            <div className="flex items-center space-x-2">
              <span className="text-sm text-gray-500 dark:text-dark-text-tertiary">
                倍率:
              </span>
              <span
                className={`text-sm font-medium ${
                  isAvailableForUser
                    ? "text-gray-900 dark:text-dark-text-primary"
                    : "text-gray-500 dark:text-dark-text-tertiary"
                }`}>
                {model.model_ratio}x
              </span>
            </div>
          )}
        </div>
      ) : (
        perCallPrice && (
          // 按次计费
          <div className="flex items-center space-x-2">
            <span className="text-sm text-gray-600 dark:text-dark-text-secondary">
              每次调用:
            </span>
            <ModelItemPerCallPricingView
              perCallPrice={perCallPrice}
              isAvailableForUser={isAvailableForUser}
              exchangeRate={exchangeRate}
              showRealPrice={showRealPrice}
              tokenBillingType={tokenBillingType}
            />
          </div>
        )
      )}
    </div>
  )
}
