import { Cpu, Info } from "lucide-react"
import type { HTMLAttributes } from "react"
import { forwardRef, useCallback, useEffect, useMemo, useState } from "react"
import { useTranslation } from "react-i18next"
import { Virtuoso } from "react-virtuoso"

import { Badge, EmptyState } from "~/components/ui"
import { resolveAccountExchangeRate } from "~/features/ModelList/accountExchangeRate"
import { MODEL_LIST_BILLING_MODES } from "~/features/ModelList/billingModes"
import {
  MODEL_LIST_GROUP_SELECTION_SCOPES,
  type ModelListGroupSelectionScope,
} from "~/features/ModelList/groupSelectionScopes"
import {
  getModelItemKey,
  type CalculatedModelItem,
} from "~/features/ModelList/modelListItems"
import type {
  ModelManagementItemSource,
  ModelManagementSourceCapabilities,
} from "~/features/ModelList/modelManagementSources"
import { MODEL_MANAGEMENT_SOURCE_KINDS } from "~/features/ModelList/modelManagementSources"
import { MODEL_LIST_TEST_IDS } from "~/features/ModelList/testIds"
import { cn } from "~/lib/utils"
import { QUOTE_UNITS } from "~/services/modelPricing/pricingConstants"
import {
  getBillingModeText,
  isTokenBillingType,
} from "~/services/models/utils/modelPricing"
import type { ApiVerificationHistorySummary } from "~/services/verification/verificationResultHistory"
import {
  createAccountModelVerificationHistoryTarget,
  createProfileModelVerificationHistoryTarget,
  serializeVerificationHistoryTarget,
} from "~/services/verification/verificationResultHistory"

import ModelItem from "./ModelItem"

interface ModelDisplayProps {
  models: CalculatedModelItem[]
  verificationSummariesByKey: Record<string, ApiVerificationHistorySummary>
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
  onModelClick?: (model: CalculatedModelItem) => void
  count?: number
  showRealPrice: boolean
  showEndpointTypes: boolean
  showPriceComparisonGroups?: boolean
  handleGroupClick: (group: string) => void
  groupSelectionScope?: ModelListGroupSelectionScope
  isGroupSelectionInteractive?: boolean
  displayCapabilities?: ModelManagementSourceCapabilities
  onFilterAccount?: (accountId: string) => void
}

interface PriceComparisonDisplayGroup {
  unit?: string
  key: string
  modelName: string
  quotaType: number
  comparableItems: CalculatedModelItem[]
  notComparedItems: CalculatedModelItem[]
}

type ModelDisplayEntry =
  | { kind: "model"; item: CalculatedModelItem }
  | { kind: "price-comparison-group"; group: PriceComparisonDisplayGroup }

/** Groups comparable model identities while keeping billing modes separate. */
function createPriceComparisonDisplayGroups(
  models: CalculatedModelItem[],
): PriceComparisonDisplayGroup[] {
  const groups = new Map<string, PriceComparisonDisplayGroup>()

  models.forEach((item) => {
    const billingMode = isTokenBillingType(item.model.quota_type)
      ? MODEL_LIST_BILLING_MODES.TOKEN_BASED
      : MODEL_LIST_BILLING_MODES.PER_CALL
    const unit =
      item.calculatedPrice.quote?.unit ??
      (billingMode === MODEL_LIST_BILLING_MODES.TOKEN_BASED
        ? QUOTE_UNITS.MILLION_SELECTED_TOKENS
        : QUOTE_UNITS.REQUEST)
    const key = JSON.stringify([
      item.comparableModelIdentity.key,
      billingMode,
      unit,
    ])
    const group = groups.get(key) ?? {
      key,
      unit,
      modelName: item.comparableModelIdentity.displayName,
      quotaType: item.model.quota_type,
      comparableItems: [],
      notComparedItems: [],
    }

    if (item.isPriceComparable) {
      group.comparableItems.push(item)
    } else {
      group.notComparedItems.push(item)
    }
    groups.set(key, group)
  })

  return Array.from(groups.values())
}

const ModelRowsList = forwardRef<
  HTMLDivElement,
  HTMLAttributes<HTMLDivElement>
>(function ModelRowsList({ children, className, ...props }, ref) {
  return (
    <div
      ref={ref}
      className={cn("min-w-0 overflow-x-hidden", className)}
      {...props}
    >
      {children}
    </div>
  )
})

const ModelRowsItem = forwardRef<
  HTMLDivElement,
  HTMLAttributes<HTMLDivElement>
>(function ModelRowsItem({ children, className, ...props }, ref) {
  return (
    <div ref={ref} className={cn("pb-density-3 min-w-0", className)} {...props}>
      {children}
    </div>
  )
})

/**
 * Virtualized list displaying model cards with pricing and availability data.
 * @param props Component props describing the rendered model list.
 * @returns Virtualized model list or empty state when no matches.
 */
