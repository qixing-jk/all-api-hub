import {
  CurrencyDollarIcon,
  ServerIcon,
  TagIcon,
} from "@heroicons/react/24/outline"
import React from "react"
import { useTranslation } from "react-i18next"

import Tooltip from "~/components/Tooltip"
import { Badge } from "~/components/ui"
import type { ModelPricing } from "~/services/apiService/common/type"
import {
  formatPrice,
  getEndpointTypesText,
  isTokenBillingType,
  type CalculatedPrice,
} from "~/services/models/utils/modelPricing"

interface ModelItemDetailsProps {
  model: ModelPricing
  calculatedPrice: CalculatedPrice
  showEndpointTypes: boolean
  groupRatios: Record<string, number>
  effectiveGroup?: string
  showGroupDetails: boolean
  showPricingDetails: boolean
  onGroupClick?: (group: string) => void
}

export const ModelItemDetails: React.FC<ModelItemDetailsProps> = ({
  model,
  calculatedPrice,
  showEndpointTypes,
  groupRatios,
  effectiveGroup,
  showGroupDetails,
  showPricingDetails,
  onGroupClick,
}) => {
  const { t } = useTranslation("modelList")

  if (!showGroupDetails && !showEndpointTypes && !showPricingDetails) {
    return null
  }

  return (
    <>
      <div className="grid grid-cols-1 gap-4 text-sm md:grid-cols-2">
        {/* 可用分组 */}
        {showGroupDetails && (
          <div>
            <div className="mb-2 flex items-center space-x-2">
              <TagIcon className="dark:text-dark-text-tertiary h-4 w-4 text-gray-400" />
              <span className="dark:text-dark-text-secondary font-medium text-gray-700">
                {t("availableGroups")}
              </span>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {model.enable_groups.map((group, index) => {
                const isCurrentGroup = group === effectiveGroup
                const isClickable = onGroupClick && !isCurrentGroup
                const groupRatio = groupRatios[group] || 1
                const groupTooltipText = [
                  t("groupRatioTooltip", {
                    group,
                    ratio: groupRatio,
                  }),
                  isClickable ? t("clickSwitchGroup", { group }) : null,
                ]
                  .filter(Boolean)
                  .join("\n")

                return (
                  <Tooltip
                    key={index}
                    content={groupTooltipText}
                    className="whitespace-pre-line"
                    wrapperClassName="inline-flex justify-start"
                  >
                    <Badge
                      variant={isCurrentGroup ? "default" : "secondary"}
                      size="sm"
                      onClick={
                        isClickable ? () => onGroupClick(group) : undefined
                      }
                      className={
                        isClickable
                          ? "cursor-pointer transition-opacity hover:opacity-80"
                          : ""
                      }
                    >
                      {isCurrentGroup && <TagIcon className="h-3 w-3" />}
                      {group}
                    </Badge>
                  </Tooltip>
                )
              })}
            </div>
          </div>
        )}

        {/* 可用端点类型 */}
        {showEndpointTypes && (
          <div>
            <div className="mb-2 flex items-center space-x-2">
              <ServerIcon className="dark:text-dark-text-tertiary h-4 w-4 text-gray-400" />
              <span className="dark:text-dark-text-secondary font-medium text-gray-700">
                {t("endpointType")}
              </span>
            </div>
            <div className="dark:text-dark-text-secondary text-gray-600">
              {getEndpointTypesText(model.supported_endpoint_types)}
            </div>
          </div>
        )}

        {/* 详细定价信息（仅按量计费模型） */}
        {showPricingDetails && isTokenBillingType(model.quota_type) && (
          <div className="md:col-span-2">
            <div className="mb-2 flex items-center space-x-2">
              <CurrencyDollarIcon className="dark:text-dark-text-tertiary h-4 w-4 text-gray-400" />
              <span className="dark:text-dark-text-secondary font-medium text-gray-700">
                {t("detailedPricing")}
              </span>
            </div>
            <div className="grid grid-cols-2 gap-4 text-xs">
              <div className="space-y-1">
                <div className="dark:text-dark-text-tertiary text-gray-500">
                  {t("input1MTokens")}
                </div>
                <div className="dark:text-dark-text-primary font-medium text-gray-900">
                  USD: {formatPrice(calculatedPrice.inputUSD, "USD")}
                </div>
                <div className="dark:text-dark-text-primary font-medium text-gray-900">
                  CNY: {formatPrice(calculatedPrice.inputCNY, "CNY")}
                </div>
              </div>
              <div className="space-y-1">
                <div className="dark:text-dark-text-tertiary text-gray-500">
                  {t("output1MTokens")}
                </div>
                <div className="dark:text-dark-text-primary font-medium text-gray-900">
                  USD: {formatPrice(calculatedPrice.outputUSD, "USD")}
                </div>
                <div className="dark:text-dark-text-primary font-medium text-gray-900">
                  CNY: {formatPrice(calculatedPrice.outputCNY, "CNY")}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </>
  )
}
