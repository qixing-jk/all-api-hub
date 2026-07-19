import { Copy } from "lucide-react"
import { useEffect, useState } from "react"
import toast from "react-hot-toast"
import { useTranslation } from "react-i18next"

import { WorkflowTransitionIcon } from "~/components/icons/WorkflowTransitionIcon"
import { Badge, Card, CardContent, IconButton } from "~/components/ui"
import {
  MODEL_GROUP_ACCESS_STATES,
  type ActiveModelGroupContext,
  type ModelGroupContext,
} from "~/features/ModelList/groupContext"
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
} from "~/services/modelList/pricingModel"
import type {
  ModelMetadata,
  ResolvedModelVendor,
} from "~/services/models/modelMetadata/types"
import {
  isTokenBillingType,
  type CalculatedPrice,
} from "~/services/models/utils/modelPricing"
import {
  PRODUCT_ANALYTICS_ACTION_IDS,
  PRODUCT_ANALYTICS_ENTRYPOINTS,
  PRODUCT_ANALYTICS_FEATURE_IDS,
  PRODUCT_ANALYTICS_SURFACE_IDS,
} from "~/services/productAnalytics/contracts"
import type { ApiVerificationHistorySummary } from "~/services/verification/verificationResultHistory"
import { createTab } from "~/utils/browser/browserApi"
import { isProdBuild } from "~/utils/core/environment"
import { createLogger } from "~/utils/core/logger"
import { tryParseUrl } from "~/utils/core/urlParsing"

import { formatGroupLabelFromRatios } from "../../groupLabels"
import { ModelCapabilityBadges } from "./ModelCapabilityBadges"
import { ModelItemDescription } from "./ModelItemDescription"
import { ModelItemDetails } from "./ModelItemDetails"
import { ModelItemExpandButton } from "./ModelItemExpandButton"
import { ModelItemHeader } from "./ModelItemHeader"
import { ModelItemPricing } from "./ModelItemPricing"

const logger = createLogger("ModelItem")

interface ModelItemProps {
  model: ModelPricing
  resolvedVendor: ResolvedModelVendor
  modelMetadata?: ModelMetadata
  calculatedPrice: CalculatedPrice
  exchangeRate: number
  showRealPrice: boolean
  showRatioColumn: boolean
  showEndpointTypes: boolean
  groupRatios: Record<string, number>
  groupContext: ModelGroupContext
  activeGroupContext: ActiveModelGroupContext
  effectiveGroup?: string
  onGroupClick?: (group: string) => void
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
    resolvedVendor,
    modelMetadata,
    calculatedPrice,
    exchangeRate,
    showRealPrice,
    showRatioColumn,
    showEndpointTypes,
    groupRatios,
    groupContext,
    activeGroupContext,
    effectiveGroup,
    onGroupClick,
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
  const hasGroupSemantics =
    groupContext.accessState !== MODEL_GROUP_ACCESS_STATES.NOT_APPLICABLE
  const showGroupDetails =
    source.kind === MODEL_MANAGEMENT_SOURCE_KINDS.ACCOUNT &&
    effectiveCapabilities.supportsGroupFiltering &&
    hasGroupSemantics
  const canExpand =
    source.kind === MODEL_MANAGEMENT_SOURCE_KINDS.ACCOUNT &&
    (showGroupDetails ||
      (showEndpointTypes &&
        (effectiveCapabilities.supportsPricing ||
          effectiveCapabilities.supportsGroupFiltering)) ||
      (showPricing && isTokenBillingType(model.quota_type)))

  const hasRuntimeDiscoveredPricingGap =
    isModelPriceUnavailable(model) ||
    calculatedPrice.priceAvailability === "unavailable"
  const hasKnownNoUsableGroup =
    groupContext.accessState === MODEL_GROUP_ACCESS_STATES.KNOWN &&
    groupContext.usableGroups.length === 0
  const isAvailableForUser = hasKnownNoUsableGroup
    ? false
    : hasRuntimeDiscoveredPricingGap ||
        groupContext.accessState === MODEL_GROUP_ACCESS_STATES.UNKNOWN
      ? true
      : showGroupDetails
        ? activeGroupContext.activeUsableGroups.length > 0
        : true
  const usableGroupLabels = groupContext.usableGroups.map((group) =>
    formatGroupLabelFromRatios(group, groupRatios),
  )
  const groupSummary =
    showGroupDetails && usableGroupLabels.length > 0
      ? {
          label: usableGroupLabels[0],
          ...(usableGroupLabels.length > 1
            ? { overflowCount: usableGroupLabels.length - 1 }
            : {}),
          title: `${t("currentUsableGroups")}: ${usableGroupLabels.join(", ")}`,
        }
      : undefined

  const modelActionEnableGroups = hasGroupSemantics
    ? activeGroupContext.actionGroups
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
          <WorkflowTransitionIcon className="h-3 w-3 text-gray-600 sm:h-3.5 sm:w-3.5 dark:text-gray-300" />
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
            resolvedVendor={resolvedVendor}
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
        <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div className="min-w-0 flex-1">
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
          </div>
          <ModelCapabilityBadges
            modelMetadata={modelMetadata}
            className="mt-1 sm:ml-auto sm:max-w-[48%]"
          />
        </div>

        {canExpand &&
          isExpanded &&
          source.kind === MODEL_MANAGEMENT_SOURCE_KINDS.ACCOUNT && (
            <div className="border-t pt-4 dark:border-gray-700">
              <ModelItemDetails
                model={model}
                calculatedPrice={calculatedPrice}
                showEndpointTypes={showEndpointTypes}
                groupRatios={groupRatios}
                groupContext={groupContext}
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
            <div className="flex items-center gap-2 text-sm text-yellow-700 dark:text-yellow-300">
              <Badge variant="warning" size="sm">
                {t("unavailable")}
              </Badge>
              <span>
                {hasKnownNoUsableGroup
                  ? t("noUsableGroupsForModel")
                  : t("clickSwitchGroup", {
                      group: formatGroupLabelFromRatios(
                        groupContext.usableGroups[0],
                        groupRatios,
                      ),
                    })}
              </span>
            </div>
            {!hasKnownNoUsableGroup && usableGroupLabels.length > 0 && (
              <div className="mt-2 text-sm text-yellow-600 dark:text-yellow-400">
                {t("currentUsableGroups")}: {usableGroupLabels.join(", ")}
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
