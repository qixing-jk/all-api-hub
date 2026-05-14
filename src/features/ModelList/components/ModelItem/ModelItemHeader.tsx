import {
  CommandLineIcon,
  KeyIcon,
  WrenchScrewdriverIcon,
} from "@heroicons/react/24/outline"
import { Copy } from "lucide-react"
import React from "react"
import { useTranslation } from "react-i18next"

import { VerificationHistorySummary } from "~/components/dialogs/VerifyApiDialog/VerificationHistorySummary"
import { Badge, IconButton } from "~/components/ui"
import { ProductAnalyticsScope } from "~/contexts/ProductAnalyticsScopeContext"
import type { ModelPricing } from "~/services/apiService/common/type"
import { getBillingModeText } from "~/services/models/utils/modelPricing"
import { getProviderConfig } from "~/services/models/utils/modelProviders"
import {
  PRODUCT_ANALYTICS_ACTION_IDS,
  PRODUCT_ANALYTICS_ENTRYPOINTS,
  PRODUCT_ANALYTICS_FEATURE_IDS,
  PRODUCT_ANALYTICS_SURFACE_IDS,
} from "~/services/productAnalytics/events"
import type { ApiVerificationHistorySummary } from "~/services/verification/verificationResultHistory"

interface ModelItemHeaderProps {
  model: ModelPricing
  isAvailableForUser: boolean
  handleCopyModelName: () => void
  showPricingMetadata: boolean
  showAvailabilityBadge: boolean
  verificationSummary?: ApiVerificationHistorySummary | null
  onOpenKeyDialog?: () => void
  onVerifyApi?: () => void
  onVerifyCliSupport?: () => void
  trailingContent?: React.ReactNode
}

const optionsEntrypoint = PRODUCT_ANALYTICS_ENTRYPOINTS.Options
const rowActionsSurface =
  PRODUCT_ANALYTICS_SURFACE_IDS.OptionsModelListRowActions

export const ModelItemHeader: React.FC<ModelItemHeaderProps> = ({
  model,
  isAvailableForUser,
  handleCopyModelName,
  showPricingMetadata,
  showAvailabilityBadge,
  verificationSummary,
  onOpenKeyDialog,
  onVerifyApi,
  onVerifyCliSupport,
  trailingContent,
}) => {
  const { t } = useTranslation(["modelList", "aiApiVerification"])
  const providerConfig = getProviderConfig(model.model_name)
  const IconComponent = providerConfig.icon

  const getBillingVariant = (quotaType: number) => {
    if (quotaType === 2) return "default"
    return "secondary"
  }

  return (
    <div className="min-w-0 flex-1 space-y-1.5">
      <div className="flex min-w-0 flex-wrap items-center gap-2 sm:gap-3">
        <div className="flex min-w-0 flex-[1_1_10rem] items-center gap-2 sm:gap-3">
          <div
            className={`shrink-0 rounded-lg p-1.5 ${providerConfig.bgColor}`}
          >
            <IconComponent
              className={`h-3.5 w-3.5 sm:h-4 sm:w-4 ${providerConfig.color}`}
            />
          </div>

          <h3
            className={`min-w-0 flex-1 truncate text-sm font-semibold sm:text-base md:text-lg ${
              isAvailableForUser
                ? "dark:text-dark-text-primary text-gray-900"
                : "dark:text-dark-text-tertiary text-gray-500"
            }`}
          >
            {model.model_name}
          </h3>
        </div>

        <ProductAnalyticsScope
          entrypoint={optionsEntrypoint}
          featureId={PRODUCT_ANALYTICS_FEATURE_IDS.ModelList}
          surfaceId={rowActionsSurface}
        >
          <div className="ml-8 flex shrink-0 items-center gap-1 sm:ml-0">
            <IconButton
              variant="ghost"
              size="sm"
              onClick={handleCopyModelName}
              title={t("modelList:actions.copyModelName")}
              aria-label={t("modelList:actions.copyModelName")}
              className="shrink-0"
              analyticsAction={PRODUCT_ANALYTICS_ACTION_IDS.CopyModelName}
            >
              <Copy className="h-3 w-3 sm:h-3.5 sm:w-3.5" />
            </IconButton>

            {onOpenKeyDialog && (
              <IconButton
                variant="ghost"
                size="sm"
                onClick={onOpenKeyDialog}
                title={t("modelList:actions.keyForModel")}
                aria-label={t("modelList:actions.keyForModel")}
                className="shrink-0"
                analyticsAction={
                  PRODUCT_ANALYTICS_ACTION_IDS.OpenModelKeyDialog
                }
              >
                <KeyIcon className="h-3 w-3 text-violet-600 sm:h-3.5 sm:w-3.5 dark:text-violet-400" />
              </IconButton>
            )}

            {onVerifyApi && (
              <IconButton
                variant="ghost"
                size="sm"
                onClick={onVerifyApi}
                title={t("modelList:actions.verifyApi")}
                aria-label={t("modelList:actions.verifyApi")}
                className="shrink-0"
                analyticsAction={PRODUCT_ANALYTICS_ACTION_IDS.VerifyModelApi}
              >
                <WrenchScrewdriverIcon className="h-3 w-3 text-emerald-600 sm:h-3.5 sm:w-3.5 dark:text-emerald-400" />
              </IconButton>
            )}

            {onVerifyCliSupport && (
              <IconButton
                variant="ghost"
                size="sm"
                onClick={onVerifyCliSupport}
                title={t("modelList:actions.verifyCliSupport")}
                aria-label={t("modelList:actions.verifyCliSupport")}
                className="shrink-0"
                analyticsAction={
                  PRODUCT_ANALYTICS_ACTION_IDS.VerifyModelCliSupport
                }
              >
                <CommandLineIcon className="h-3 w-3 text-sky-600 sm:h-3.5 sm:w-3.5 dark:text-sky-400" />
              </IconButton>
            )}
          </div>
        </ProductAnalyticsScope>

        <div className="flex shrink-0 flex-wrap items-center gap-1.5 sm:gap-2">
          {showPricingMetadata && (
            <Badge
              variant={getBillingVariant(model.quota_type)}
              size="sm"
              className="text-[10px] sm:text-xs"
            >
              {getBillingModeText(model.quota_type)}
            </Badge>
          )}

          {showAvailabilityBadge && (
            <Badge
              variant={isAvailableForUser ? "success" : "secondary"}
              size="sm"
              className="text-[10px] sm:text-xs"
            >
              {isAvailableForUser
                ? t("modelList:available")
                : t("modelList:unavailable")}
            </Badge>
          )}
        </div>

        {trailingContent ? (
          <div className="flex min-w-0 flex-wrap items-center gap-2 sm:ml-auto">
            {trailingContent}
          </div>
        ) : null}
      </div>

      {onVerifyApi && (
        <VerificationHistorySummary
          summary={verificationSummary}
          className="ml-8 flex min-w-0 flex-wrap items-center gap-1.5 sm:gap-2"
        />
      )}
    </div>
  )
}
