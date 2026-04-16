import React from "react"
import { useTranslation } from "react-i18next"

import { Badge } from "~/components/ui"
import { formatGroupLabelFromRatios } from "~/features/ModelList/groupLabels"
import {
  MODEL_LIST_GROUP_SELECTION_SCOPES,
  type ModelListGroupSelectionScope,
} from "~/features/ModelList/groupSelectionScopes"
import type { ModelPricing } from "~/services/apiService/common/type"
import {
  formatPriceCompact,
  isTokenBillingType,
  type CalculatedPrice,
} from "~/services/models/utils/modelPricing"

import { ModelItemPerCallPricingView } from "./ModelItemPerCallPricingView"
import { PriceView } from "./ModelItemPicingView"

interface ModelItemPricingProps {
  model: ModelPricing
  calculatedPrice: CalculatedPrice
  exchangeRate: number
  showRealPrice: boolean
  showPricing: boolean
  showRatioColumn: boolean
  isAvailableForUser: boolean
  isLowestPrice?: boolean
  effectiveGroup?: string
  groupRatios: Record<string, number>
  showsOptimalGroup?: boolean
  groupSelectionScope?: ModelListGroupSelectionScope
}

export const ModelItemPricing: React.FC<ModelItemPricingProps> = ({
  model,
  calculatedPrice,
  exchangeRate,
  showRealPrice,
  showPricing,
  showRatioColumn,
  isAvailableForUser,
  isLowestPrice = false,
  effectiveGroup,
  groupRatios,
  showsOptimalGroup = false,
  groupSelectionScope = MODEL_LIST_GROUP_SELECTION_SCOPES.SINGLE_SOURCE,
}) => {
  const { t } = useTranslation("modelList")
  if (!showPricing) {
    return null
  }

  const tokenBillingType = isTokenBillingType(model.quota_type)
  const perCallPrice = calculatedPrice.perCallPrice
  const effectiveGroupLabel = effectiveGroup
    ? formatGroupLabelFromRatios(effectiveGroup, groupRatios)
    : undefined
  const shouldShowPriceMeta =
    effectiveGroup && (showsOptimalGroup || isLowestPrice)
  const priceMetaTitle = shouldShowPriceMeta
    ? isLowestPrice
      ? t(
          groupSelectionScope === MODEL_LIST_GROUP_SELECTION_SCOPES.ALL_ACCOUNTS
            ? "optimalGroupLowestPriceWithinAccountFilters"
            : "optimalGroupLowestPriceWithinBillingMode",
          {
            group: effectiveGroupLabel,
          },
        )
      : t(
          groupSelectionScope === MODEL_LIST_GROUP_SELECTION_SCOPES.ALL_ACCOUNTS
            ? "optimalGroupWithinAccountFilters"
            : "optimalGroupWithinSelectedGroups",
          {
            group: effectiveGroupLabel,
          },
        )
    : undefined
  const priceMeta = shouldShowPriceMeta ? (
    <Badge
      variant={isLowestPrice ? "success" : "secondary"}
      size="sm"
      className="shrink-0 text-[10px] sm:text-xs"
      title={priceMetaTitle}
    >
      {t("optimalGroup", { group: effectiveGroupLabel })}
    </Badge>
  ) : null

  return (
    <div className="mt-2">
      {tokenBillingType ? (
        <div className="flex flex-wrap items-center gap-3 sm:gap-4 md:gap-6">
          <PriceView
            calculatedPrice={calculatedPrice}
            showRealPrice={showRealPrice}
            tokenBillingType={tokenBillingType}
            isAvailableForUser={isAvailableForUser}
            formatPriceCompact={formatPriceCompact}
          />

          {(showRatioColumn || priceMeta) && (
            <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
              {showRatioColumn && (
                <>
                  <span className="dark:text-dark-text-tertiary text-xs whitespace-nowrap text-gray-500 sm:text-sm">
                    {t("ratio")}
                  </span>
                  <span
                    className={`text-xs font-medium sm:text-sm ${
                      isAvailableForUser
                        ? "dark:text-dark-text-primary text-gray-900"
                        : "dark:text-dark-text-tertiary text-gray-500"
                    }`}
                  >
                    {model.model_ratio}x
                  </span>
                </>
              )}
              {priceMeta}
            </div>
          )}
        </div>
      ) : (
        perCallPrice && (
          <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
            <span className="dark:text-dark-text-secondary text-xs whitespace-nowrap text-gray-600 sm:text-sm">
              {t("perCall")}
            </span>
            <ModelItemPerCallPricingView
              perCallPrice={perCallPrice}
              isAvailableForUser={isAvailableForUser}
              exchangeRate={exchangeRate}
              showRealPrice={showRealPrice}
              tokenBillingType={tokenBillingType}
            />
            {priceMeta}
          </div>
        )
      )}
    </div>
  )
}