export function ModelDisplay(props: ModelDisplayProps) {
  const {
    models,
    verificationSummariesByKey,
    onVerifyModel,
    onVerifyCliSupport,
    onOpenModelKeyDialog,
    showRealPrice,
    showEndpointTypes,
    showPriceComparisonGroups = false,
    handleGroupClick,
    groupSelectionScope = MODEL_LIST_GROUP_SELECTION_SCOPES.SINGLE_SOURCE,
    isGroupSelectionInteractive = true,
    displayCapabilities,
    onFilterAccount,
  } = props
  const { t } = useTranslation("modelList")
  const modelKeys = useMemo(() => models.map(getModelItemKey), [models])
  const displayEntries = useMemo<ModelDisplayEntry[]>(
    () =>
      showPriceComparisonGroups
        ? createPriceComparisonDisplayGroups(models).map((group) => ({
            kind: "price-comparison-group",
            group,
          }))
        : models.map((item) => ({ kind: "model", item })),
    [models, showPriceComparisonGroups],
  )
  const [expandedModelKeys, setExpandedModelKeys] = useState<string[]>([])
  const [listHeight, setListHeight] = useState(0)

  useEffect(() => {
    const activeModelKeys = new Set(modelKeys)

    setExpandedModelKeys((currentKeys) => {
      const nextKeys = currentKeys.filter((key) => activeModelKeys.has(key))
      return nextKeys.length === currentKeys.length ? currentKeys : nextKeys
    })
  }, [modelKeys])

  const expandedModelKeySet = useMemo(
    () => new Set(expandedModelKeys),
    [expandedModelKeys],
  )
  const listContainerHeight = listHeight > 0 ? listHeight : "70vh"

  const toggleModelExpand = useCallback((itemKey: string) => {
    setExpandedModelKeys((currentKeys) =>
      currentKeys.includes(itemKey)
        ? currentKeys.filter((key) => key !== itemKey)
        : [...currentKeys, itemKey],
    )
  }, [])

  if (models.length === 0) {
    return (
      <EmptyState
        icon={<Cpu className="h-12 w-12" />}
        title={t("noMatchingModels")}
      />
    )
  }

  const renderModelItem = (
    item: CalculatedModelItem,
    isComparisonOffer = false,
  ) => {
    const itemKey = getModelItemKey(item)
    const sourceForModel = item.source
    const accountForModel =
      sourceForModel.kind === MODEL_MANAGEMENT_SOURCE_KINDS.ACCOUNT
        ? sourceForModel.account
        : undefined
    const exchangeRate = resolveAccountExchangeRate(accountForModel)
    const modelId = item.model.model_name
    const historyTarget =
      sourceForModel.kind === MODEL_MANAGEMENT_SOURCE_KINDS.PROFILE
        ? createProfileModelVerificationHistoryTarget(
            sourceForModel.profile.id,
            modelId,
          )
        : createAccountModelVerificationHistoryTarget(
            sourceForModel.account.id,
            modelId,
          )
    const verificationSummary = historyTarget
      ? verificationSummariesByKey[
          serializeVerificationHistoryTarget(historyTarget)
        ] ?? null
      : null

    return (
      <ModelItem
        model={item.model}
        resolvedVendor={item.resolvedVendor}
        modelMetadata={item.modelMetadata}
        calculatedPrice={item.calculatedPrice}
        exchangeRate={exchangeRate}
        showRealPrice={showRealPrice}
        showEndpointTypes={showEndpointTypes}
        groupRatios={item.groupRatios}
        groupContext={item.groupContext}
        activeGroupContext={item.activeGroupContext}
        effectiveGroup={item.effectiveGroup}
        onGroupClick={handleGroupClick}
        isLowestPrice={item.isLowestPrice}
        isComparisonOffer={isComparisonOffer}
        showsOptimalGroup={item.hasUniquelyOptimalGroup}
        groupSelectionScope={groupSelectionScope}
        isGroupSelectionInteractive={isGroupSelectionInteractive}
        source={sourceForModel}
        sourceIdentity={item.sourceIdentity}
        displayCapabilities={displayCapabilities}
        verificationSummary={verificationSummary}
        onFilterAccount={onFilterAccount}
        onVerifyModel={onVerifyModel}
        onVerifyCliSupport={onVerifyCliSupport}
        onOpenModelKeyDialog={onOpenModelKeyDialog}
        isExpanded={expandedModelKeySet.has(itemKey)}
        onToggleExpand={() => toggleModelExpand(itemKey)}
      />
    )
  }

  return (
    <div
      data-testid={MODEL_LIST_TEST_IDS.modelDisplay}
      className="max-h-[70vh] overflow-hidden"
      style={{ height: listContainerHeight }}
    >
      <Virtuoso
        className="h-full"
        data={displayEntries}
        computeItemKey={(_, entry) =>
          entry.kind === "model" ? getModelItemKey(entry.item) : entry.group.key
        }
        components={{
          Item: ModelRowsItem,
          List: ModelRowsList,
        }}
        totalListHeightChanged={setListHeight}
        style={{ height: "100%" }}
        itemContent={(index, entry) => {
          if (entry.kind === "model") {
            return renderModelItem(entry.item)
          }

          const { group } = entry
          const headingId = `model-price-comparison-group-${index}`
          const billingModeId = `${headingId}-billing-mode`

          return (
            <section
              aria-labelledby={`${headingId} ${billingModeId}`}
              className="border-border bg-card overflow-hidden rounded-xl border shadow-sm"
            >
              <header className="dark:bg-background/45 border-border bg-surface-subtle/80 gap-y-density-2 py-density-2-5 flex min-w-0 flex-wrap items-center gap-x-3 border-b px-3 sm:px-4">
                <div className="gap-y-density-2 flex w-full min-w-0 flex-wrap items-center gap-x-2 lg:w-auto lg:flex-1">
                  <h2
                    id={headingId}
                    className="text-foreground max-w-full min-w-0 font-mono text-sm font-semibold break-all"
                  >
                    {group.modelName}
                  </h2>
                  <Badge variant="secondary" size="sm" className="shrink-0">
                    <span id={billingModeId}>
                      {group.unit === QUOTE_UNITS.PAGE
                        ? t("scenario.page")
                        : group.unit === QUOTE_UNITS.MEGAPIXEL
                          ? t("scenario.megapixel")
                          : group.unit === QUOTE_UNITS.VIDEO_SECOND ||
                              group.unit === QUOTE_UNITS.AUDIO_SECOND
                            ? t("scenario.second")
                            : group.unit === QUOTE_UNITS.THOUSAND_CHARACTERS
                              ? t("scenario.thousandCharacters")
                              : group.unit === QUOTE_UNITS.SEARCH_UNIT
                                ? t("scenario.searchUnit")
                                : group.unit === QUOTE_UNITS.IMAGE
                                  ? t("scenario.image")
                                  : group.unit ===
                                      QUOTE_UNITS.MILLION_VIDEO_OUTPUT_TOKENS
                                    ? t("scenario.perMillionVideoTokens")
                                    : group.unit === QUOTE_UNITS.UNRESOLVED
                                      ? t("scenario.sitePricingDescription")
                                      : getBillingModeText(group.quotaType)}
                    </span>
                  </Badge>
                </div>
                <div className="gap-y-density-1-5 flex w-full flex-wrap items-center gap-x-1.5 text-xs lg:w-auto lg:shrink-0 lg:justify-end">
                  <span className="dark:bg-card dark:text-secondary-foreground border-border bg-card/80 text-muted-foreground py-density-1 rounded-full border px-2.5">
                    {t("priceComparison.results.comparable")}:{" "}
                    <strong className="text-success-text font-semibold">
                      {group.comparableItems.length}
                    </strong>
                  </span>
                  {group.notComparedItems.length > 0 && (
                    <span className="dark:bg-card dark:text-secondary-foreground border-border bg-card/80 text-muted-foreground py-density-1 rounded-full border px-2.5">
                      {t("priceComparison.results.notCompared")}:{" "}
                      <strong className="text-foreground font-semibold">
                        {group.notComparedItems.length}
                      </strong>
                    </span>
                  )}
                </div>
              </header>

              {group.comparableItems.length > 0 && (
                <ul
                  aria-label={t("priceComparison.results.comparable")}
                  className="dark:divide-border divide-border/80 divide-y"
                >
                  {group.comparableItems.map((item) => (
                    <li key={getModelItemKey(item)}>
                      {renderModelItem(item, true)}
                    </li>
                  ))}
                </ul>
              )}

              {group.notComparedItems.length > 0 && (
                <div
                  className={cn(
                    "bg-surface-subtle/55 dark:bg-foreground/[0.018]",
                    group.comparableItems.length > 0 &&
                      "dark:border-border border-border-strong border-t border-dashed",
                  )}
                >
                  <div
                    role="note"
                    className="dark:border-border border-border/80 gap-y-density-2 py-density-2-5 flex min-w-0 gap-x-2 border-b px-3 sm:px-4"
                  >
                    <Info
                      aria-hidden="true"
                      className="text-muted-foreground mt-0.5 h-4 w-4 shrink-0"
                    />
                    <div className="min-w-0">
                      <p className="text-foreground text-xs font-medium">
                        {t("priceComparison.results.notCompared")}
                      </p>
                      <p className="text-muted-foreground mt-0.5 text-xs leading-5">
                        {t("priceComparison.results.notComparedHint")}
                      </p>
                    </div>
                  </div>
                  <ul
                    aria-label={t("priceComparison.results.notCompared")}
                    className="dark:divide-border divide-border/80 divide-y"
                  >
                    {group.notComparedItems.map((item) => (
                      <li key={getModelItemKey(item)}>
                        {renderModelItem(item, true)}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </section>
          )
        }}
      />
    </div>
  )
}
