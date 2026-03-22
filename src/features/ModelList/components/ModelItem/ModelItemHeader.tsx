import {
  CommandLineIcon,
  DocumentDuplicateIcon,
  KeyIcon,
  WrenchScrewdriverIcon,
} from "@heroicons/react/24/outline"
import React from "react"
import { useTranslation } from "react-i18next"

import { VerificationStatusBadge } from "~/components/dialogs/VerifyApiDialog/VerificationStatusBadge"
import { Badge, IconButton } from "~/components/ui"
import type { ModelPricing } from "~/services/apiService/common/type"
import { getBillingModeText } from "~/services/models/utils/modelPricing"
import { getProviderConfig } from "~/services/models/utils/modelProviders"
import type { ApiVerificationHistorySummary } from "~/services/verification/verificationResultHistory"
import { formatLocaleDateTime } from "~/utils/core/formatters"

interface ModelItemHeaderProps {
  model: ModelPricing
  isAvailableForUser: boolean
  handleCopyModelName: () => void
  sourceLabel?: string
  showPricingMetadata: boolean
  showAvailabilityBadge: boolean
  verificationSummary?: ApiVerificationHistorySummary | null
  onOpenKeyDialog?: () => void
  onVerifyApi?: () => void
  onVerifyCliSupport?: () => void
}

export const ModelItemHeader: React.FC<ModelItemHeaderProps> = ({
  model,
  isAvailableForUser,
  handleCopyModelName,
  sourceLabel,
  showPricingMetadata,
  showAvailabilityBadge,
  verificationSummary,
  onOpenKeyDialog,
  onVerifyApi,
  onVerifyCliSupport,
}) => {
  const { t } = useTranslation(["modelList", "aiApiVerification"])
  const providerConfig = getProviderConfig(model.model_name)
  const IconComponent = providerConfig.icon

  // 根据计费类型确定 Badge 变体
  const getBillingVariant = (quotaType: number) => {
    if (quotaType === 2) return "default" // 按次计费
    return "secondary" // 按量计费
  }

  return (
    <div className="min-w-0 flex-1 space-y-1.5">
      <div className="flex items-center gap-2 sm:gap-3">
        {/* 厂商图标 */}
        <div className={`shrink-0 rounded-lg p-1.5 ${providerConfig.bgColor}`}>
          <IconComponent
            className={`h-3.5 w-3.5 sm:h-4 sm:w-4 ${providerConfig.color}`}
          />
        </div>

        {/* 模型名称 */}
        <h3
          className={`truncate text-sm font-semibold sm:text-base md:text-lg ${
            isAvailableForUser
              ? "dark:text-dark-text-primary text-gray-900"
              : "dark:text-dark-text-tertiary text-gray-500"
          }`}
        >
          {model.model_name}
        </h3>

        <div className="flex items-center gap-1">
          {/* 复制按钮 */}
          <IconButton
            variant="ghost"
            size="sm"
            onClick={handleCopyModelName}
            title={t("modelList:actions.copyModelName")}
            aria-label={t("modelList:actions.copyModelName")}
            className="shrink-0"
          >
            <DocumentDuplicateIcon className="h-3 w-3 sm:h-3.5 sm:w-3.5" />
          </IconButton>

          {onOpenKeyDialog && (
            <IconButton
              variant="ghost"
              size="sm"
              onClick={onOpenKeyDialog}
              title={t("modelList:actions.keyForModel")}
              aria-label={t("modelList:actions.keyForModel")}
              className="shrink-0"
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
            >
              <CommandLineIcon className="h-3 w-3 text-sky-600 sm:h-3.5 sm:w-3.5 dark:text-sky-400" />
            </IconButton>
          )}
        </div>

        {/* 标签 */}
        <div className="flex shrink-0 flex-wrap items-center gap-1.5 sm:gap-2">
          {/* 计费模式标签 */}
          {showPricingMetadata && (
            <Badge
              variant={getBillingVariant(model.quota_type)}
              size="sm"
              className="text-[10px] sm:text-xs"
            >
              {getBillingModeText(model.quota_type)}
            </Badge>
          )}

          {/* 可用状态标签 */}
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

          {/* 账号标签 */}
          {sourceLabel && (
            <Badge variant="outline" size="default">
              {sourceLabel}
            </Badge>
          )}
        </div>
      </div>

      {onVerifyApi && (
        <div className="ml-8 flex flex-wrap items-center gap-2 text-[11px] sm:text-xs">
          <span className="dark:text-dark-text-tertiary text-gray-500">
            {t("aiApiVerification:verifyDialog.history.lastVerified")}
          </span>
          <VerificationStatusBadge
            status={verificationSummary?.status ?? "unverified"}
          />
          <span className="dark:text-dark-text-secondary text-gray-600">
            {verificationSummary
              ? formatLocaleDateTime(verificationSummary.verifiedAt)
              : t("aiApiVerification:verifyDialog.history.unverified")}
          </span>
        </div>
      )}
    </div>
  )
}
