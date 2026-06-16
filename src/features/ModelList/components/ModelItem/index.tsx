import { Copy, ExternalLink } from "lucide-react"
import { useEffect, useState } from "react"
import toast from "react-hot-toast"
import { useTranslation } from "react-i18next"

import { Badge, Card, CardContent, IconButton } from "~/components/ui"
import {
  MODEL_LIST_GROUP_SELECTION_SCOPES,
  type ModelListGroupSelectionScope,
} from "~/features/ModelList/groupSelectionScopes"
import type {
  ModelListSourceIdentity,
  ModelManagementItemSource,
  ModelManagementSourceCapabilities,
} from "~/features/ModelList/modelManagementSources"
import { MODEL_MANAGEMENT_SOURCE_KINDS } from "~/features/ModelList/modelManagementSources"
import { formatModelListSourceLabel } from "~/features/ModelList/sourceLabels"
import {
  isModelPriceUnavailable,
  type ModelPricing,
} from "~/services/apiService/common/type"
import { DEFAULT_MODEL_GROUP } from "~/services/models/constants"
import type { CalculatedPrice } from "~/services/models/utils/modelPricing"
import {
  PRODUCT_ANALYTICS_ACTION_IDS,
  PRODUCT_ANALYTICS_ENTRYPOINTS,
  PRODUCT_ANALYTICS_FEATURE_IDS,
  PRODUCT_ANALYTICS_SURFACE_IDS,
} from "~/services/productAnalytics/events"
import type { ApiVerificationHistorySummary } from "~/services/verification/verificationResultHistory"
import { createTab } from "~/utils/browser/browserApi"
import { isProdBuild } from "~/utils/core/environment"
import { createLogger } from "~/utils/core/logger"
import { tryParseUrl } from "~/utils/core/urlParsing"

import { formatGroupLabelFromRatios } from "../../groupLabels"
import { ModelItemDescription } from "./ModelItemDescription"
import { ModelItemDetails } from "./ModelItemDetails"
import { ModelItemExpandButton } from "./ModelItemExpandButton"
import { ModelItemHeader } from "./ModelItemHeader"
import { ModelItemPricing } from "./ModelItemPricing"

const logger = createLogger("ModelItem")

interface ModelItemProps {
  model: ModelPricing
  calculatedPrice: CalculatedPrice
  exchangeRate: number
  showRealPrice: boolean
  showRatioColumn: boolean
  showEndpointTypes: boolean
  groupRatios: Record<string, number>
  effectiveGroup?: string
  selectedGroups: string[]
  onGroupClick?: (group: string) => void
  availableGroups?: string[]
  isAllGroupsMode?: boolean
  showsOptimalGroup?: boolean
  groupSelectionScope?: ModelListGroupSelectionScope
  isGroupSelectionInteractive?: boolean
  source: ModelManagementItemSource
  sourceIdentity?: ModelListSourceIdentity
  displayCapabilities?: ModelManagementSourceCapabilities
  isLowestPrice?: boolean
  verificationSummary?: ApiVerificationHistorySummary | null
  onFilterAccount?: (accountId: string) => void
  onVerifyModel?: (
    source: ModelManagementItemSource,
    modelId: string,
    modelEnableGroups?: string[],
  ) => void
  onVerifyCliSupport?: (
    source: ModelManagementItemSource,
    modelId: string,
  ) => void
  onOpenModelKeyDialog?: (
    account: Extract<
      ModelManagementItemSource,
      { kind: typeof MODEL_MANAGEMENT_SOURCE_KINDS.ACCOUNT }
    >["account"],
    modelId: string,
    modelEnableGroups?: string[],
  ) => void
  isExpanded?: boolean
  onToggleExpand?: () => void
}

/**
 * Renders a single model row with pricing, availability, and expandable details.
 */
