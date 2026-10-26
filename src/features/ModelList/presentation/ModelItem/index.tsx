import { Copy } from "lucide-react"
import { useEffect, useRef, useState } from "react"
import { useTranslation } from "react-i18next"

import { WorkflowTransitionIcon } from "~/components/icons/WorkflowTransitionIcon"
import { Badge, Card, CardContent, IconButton } from "~/components/ui"
import type {
  ModelManagementItemSource,
  ModelManagementSourceCapabilities,
} from "~/features/ModelList/catalog/modelManagementSources"
import { MODEL_MANAGEMENT_SOURCE_KINDS } from "~/features/ModelList/catalog/modelManagementSources"
import { formatModelListSourceLabel } from "~/features/ModelList/catalog/sourceLabels"
import {
  MODEL_GROUP_ACCESS_STATES,
  type ActiveModelGroupContext,
  type ModelGroupContext,
} from "~/features/ModelList/groups/groupContext"
import { formatGroupLabelFromRatios } from "~/features/ModelList/groups/groupLabels"
import {
  MODEL_LIST_GROUP_SELECTION_SCOPES,
  type ModelListGroupSelectionScope,
} from "~/features/ModelList/groups/groupSelectionScopes"
import { ModelAvailabilityNotice } from "~/features/ModelList/presentation/ModelItem/ModelAvailabilityNotice"
import { ModelCapabilityBadges } from "~/features/ModelList/presentation/ModelItem/ModelCapabilityBadges"
import { ModelItemDescription } from "~/features/ModelList/presentation/ModelItem/ModelItemDescription"
import { ModelItemDetails } from "~/features/ModelList/presentation/ModelItem/ModelItemDetails"
import { ModelItemExpandButton } from "~/features/ModelList/presentation/ModelItem/ModelItemExpandButton"
import { ModelItemHeader } from "~/features/ModelList/presentation/ModelItem/ModelItemHeader"
import { ModelItemPricing } from "~/features/ModelList/presentation/ModelItem/ModelItemPricing"
import {
  ModelPresentationDetails,
  ModelPresentationSummary,
} from "~/features/ModelList/presentation/ModelItem/ModelPresentationFacts"
import { ProviderGroupSelector } from "~/features/ModelList/presentation/ModelItem/ProviderGroupSelector"
import toast from "~/lib/notify"
import { cn } from "~/lib/utils"
import { createDisplayAccountRequestContext } from "~/services/accounts/utils/apiServiceRequest"
import { getSiteTypeCapabilities } from "~/services/apiAdapters/registry"
import type { ModelListSourceIdentity } from "~/services/modelCatalog/sourceIdentity"
import { MODEL_LIST_SOURCE_IDENTITY_KINDS } from "~/services/modelCatalog/sourceIdentity"
import {
  isModelPriceUnavailable,
  type ModelPricing,
} from "~/services/modelList/pricingModel"
import { CALCULATED_PRICE_KINDS } from "~/services/modelPricing/pricingConstants"
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
import { createTab } from "~/utils/browser/tabs"
import { isProdBuild } from "~/utils/core/environment"
import { createLogger } from "~/utils/core/logger"
import { tryParseUrl } from "~/utils/core/urlParsing"
import { revealNavigationTarget } from "~/utils/dom/navigationTarget"

const logger = createLogger("ModelItem")

