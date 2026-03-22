import { useState } from "react"
import toast from "react-hot-toast"
import { useTranslation } from "react-i18next"

import { Badge, Card, CardContent } from "~/components/ui"
import type { ModelManagementItemSource } from "~/features/ModelList/modelManagementSources"
import type { ModelPricing } from "~/services/apiService/common/type"
import type { CalculatedPrice } from "~/services/models/utils/modelPricing"
import type { ApiVerificationHistorySummary } from "~/services/verification/verificationResultHistory"
import { tryParseUrl } from "~/utils/core/urlParsing"

import { ModelItemDescription } from "./ModelItemDescription"
import { ModelItemDetails } from "./ModelItemDetails"
import { ModelItemExpandButton } from "./ModelItemExpandButton"
import { ModelItemHeader } from "./ModelItemHeader"
import { ModelItemPricing } from "./ModelItemPricing"

interface ModelItemProps {
  model: ModelPricing
  calculatedPrice: CalculatedPrice
  exchangeRate: number
  showRealPrice: boolean // 是否以真实充值金额展示
  showRatioColumn: boolean // 是否显示倍率列
  showEndpointTypes: boolean // 是否显示可用端点类型
  userGroup: string
  onGroupClick?: (group: string) => void // 新增：点击分组时的回调函数
  availableGroups?: string[] // 新增：用户的所有可用分组列表
  isAllGroupsMode?: boolean // 新增：是否为"所有分组"模式
  source: ModelManagementItemSource
  verificationSummary?: ApiVerificationHistorySummary | null
  onVerifyModel?: (source: ModelManagementItemSource, modelId: string) => void
  onVerifyCliSupport?: (
    source: ModelManagementItemSource,
    modelId: string,
  ) => void
  onOpenModelKeyDialog?: (
    account: Extract<ModelManagementItemSource, { kind: "account" }>["account"],
    modelId: string,
    modelEnableGroups: string[],
  ) => void
}

/**
 * Detailed model card combining header, pricing, and expandable metadata.
 * @param props Component props describing the model card configuration.
 * @returns Rendered model card element.
 */
export default function ModelItem(props: ModelItemProps) {
  const {
    model,
    calculatedPrice,
    exchangeRate,
    showRealPrice,
    showRatioColumn,
    showEndpointTypes,
    userGroup,
    onGroupClick,
    availableGroups = [],
    isAllGroupsMode = false,
    source,
    verificationSummary,
    onVerifyModel,
    onVerifyCliSupport,
    onOpenModelKeyDialog,
  } = props
  const { t } = useTranslation("modelList")
  const [isExpanded, setIsExpanded] = useState(false)
  const handleCopyModelName = async () => {
    try {
      await navigator.clipboard.writeText(model.model_name)
      toast.success(t("messages.modelNameCopied"))
    } catch {
      toast.error(t("messages.copyFailed"))
    }
  }

  // 账号来源信息（若为 profile，则展示 profile 标识）
  const profileBaseUrl =
    source.kind === "profile" ? source.profile.baseUrl.trim() : ""
  const profileHost =
    source.kind === "profile"
      ? tryParseUrl(source.profile.baseUrl)?.host || profileBaseUrl || undefined
      : undefined
  const sourceLabel =
    source.kind === "profile"
      ? t("sourceLabels.profileBadge", {
          name: source.profile.name,
          host: profileHost,
        })
      : undefined

  // profile 来源不展示价格/组别等仅账号语义的元信息
  const showPricing = source.kind === "account" && showRealPrice !== undefined
  const showGroupDetails = source.kind === "account"
  const canExpand = source.kind === "account"

  // 检查模型是否对当前用户分组可用
  const isAvailableForUser = showGroupDetails
    ? isAllGroupsMode
      ? availableGroups.some((group) => model.enable_groups.includes(group)) // 所有分组模式：任何一个用户分组可用即可
      : model.enable_groups.includes(userGroup) // 特定分组模式：必须该分组可用
    : true

  return (
    <Card
      variant="interactive"
      className={
        isAvailableForUser
          ? "hover:border-blue-300 dark:hover:border-blue-500/50"
          : "bg-gray-50 opacity-75 dark:bg-gray-800/50"
      }
    >
      {/* 主要信息行 */}
      <CardContent padding="default">
        <div className="flex min-w-0 items-start gap-2">
          <ModelItemHeader
            model={model}
            isAvailableForUser={isAvailableForUser}
            handleCopyModelName={handleCopyModelName}
            sourceLabel={sourceLabel}
            showPricingMetadata={showPricing}
            showAvailabilityBadge={showGroupDetails}
            verificationSummary={verificationSummary}
            onOpenKeyDialog={
              source.kind === "account" &&
              source.capabilities.supportsTokenCompatibility &&
              onOpenModelKeyDialog
                ? () =>
                    onOpenModelKeyDialog(
                      source.account,
                      model.model_name,
                      model.enable_groups,
                    )
                : undefined
            }
            onVerifyApi={
              source.capabilities.supportsCredentialVerification &&
              onVerifyModel
                ? () => onVerifyModel(source, model.model_name)
                : undefined
            }
            onVerifyCliSupport={
              source.capabilities.supportsCliVerification && onVerifyCliSupport
                ? () => onVerifyCliSupport(source, model.model_name)
                : undefined
            }
          />
          {canExpand && (
            <ModelItemExpandButton
              isExpanded={isExpanded}
              onToggleExpand={() => setIsExpanded(!isExpanded)}
            />
          )}
        </div>
        <ModelItemDescription
          model={model}
          isAvailableForUser={isAvailableForUser}
        />
        <ModelItemPricing
          model={model}
          calculatedPrice={calculatedPrice}
          exchangeRate={exchangeRate}
          showRealPrice={showRealPrice}
          showPricing={showPricing}
          showRatioColumn={showRatioColumn}
          isAvailableForUser={isAvailableForUser}
        />

        {/* 折叠展开的详细信息 */}
        {isExpanded && source.kind === "account" && (
          <div className="border-t pt-4 dark:border-gray-700">
            <ModelItemDetails
              model={model}
              calculatedPrice={calculatedPrice}
              showEndpointTypes={showEndpointTypes}
              userGroup={userGroup}
              showGroupDetails={showGroupDetails}
              showPricingDetails={showPricing}
              onGroupClick={onGroupClick}
            />
          </div>
        )}

        {/* 不可用时的提示 */}
        {!isAvailableForUser && showGroupDetails && (
          <div className="mt-3 rounded-lg border border-yellow-200 bg-yellow-50 p-3 dark:border-yellow-800 dark:bg-yellow-900/20">
            <div className="mb-2 flex items-center gap-2 text-sm text-yellow-700 dark:text-yellow-300">
              <Badge variant="warning" size="sm">
                {t("unavailable")}
              </Badge>
              <span>{t("clickSwitchGroup", { group: userGroup })}</span>
            </div>
            <div className="text-sm text-yellow-600 dark:text-yellow-400">
              {t("availableGroups")}: {model.enable_groups.join(", ")}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