export default function ModelItem(props: ModelItemProps) {
  const {
    model,
    calculatedPrice,
    exchangeRate,
    showRealPrice,
    showRatioColumn,
    showEndpointTypes,
    groupRatios,
    effectiveGroup,
    selectedGroups,
    onGroupClick,
    availableGroups = [],
    showsOptimalGroup = false,
    groupSelectionScope = MODEL_LIST_GROUP_SELECTION_SCOPES.SINGLE_SOURCE,
    isGroupSelectionInteractive = true,
    source,
    sourceIdentity,
    displayCapabilities = source.capabilities,
    isLowestPrice = false,
    verificationSummary,
    onFilterAccount,
    onVerifyModel,
    onVerifyCliSupport,
    onOpenModelKeyDialog,
    isExpanded: controlledIsExpanded,
    onToggleExpand,
  } = props
  const { t } = useTranslation("modelList")
  const [uncontrolledIsExpanded, setUncontrolledIsExpanded] = useState(false)
  const isExpansionControlled =
    controlledIsExpanded !== undefined && onToggleExpand !== undefined
  const hasExpansionPropMismatch =
    (controlledIsExpanded !== undefined) !== (onToggleExpand !== undefined)
  const isExpanded = isExpansionControlled
    ? controlledIsExpanded
    : uncontrolledIsExpanded

  useEffect(() => {
    if (!hasExpansionPropMismatch || isProdBuild()) {
      return
    }

    logger.warn(
      "ModelItem expects isExpanded and onToggleExpand to be provided together. Falling back to uncontrolled expansion state.",
      {
        controlledIsExpandedProvided: controlledIsExpanded !== undefined,
        onToggleExpandProvided: onToggleExpand !== undefined,
      },
    )
  }, [controlledIsExpanded, hasExpansionPropMismatch, onToggleExpand])

  const handleToggleExpand = () => {
    if (isExpansionControlled) {
      onToggleExpand()
      return
    }

    setUncontrolledIsExpanded((current) => !current)
  }

  const handleCopyModelName = async () => {
    try {
      await navigator.clipboard.writeText(model.model_name)
      toast.success(t("messages.modelNameCopied"))
    } catch {
      toast.error(t("messages.copyFailed"))
    }
  }

  const sourceBaseUrl =
    source.kind === MODEL_MANAGEMENT_SOURCE_KINDS.ACCOUNT
      ? source.account.baseUrl?.trim()
      : source.profile.baseUrl.trim()
  const canUseSourceUrl = Boolean(sourceBaseUrl)
  const parsedSourceUrl = tryParseUrl(sourceBaseUrl)
  const canOpenSourceUrl =
    parsedSourceUrl?.protocol === "http:" ||
    parsedSourceUrl?.protocol === "https:"

  const handleCopySourceUrl = async () => {
    if (!sourceBaseUrl) return

    try {
      await navigator.clipboard.writeText(sourceBaseUrl)
      toast.success(t("messages.siteUrlCopied"))
    } catch {
      toast.error(t("messages.copyFailed"))
    }
  }

  const handleOpenSourceUrl = () => {
    if (!canOpenSourceUrl || !parsedSourceUrl) return

    void createTab(parsedSourceUrl.toString(), true)
  }

  const sourceLabel = formatModelListSourceLabel(
    source,
    {
      formatProfileLabel: ({ name, host }) =>
        t("sourceLabels.profileBadge", { name, host }),
    },
    sourceIdentity,
  )
  const handleFilterAccount =
    source.kind === MODEL_MANAGEMENT_SOURCE_KINDS.ACCOUNT && onFilterAccount
      ? () => onFilterAccount(source.account.id)
      : undefined

  const effectiveCapabilities: ModelManagementSourceCapabilities = {
    supportsPricing:
      source.capabilities.supportsPricing &&
      displayCapabilities.supportsPricing,
    supportsRatioDisplay:
      source.capabilities.supportsRatioDisplay &&
      displayCapabilities.supportsRatioDisplay,
    supportsGroupFiltering:
      source.capabilities.supportsGroupFiltering &&
      displayCapabilities.supportsGroupFiltering,
    supportsAccountSummary:
      source.capabilities.supportsAccountSummary &&
      displayCapabilities.supportsAccountSummary,
    supportsTokenCompatibility: source.capabilities.supportsTokenCompatibility,
    supportsCredentialVerification:
      source.capabilities.supportsCredentialVerification,
    supportsBatchCredentialVerification:
      source.capabilities.supportsBatchCredentialVerification,
    supportsCliVerification: source.capabilities.supportsCliVerification,
  }

  const showPricing =
    source.kind === MODEL_MANAGEMENT_SOURCE_KINDS.ACCOUNT &&
    effectiveCapabilities.supportsPricing
  const showGroupDetails =
    source.kind === MODEL_MANAGEMENT_SOURCE_KINDS.ACCOUNT &&
    effectiveCapabilities.supportsGroupFiltering
  const canExpand =
    source.kind === MODEL_MANAGEMENT_SOURCE_KINDS.ACCOUNT && showGroupDetails

  const activeGroups =
    selectedGroups.length > 0 ? selectedGroups : availableGroups
  const hasRuntimeDiscoveredPricingGap =
    isModelPriceUnavailable(model) ||
    calculatedPrice.priceAvailability === "unavailable"
  const isAvailableForUser =
    hasRuntimeDiscoveredPricingGap ||
    groupSelectionScope === MODEL_LIST_GROUP_SELECTION_SCOPES.ALL_ACCOUNTS
      ? true
      : showGroupDetails
        ? activeGroups.some((group) => model.enable_groups.includes(group))
        : true
  const groupLabels = model.enable_groups.map((group) =>
    formatGroupLabelFromRatios(group, groupRatios),
  )
  const groupSummary =
    showGroupDetails && groupLabels.length > 0
      ? {
          label:
            groupLabels.length === 1
              ? groupLabels[0]
              : formatGroupLabelFromRatios(model.enable_groups[0], groupRatios),
          ...(groupLabels.length > 1
            ? { overflowCount: groupLabels.length - 1 }
            : {}),
          title: `${t("availableGroups")}: ${groupLabels.join(", ")}`,
        }
      : undefined

  const modelActionEnableGroups = effectiveGroup
    ? [effectiveGroup]
    : model.enable_groups.length > 0
      ? model.enable_groups
      : undefined

  const sourceBadge = sourceLabel.label ? (
    handleFilterAccount ? (
      <Badge
        asChild
        variant="outline"
        size="default"
        className="max-w-full min-w-0"
      >
        <button
          type="button"
          onClick={handleFilterAccount}
          title={sourceLabel.title ?? sourceLabel.label}
          aria-label={sourceLabel.label}
          className="max-w-full min-w-0 cursor-pointer hover:border-blue-300 hover:text-blue-700 dark:hover:border-blue-400 dark:hover:text-blue-300"
        >
          <span className="min-w-0 truncate">{sourceLabel.label}</span>
        </button>
      </Badge>
    ) : (
      <Badge
        variant="outline"
        size="default"
        className="max-w-full min-w-0"
        title={sourceLabel.title ?? sourceLabel.label}
      >
        <span className="min-w-0 truncate">{sourceLabel.label}</span>
      </Badge>
    )
  ) : null
  const sourceUrlActions = canUseSourceUrl ? (
    <>
      <IconButton
        variant="ghost"
        size="sm"
        onClick={handleCopySourceUrl}
        title={t("actions.copySiteUrl")}
        aria-label={t("actions.copySiteUrl")}
        className="shrink-0"
        analyticsAction={
          source.kind === MODEL_MANAGEMENT_SOURCE_KINDS.ACCOUNT
            ? PRODUCT_ANALYTICS_ACTION_IDS.CopyAccountSiteUrl
            : PRODUCT_ANALYTICS_ACTION_IDS.CopyBaseUrl
        }
      >
        <Copy className="h-3 w-3 text-gray-600 sm:h-3.5 sm:w-3.5 dark:text-gray-300" />
      </IconButton>
      {canOpenSourceUrl ? (
        <IconButton
          variant="ghost"
          size="sm"
          onClick={handleOpenSourceUrl}
          title={t("actions.openSite")}
          aria-label={t("actions.openSite")}
          className="shrink-0"
          analyticsAction={
            source.kind === MODEL_MANAGEMENT_SOURCE_KINDS.ACCOUNT
              ? PRODUCT_ANALYTICS_ACTION_IDS.OpenAccountSite
              : undefined
          }
        >
          <ExternalLink className="h-3 w-3 text-gray-600 sm:h-3.5 sm:w-3.5 dark:text-gray-300" />
        </IconButton>
      ) : null}
    </>
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
            groupSummary={groupSummary}
            verificationSummary={verificationSummary}
            onOpenKeyDialog={
              source.kind === MODEL_MANAGEMENT_SOURCE_KINDS.ACCOUNT &&
              effectiveCapabilities.supportsTokenCompatibility &&
              onOpenModelKeyDialog
                ? () =>
                    onOpenModelKeyDialog(
                      source.account,
                      model.model_name,
                      modelActionEnableGroups,
                    )
                : undefined
            }
            onVerifyApi={
              effectiveCapabilities.supportsCredentialVerification &&
              onVerifyModel
                ? () =>
                    onVerifyModel(
                      source,
                      model.model_name,
                      modelActionEnableGroups,
                    )
                : undefined
            }
            onVerifyCliSupport={
              effectiveCapabilities.supportsCliVerification &&
              onVerifyCliSupport
                ? () => onVerifyCliSupport(source, model.model_name)
                : undefined
            }
            trailingContent={
              sourceBadge || sourceUrlActions || canExpand ? (
                <>
                  {sourceBadge}
                  {sourceUrlActions}
                  {canExpand && (
                    <ModelItemExpandButton
                      isExpanded={isExpanded}
                      onToggleExpand={handleToggleExpand}
                      analyticsAction={{
                        featureId: PRODUCT_ANALYTICS_FEATURE_IDS.ModelList,
                        actionId:
                          PRODUCT_ANALYTICS_ACTION_IDS.ToggleModelDetails,
                        surfaceId:
                          PRODUCT_ANALYTICS_SURFACE_IDS.OptionsModelListRowActions,
                        entrypoint: PRODUCT_ANALYTICS_ENTRYPOINTS.Options,
                      }}
                    />
                  )}
                </>
              ) : undefined
            }
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
          showPricing={showPricing}
          showRatioColumn={
            showRatioColumn && effectiveCapabilities.supportsRatioDisplay
          }
          isAvailableForUser={isAvailableForUser}
          isLowestPrice={isLowestPrice}
          effectiveGroup={effectiveGroup}
          groupRatios={groupRatios}
          showsOptimalGroup={showsOptimalGroup}
          groupSelectionScope={groupSelectionScope}
        />

        {isExpanded &&
          source.kind === MODEL_MANAGEMENT_SOURCE_KINDS.ACCOUNT && (
            <div className="border-t pt-4 dark:border-gray-700">
              <ModelItemDetails
                model={model}
                calculatedPrice={calculatedPrice}
                showEndpointTypes={showEndpointTypes}
                groupRatios={groupRatios}
                effectiveGroup={effectiveGroup}
                showGroupDetails={showGroupDetails}
                showPricingDetails={showPricing}
                onGroupClick={
                  isGroupSelectionInteractive ? onGroupClick : undefined
                }
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
                  group: formatGroupLabelFromRatios(
                    effectiveGroup || selectedGroups[0] || DEFAULT_MODEL_GROUP,
                    groupRatios,
                  ),
                })}
              </span>
            </div>
            <div className="text-sm text-yellow-600 dark:text-yellow-400">
              {t("availableGroups")}:{" "}
              {model.enable_groups
                .map((group) => formatGroupLabelFromRatios(group, groupRatios))
                .join(", ")}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
