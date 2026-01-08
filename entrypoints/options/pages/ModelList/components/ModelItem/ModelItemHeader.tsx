import {
  CommandLineIcon,
  DocumentDuplicateIcon,
  WrenchScrewdriverIcon,
} from "@heroicons/react/24/outline"
import React from "react"
import { useTranslation } from "react-i18next"

import { Badge, IconButton } from "~/components/ui"
import type { ModelPricing } from "~/services/apiService/common/type"
import { getBillingModeText } from "~/utils/modelPricing"
import { getProviderConfig } from "~/utils/modelProviders"

interface ModelItemHeaderProps {
  model: ModelPricing
  isAvailableForUser: boolean
  handleCopyModelName: () => void
  accountName?: string
  onVerifyApi?: () => void
  onVerifyCliSupport?: () => void
}

export const ModelItemHeader: React.FC<ModelItemHeaderProps> = ({
  model,
  isAvailableForUser,
  handleCopyModelName,
  accountName,
  onVerifyApi,
  onVerifyCliSupport,
}) => {
  const { t } = useTranslation("modelList")
  const providerConfig = getProviderConfig(model.model_name)
  const IconComponent = providerConfig.icon

  // 根据计费类型确定 Badge 变体
  const getBillingVariant = (quotaType: number) => {
    if (quotaType === 2) return "default" // 按次计费
    return "secondary" // 按量计费
  }

  return (
    <div className="min-w-0 flex-1">
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
            title={t("messages.modelNameCopied")}
            aria-label={t("messages.modelNameCopied")}
            className="shrink-0"
          >
            <DocumentDuplicateIcon className="h-3 w-3 sm:h-3.5 sm:w-3.5" />
          </IconButton>

          {onVerifyApi && (
            <IconButton
              variant="ghost"
              size="sm"
              onClick={onVerifyApi}
              title={t("actions.verifyApi")}
              aria-label={t("actions.verifyApi")}
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
              title={t("actions.verifyCliSupport")}
              aria-label={t("actions.verifyCliSupport")}
              className="shrink-0"
            >
              <CommandLineIcon className="h-3 w-3 text-sky-600 sm:h-3.5 sm:w-3.5 dark:text-sky-400" />
            </IconButton>
          )}
        </div>

        {/* 标签 */}
        <div className="flex shrink-0 flex-wrap items-center gap-1.5 sm:gap-2">
          {/* 计费模式标签 */}
          <Badge
            variant={getBillingVariant(model.quota_type)}
            size="sm"
            className="text-[10px] sm:text-xs"
          >
            {getBillingModeText(model.quota_type)}
          </Badge>

          {/* 可用状态标签 */}
          <Badge
            variant={isAvailableForUser ? "success" : "secondary"}
            size="sm"
            className="text-[10px] sm:text-xs"
          >
            {isAvailableForUser ? t("available") : t("unavailable")}
          </Badge>

          {/* 账号标签 */}
          {accountName && (
            <Badge variant="outline" size="default">
              {accountName}
            </Badge>
          )}
        </div>
      </div>
    </div>
  )
}
