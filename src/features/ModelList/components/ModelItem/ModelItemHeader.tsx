import { Copy, KeyRound, Terminal, Wrench } from "lucide-react"
import React from "react"
import { useTranslation } from "react-i18next"

import { VerificationHistorySummary } from "~/components/dialogs/VerifyApiDialog/VerificationHistorySummary"
import { Badge, BadgeAdornment, IconButton } from "~/components/ui"
import { ProductAnalyticsScope } from "~/contexts/ProductAnalyticsScopeContext"
import { ModelVendorMark } from "~/features/ModelList/components/ModelVendorMark"
import type { ModelPricing } from "~/services/modelList/pricingModel"
import type { ResolvedModelVendor } from "~/services/models/modelMetadata/types"
import { getBillingModeText } from "~/services/models/utils/modelPricing"
import {
  PRODUCT_ANALYTICS_ACTION_IDS,
  PRODUCT_ANALYTICS_ENTRYPOINTS,
  PRODUCT_ANALYTICS_FEATURE_IDS,
  PRODUCT_ANALYTICS_SURFACE_IDS,
} from "~/services/productAnalytics/contracts"
import type { ApiVerificationHistorySummary } from "~/services/verification/verificationResultHistory"

import { MODEL_LIST_TEST_IDS } from "../../testIds"

interface ModelItemHeaderProps {
  model: ModelPricing
  resolvedVendor: ResolvedModelVendor
  isAvailableForUser: boolean
  handleCopyModelName: () => void
  showPricingMetadata: boolean
  groupSummary?: {
    label: string
    overflowCount?: number
    title: string
  }
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
  resolvedVendor,
  isAvailableForUser,
  handleCopyModelName,
  showPricingMetadata,
  groupSummary,
  verificationSummary,
  onOpenKeyDialog,
  onVerifyApi,
  onVerifyCliSupport,
  trailingContent,
}) => {
  const { t } = useTranslation(["modelList", "aiApiVerification"])
  const displayName = model.display_name?.trim() || model.model_name
  const showRequestModelId = displayName !== model.model_name

  const getBillingVariant = (quotaType: number) => {
    if (quotaType === 2) return "default"
    return "secondary"
  }

  return (
    <div className="space-y-density-1-5 min-w-0 flex-1">
      <div className="gap-y-density-2 sm:gap-y-density-3 flex min-w-0 flex-wrap items-center gap-x-2 sm:gap-x-3">
        <div className="gap-y-density-2 sm:gap-y-density-3 flex min-w-0 flex-[1_1_10rem] items-center gap-x-2 sm:gap-x-3">
          <ModelVendorMark vendor={resolvedVendor} variant="badge" />

          <div className="min-w-0 flex-1">
            <h3
              className={`min-w-0 flex-1 truncate text-sm font-semibold sm:text-base md:text-lg ${
                isAvailableForUser ? "text-foreground" : "text-muted-foreground"
              }`}
            >
              {displayName}
            </h3>
            {showRequestModelId ? (
              <p
                className="text-muted-foreground text-2xs mt-0.5 truncate font-mono sm:text-xs"
                title={model.model_name}
              >
                {model.model_name}
              </p>
            ) : null}
          </div>
        </div>

        <ProductAnalyticsScope
          entrypoint={optionsEntrypoint}
          featureId={PRODUCT_ANALYTICS_FEATURE_IDS.ModelList}
          surfaceId={rowActionsSurface}
        >
          <div className="gap-y-density-1 ml-8 flex shrink-0 items-center gap-x-1 sm:ml-0">
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
                data-testid={MODEL_LIST_TEST_IDS.modelKeyDialogButton}
                className="shrink-0"
                analyticsAction={
                  PRODUCT_ANALYTICS_ACTION_IDS.OpenModelKeyDialog
                }
              >
                <KeyRound className="text-theme-600 dark:text-theme-400 h-3 w-3 sm:h-3.5 sm:w-3.5" />
              </IconButton>
            )}

            {onVerifyApi && (
              <IconButton
                variant="ghost"
                size="sm"
                onClick={onVerifyApi}
                title={t("modelList:actions.verifyApi")}
                aria-label={t("modelList:actions.verifyApi")}
                data-testid={MODEL_LIST_TEST_IDS.verifyApiButton}
                className="shrink-0"
                analyticsAction={PRODUCT_ANALYTICS_ACTION_IDS.VerifyModelApi}
              >
                <Wrench className="text-link h-3 w-3 sm:h-3.5 sm:w-3.5" />
              </IconButton>
            )}

            {onVerifyCliSupport && (
              <IconButton
                variant="ghost"
                size="sm"
                onClick={onVerifyCliSupport}
                title={t("modelList:actions.verifyCliSupport")}
                aria-label={t("modelList:actions.verifyCliSupport")}
                data-testid={MODEL_LIST_TEST_IDS.verifyCliSupportButton}
                className="shrink-0"
                analyticsAction={
                  PRODUCT_ANALYTICS_ACTION_IDS.VerifyModelCliSupport
                }
              >
                <Terminal className="text-link h-3 w-3 sm:h-3.5 sm:w-3.5" />
              </IconButton>
            )}
          </div>
        </ProductAnalyticsScope>

        <div className="gap-y-density-1-5 sm:gap-y-density-2 flex shrink-0 flex-wrap items-center gap-x-1.5 sm:gap-x-2">
          {showPricingMetadata && (
            <Badge
              variant={getBillingVariant(model.quota_type)}
              size="sm"
              className="text-3xs sm:text-xs"
            >
              {getBillingModeText(model.quota_type)}
            </Badge>
          )}

          {groupSummary && (
            <Badge
              variant="secondary"
              size="sm"
              className="text-3xs max-w-[9rem] min-w-0 sm:text-xs"
              title={groupSummary.title}
              aria-label={groupSummary.title}
            >
              <span className="min-w-0 truncate">{groupSummary.label}</span>
              {typeof groupSummary.overflowCount === "number" && (
                <BadgeAdornment aria-hidden="true">
                  +{groupSummary.overflowCount}
                </BadgeAdornment>
              )}
            </Badge>
          )}
        </div>

        {trailingContent ? (
          <div className="gap-y-density-2 flex min-w-0 flex-wrap items-center gap-x-2 sm:ml-auto">
            {trailingContent}
          </div>
        ) : null}
      </div>

      {onVerifyApi && (
        <VerificationHistorySummary
          summary={verificationSummary}
          className="gap-y-density-1-5 sm:gap-y-density-2 ml-8 flex min-w-0 flex-wrap items-center gap-x-1.5 sm:gap-x-2"
        />
      )}
    </div>
  )
}
