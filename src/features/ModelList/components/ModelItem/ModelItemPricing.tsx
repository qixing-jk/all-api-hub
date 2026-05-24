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

interface PriceMetaBadgeViewModel {
  kind: "optimal-group" | "lowest-price"
  variant: "success" | "secondary"
}

/**
 * Resolves which pricing metadata badge should be rendered for the model row.
 */
function resolvePriceMetaBadge(params: {
  effectiveGroup?: string
  isLowestPrice: boolean
  showsOptimalGroup: boolean
}): PriceMetaBadgeViewModel | null {
  const { effectiveGroup, isLowestPrice, showsOptimalGroup } = params

  if (effectiveGroup) {
    if (!showsOptimalGroup && !isLowestPrice) {
      return null
    }

    return {
      kind: "optimal-group",
      variant: isLowestPrice ? "success" : "secondary",
    }
  }

  if (!isLowestPrice) {
    return null
  }

  return {
    kind: "lowest-price",
    variant: "success",
  }
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
  const priceMetaBadge = resolvePriceMetaBadge({
    effectiveGroup,
    isLowestPrice,
    showsOptimalGroup,
  })
  const isAllAccountsGroupScope =
    groupSelectionScope === MODEL_LIST_GROUP_SELECTION_SCOPES.ALL_ACCOUNTS
  const priceMetaLabel =
    priceMetaBadge?.kind === "optimal-group"
      ? t("optimalGroup", { group: effectiveGroupLabel })
      : priceMetaBadge?.kind === "lowest-price"
        ? t("lowestPrice")
        : undefined
  const priceMetaTitle =
    priceMetaBadge?.kind === "optimal-group"
      ? isLowestPrice
        ? isAllAccountsGroupScope
          ? t("optimalGroupLowestPriceWithinAccountFilters", {
              group: effectiveGroupLabel,
            })
          : t("optimalGroupLowestPriceWithinBillingMode", {
              group: effectiveGroupLabel,
            })
        : isAllAccountsGroupScope
          ? t("optimalGroupWithinAccountFilters", {
              group: effectiveGroupLabel,
            })
          : t("optimalGroupWithinSelectedGroups", {
              group: effectiveGroupLabel,
            })
      : priceMetaBadge?.kind === "lowest-price"
        ? isAllAccountsGroupScope
          ? t("lowestPriceWithinAccountFilters")
          : t("lowestPriceWithinBillingMode")
        : undefined
  const priceMeta = priceMetaBadge ? (
    <Badge
      variant={priceMetaBadge.variant}
      size="sm"
      className="shrink-0 text-[10px] sm:text-xs"
      title={priceMetaTitle}
    >
      {priceMetaLabel}
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