interface ModelItemProps {
  model: ModelPricing
  onCatalogChanged?: () => Promise<void>
  resolvedVendor: ResolvedModelVendor
  modelMetadata?: ModelMetadata
  calculatedPrice: CalculatedPrice
  exchangeRate: number
  showRealPrice: boolean
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
  isProviderCatalogFallback?: boolean
  displayCapabilities?: ModelManagementSourceCapabilities
  isLowestPrice?: boolean
  isComparisonOffer?: boolean
  verificationSummary?: ApiVerificationHistorySummary | null
  onFilterAccount?: (accountId: string) => void
  onVerifyModel?: (
    source: ModelManagementItemSource,
    modelId: string,
    modelEnableGroups?: string[],
    supportedEndpointTypes?: string[],
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
    onCatalogChanged,
    resolvedVendor,
    modelMetadata,
    calculatedPrice,
    exchangeRate,
    showRealPrice,
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
    isProviderCatalogFallback = false,
    displayCapabilities = source.capabilities,
    isLowestPrice = false,
    isComparisonOffer = false,
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
  const detailsRef = useRef<HTMLDivElement>(null)
  const [calculationRequested, setCalculationRequested] = useState(false)
  const isExpansionControlled =
    controlledIsExpanded !== undefined && onToggleExpand !== undefined
  const hasExpansionPropMismatch =
    (controlledIsExpanded !== undefined) !== (onToggleExpand !== undefined)
  const isExpanded = isExpansionControlled
    ? controlledIsExpanded
    : uncontrolledIsExpanded
  useEffect(() => {
    if (calculationRequested && isExpanded && detailsRef.current) {
      revealNavigationTarget(detailsRef.current, {
        block: "nearest",
        focus: true,
      })
      setCalculationRequested(false)
    }
  }, [calculationRequested, isExpanded])

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
  const isProviderCatalogSource =
    sourceIdentity?.kind === MODEL_LIST_SOURCE_IDENTITY_KINDS.PROVIDER_CATALOG
  const canUseSourceUrl = !isProviderCatalogSource && Boolean(sourceBaseUrl)
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
      formatProviderCatalogLabel: ({ providerName }) =>
        t("sourceLabels.providerCatalogBadge", { provider: providerName }),
      formatPersonalizedCatalogLabel: ({ accountName }) =>
        t("sourceLabels.personalizedCatalogBadge", { account: accountName }),
    },
    sourceIdentity,
  )
  const handleFilterAccount =
    !isProviderCatalogSource &&
    source.kind === MODEL_MANAGEMENT_SOURCE_KINDS.ACCOUNT &&
    onFilterAccount
      ? () => onFilterAccount(source.account.id)
      : undefined

  const effectiveCapabilities: ModelManagementSourceCapabilities = {
    supportsPricing:
      source.capabilities.supportsPricing &&
      displayCapabilities.supportsPricing,
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
  const hasPresentationDetails = Boolean(
    model.presentation?.sections?.some((section) => section.facts.length > 0),
  )
  const hasLegacyDetails =
    showGroupDetails ||
    (showEndpointTypes &&
      (effectiveCapabilities.supportsPricing ||
        effectiveCapabilities.supportsGroupFiltering)) ||
    (showPricing && !model.quotaPricing && isTokenBillingType(model.quota_type))
  const canExpand =
    source.kind === MODEL_MANAGEMENT_SOURCE_KINDS.ACCOUNT &&
    (hasLegacyDetails || hasPresentationDetails)

  const hasRuntimeDiscoveredPricingGap =
    isModelPriceUnavailable(model) ||
    calculatedPrice.kind === CALCULATED_PRICE_KINDS.UNAVAILABLE
  const hasKnownNoUsableGroup =
    groupContext.accessState === MODEL_GROUP_ACCESS_STATES.KNOWN &&
    groupContext.usableGroups.length === 0
  const isAvailableForUser =
    model.availability?.available === false || hasKnownNoUsableGroup
      ? false
      : hasRuntimeDiscoveredPricingGap ||
          groupContext.accessState === MODEL_GROUP_ACCESS_STATES.UNKNOWN
        ? true
        : showGroupDetails
          ? activeGroupContext.activeUsableGroups.length > 0
          : true
  const usableGroupLabels = groupContext.usableGroups.map((group) =>
    formatGroupLabelFromRatios(group, groupRatios, model.groupDisplayNames),
  )
  const [primaryUsableGroupLabel] = usableGroupLabels
  const [switchableGroup] = groupContext.usableGroups
  const groupSummary =
    showGroupDetails && primaryUsableGroupLabel
      ? {
          label: primaryUsableGroupLabel,
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
          className="hover:border-theme-300 hover:text-theme-700 dark:hover:border-theme-400 dark:hover:text-theme-300 max-w-full min-w-0 cursor-pointer"
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
        <Copy className="text-muted-foreground dark:text-secondary-foreground h-3 w-3 sm:h-3.5 sm:w-3.5" />
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
          <WorkflowTransitionIcon className="text-muted-foreground dark:text-secondary-foreground h-3 w-3 sm:h-3.5 sm:w-3.5" />
        </IconButton>
      ) : null}
    </>
  ) : null

  return (
    <Card
      variant={isComparisonOffer ? "ghost" : "interactive"}
      className={cn(
        isComparisonOffer
          ? "hover:bg-surface-subtle/80 dark:hover:bg-foreground/[0.025] rounded-none border-0 bg-transparent shadow-none transition-colors hover:shadow-none"
          : isAvailableForUser &&
              "hover:border-theme-300 dark:hover:border-theme-500/50",
        !isAvailableForUser && "bg-surface-subtle dark:bg-card/50",
      )}
    >
      <CardContent padding="default" spacing="default">
        <div className="gap-y-density-2 flex min-w-0 flex-wrap items-start gap-x-2">
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
                ? () => {
                    if (
                      Array.isArray(model.supported_endpoint_types) &&
                      model.supported_endpoint_types.length > 0
                    ) {
                      onVerifyModel(
                        source,
                        model.model_name,
                        modelActionEnableGroups,
                        model.supported_endpoint_types,
                      )
                    } else {
                      onVerifyModel(
                        source,
                        model.model_name,
                        modelActionEnableGroups,
                      )
                    }
                  }
                : undefined
            }
            onVerifyCliSupport={
              effectiveCapabilities.supportsCliVerification &&
              onVerifyCliSupport
                ? () => onVerifyCliSupport(source, model.model_name)
                : undefined
            }
            trailingContent={
              sourceBadge ||
              sourceUrlActions ||
              canExpand ||
              isProviderCatalogFallback ? (
                <>
                  {sourceBadge}
                  {isProviderCatalogFallback && (
                    <Badge
                      variant="warning"
                      title={t("providerCatalogFallbackNotice.description")}
                    >
                      {t("providerCatalogFallbackNotice.badge")}
                    </Badge>
                  )}
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
        <ModelAvailabilityNotice
          availability={model.availability}
          unavailable={!isAvailableForUser}
          unknown={
            model.availability?.available === null ||
            groupContext.accessState === MODEL_GROUP_ACCESS_STATES.UNKNOWN
          }
          groupHint={
            showGroupDetails && !isAvailableForUser
              ? hasKnownNoUsableGroup || !switchableGroup
                ? t("noUsableGroupsForModel")
                : t("clickSwitchGroup", {
                    group: formatGroupLabelFromRatios(
                      switchableGroup,
                      groupRatios,
                    ),
                  })
              : undefined
          }
          groupDetails={
            showGroupDetails &&
            !hasKnownNoUsableGroup &&
            usableGroupLabels.length > 0
              ? `${t("currentUsableGroups")}: ${usableGroupLabels.join(", ")}`
              : undefined
          }
        />
        <ModelItemDescription
          model={model}
          isAvailableForUser={isAvailableForUser}
        />
        <ModelPresentationSummary presentation={model.presentation} />
        {model.providerGroup &&
          source.kind === MODEL_MANAGEMENT_SOURCE_KINDS.ACCOUNT &&
          getSiteTypeCapabilities(source.account.siteType).account?.modelPricing
            ?.updateGroup && (
            <ProviderGroupSelector
              key={`${source.account.id}:${model.model_name}`}
              group={model.providerGroup}
              onSave={async (group) => {
                const capability = getSiteTypeCapabilities(
                  source.account.siteType,
                ).account?.modelPricing
                if (!capability?.updateGroup) return
                await capability.updateGroup(
                  createDisplayAccountRequestContext(source.account).request,
                  model.model_name,
                  group,
                )
                await onCatalogChanged?.()
              }}
            />
          )}

        <div className="gap-y-density-2 flex min-w-0 flex-col gap-x-2 sm:flex-row sm:items-end sm:justify-between">
          <div className="min-w-0 flex-1">
            <ModelItemPricing
              sourceLabel={sourceLabel.label}
              onShowDetails={
                canExpand && hasLegacyDetails
                  ? () => {
                      setCalculationRequested(true)
                      if (!isExpanded) handleToggleExpand()
                    }
                  : undefined
              }
              model={model}
              calculatedPrice={calculatedPrice}
              exchangeRate={exchangeRate}
              showRealPrice={showRealPrice}
              showPricing={showPricing}
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
            className="mt-density-1 sm:ml-auto sm:max-w-[48%]"
          />
        </div>

        {canExpand &&
          isExpanded &&
          source.kind === MODEL_MANAGEMENT_SOURCE_KINDS.ACCOUNT && (
            <div
              ref={detailsRef}
              tabIndex={-1}
              className="dark:border-border pt-density-4 border-t"
            >
              <div className="space-y-density-4">
                {hasLegacyDetails && (
                  <ModelItemDetails
                    sourceLabel={sourceLabel.label}
                    model={model}
                    calculatedPrice={calculatedPrice}
                    exchangeRate={exchangeRate}
                    showEndpointTypes={showEndpointTypes}
                    groupRatios={groupRatios}
                    groupContext={groupContext}
                    effectiveGroup={effectiveGroup}
                    showGroupDetails={showGroupDetails}
                    showPricingDetails={showPricing && !model.quotaPricing}
                    onGroupClick={
                      isGroupSelectionInteractive ? onGroupClick : undefined
                    }
                  />
                )}
                <ModelPresentationDetails presentation={model.presentation} />
              </div>
            </div>
          )}
      </CardContent>
    </Card>
  )
}
