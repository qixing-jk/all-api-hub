import { useState } from "react"
import toast from "react-hot-toast"
import { useTranslation } from "react-i18next"

import { Card, CardContent } from "~/components/ui"
import type { ModelPricing } from "~/services/apiService/common/type"
import type { DisplaySiteData } from "~/types"
import type { CalculatedPrice } from "~/utils/modelPricing"

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
  account?: DisplaySiteData
  accountName?: string
  onVerifyModel?: (account: DisplaySiteData, modelId: string) => void
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
    account,
    accountName,
    onVerifyModel,
  } = props
  const { t } = useTranslation("modelList")
  const [isExpanded, setIsExpanded] = useState(false)
  const handleCopyModelName = async () => {
    try {
      await navigator.clipboard.writeText(model.model_name)
      toast.success(t("messages.modelNameCopied"))
    } catch (error) {
      toast.error(t("messages.copyFailed"))
      console.error(error)
    }
  }

  // 检查模型是否对当前用户分组可用
  const isAvailableForUser = isAllGroupsMode
    ? availableGroups.some((group) => model.enable_groups.includes(group)) // 所有分组模式：任何一个用户分组可用即可
    : model.enable_groups.includes(userGroup) // 特定分组模式：必须该分组可用

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
            accountName={accountName}
            onVerifyApi={
              account && onVerifyModel
                ? () => onVerifyModel(account, model.model_name)
                : undefined
            }
          />
          <ModelItemExpandButton
            isExpanded={isExpanded}
            onToggleExpand={() => setIsExpanded(!isExpanded)}
          />
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
          showRatioColumn={showRatioColumn}
          isAvailableForUser={isAvailableForUser}
        />

        {/* 展开的详细信息 */}
        {isExpanded && (
          <ModelItemDetails
            model={model}
            calculatedPrice={calculatedPrice}
            showEndpointTypes={showEndpointTypes}
            userGroup={userGroup}
            onGroupClick={onGroupClick}
          />
        )}
      </CardContent>
    </Card>
  )
}
