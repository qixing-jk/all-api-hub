import { useState } from "react"
import toast from "react-hot-toast"
import { useTranslation } from "react-i18next"

import { Badge, Card, CardContent } from "~/components/ui"
import type {
  ModelManagementItemSource,
  ModelManagementSourceCapabilities,
} from "~/features/ModelList/modelManagementSources"
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
  showRealPrice: boolean
  showRatioColumn: boolean
  showEndpointTypes: boolean
  effectiveGroup?: string
  selectedGroups: string[]
  onGroupClick?: (group: string) => void
  availableGroups?: string[]
  isAllGroupsMode?: boolean
  showsOptimalGroup?: boolean
  source: ModelManagementItemSource
  displayCapabilities?: ModelManagementSourceCapabilities
  isLowestPrice?: boolean
  verificationSummary?: ApiVerificationHistorySummary | null
  onFilterAccount?: (accountId: string) => void
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
 *
 */
export default function ModelItem(props: ModelItemProps) {
  const {
    model,
    calculatedPrice,
    exchangeRate,
    showRealPrice,
    showRatioColumn,
    showEndpointTypes,
    effectiveGroup,
    selectedGroups,
    onGroupClick,
    availableGroups = [],
    showsOptimalGroup = false,
    source,
    displayCapabilities = source.capabilities,
    isLowestPrice = false,
    verificationSummary,
    onFilterAccount,
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
      : source.account.name
  const handleFilterAccount =
    source.kind === "account" && onFilterAccount
      ? () => onFilterAccount(source.account.id)
      : undefined

  const showPricing =
    source.kind === "account" && displayCapabilities.supportsPricing
  const showGroupDetails =
    source.kind === "account" && displayCapabilities.supportsGroupFiltering
  const canExpand = source.kind === "account" && showGroupDetails

  const activeGroups =
    selectedGroups.length > 0 ? selectedGroups : availableGroups
  const isAvailableForUser = showGroupDetails
    ? activeGroups.some((group) => model.enable_groups.includes(group))
    : true

  const sourceBadge = sourceLabel ? (
    handleFilterAccount ? (
      <Badge asChild variant="outline" size="default" className="max-w-full">
        <button
          type="button"
          onClick={handleFilterAccount}
          title={sourceLabel}
          aria-label={sourceLabel}
          className="max-w-full cursor-pointer hover:border-blue-300 hover:text-blue-700 dark:hover:border-blue-400 dark:hover:text-blue-300"
        >
          <span className="truncate">{sourceLabel}</span>
        </button>
      </Badge>
    ) : (
      <Badge variant="outline" size="default" className="max-w-full">
        <span className="truncate">{sourceLabel}</span>
      </Badge>
    )
  ) : null

  return (
    <Card
      variant="interactive"
      className={
        isAvailableForUser
          ? "hover:border-blue-300 dark:hover:border-blue-500/50"
          : "bg-gray-50 opacity-75 dark:bg-gray-800/50"
      }
    >
      <CardContent padding="default">
        <div className="flex min-w-0 flex-wrap items-start gap-2">
          <ModelItemHeader
            model={model}
            isAvailableForUser={isAvailableForUser}
            handleCopyModelName={handleCopyModelName}
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
          {(sourceBadge || canExpand) && (
            <div className="ml-auto flex max-w-full min-w-0 items-center gap-2 self-start">
              {sourceBadge}
              {canExpand && (
                <ModelItemExpandButton
                  isExpanded={isExpanded}
                  onToggleExpand={() => setIsExpanded(!isExpanded)}
                />
              )}
            </div>
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
          isLowestPrice={isLowestPrice}
          effectiveGroup={effectiveGroup}
          showsOptimalGroup={showsOptimalGroup}
        />

        {isExpanded && source.kind === "account" && (
          <div className="border-t pt-4 dark:border-gray-700">
            <ModelItemDetails
              model={model}
              calculatedPrice={calculatedPrice}
              showEndpointTypes={showEndpointTypes}
              effectiveGroup={effectiveGroup}
              showGroupDetails={showGroupDetails}
              showPricingDetails={showPricing}
              onGroupClick={onGroupClick}
            />
          </div>
        )}

        {!isAvailableForUser && showGroupDetails && (
          <div className="mt-3 rounded-lg border border-yellow-200 bg-yellow-50 p-3 dark:border-yellow-800 dark:bg-yellow-900/20">
            <div className="mb-2 flex items-center gap-2 text-sm text-yellow-700 dark:text-yellow-300">
              <Badge variant="warning" size="sm">
                {t("unavailable")}
              </Badge>
              <span>
                {t("clickSwitchGroup", {
                  group: effectiveGroup || selectedGroups[0] || "default",
                })}
              </span>
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
