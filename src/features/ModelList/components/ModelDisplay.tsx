import { CpuChipIcon } from "@heroicons/react/24/outline"
import {
  forwardRef,
  Fragment,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react"
import type { HTMLAttributes } from "react"
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
} from "~/features/ModelList/hooks/useFilteredModels"
import type {
  ModelManagementItemSource,
  ModelManagementSourceCapabilities,
} from "~/features/ModelList/modelManagementSources"
import { MODEL_MANAGEMENT_SOURCE_KINDS } from "~/features/ModelList/modelManagementSources"
import { MODEL_LIST_TEST_IDS } from "~/features/ModelList/testIds"
import { cn } from "~/lib/utils"
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
  showRatioColumn: boolean
  showEndpointTypes: boolean
  showPriceComparisonGroups?: boolean
  handleGroupClick: (group: string) => void
  groupSelectionScope?: ModelListGroupSelectionScope
  isGroupSelectionInteractive?: boolean
  displayCapabilities?: ModelManagementSourceCapabilities
  onFilterAccount?: (accountId: string) => void
}

interface PriceComparisonDisplayGroup {
  key: string
  modelName: string
  quotaType: number
  comparableItems: CalculatedModelItem[]
  notComparedItems: CalculatedModelItem[]
}

type ModelDisplayEntry =
  | { kind: "model"; item: CalculatedModelItem }
  | { kind: "price-comparison-group"; group: PriceComparisonDisplayGroup }

/** Groups exact model ids while keeping incompatible billing modes separate. */
function createPriceComparisonDisplayGroups(
  models: CalculatedModelItem[],
): PriceComparisonDisplayGroup[] {
  const groups = new Map<string, PriceComparisonDisplayGroup>()

  models.forEach((item) => {
    const billingMode = isTokenBillingType(item.model.quota_type)
      ? MODEL_LIST_BILLING_MODES.TOKEN_BASED
      : MODEL_LIST_BILLING_MODES.PER_CALL
    const key = JSON.stringify([item.model.model_name, billingMode])
    const group = groups.get(key) ?? {
      key,
      modelName: item.model.model_name,
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
    <div ref={ref} className={cn("min-w-0 pb-3", className)} {...props}>
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
    showRatioColumn,
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
        icon={<CpuChipIcon className="h-12 w-12" />}
        title={t("noMatchingModels")}
      />
    )
  }

  const renderModelItem = (item: CalculatedModelItem) => {
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
        showRatioColumn={showRatioColumn}
        showEndpointTypes={showEndpointTypes}
        groupRatios={item.groupRatios}
        groupContext={item.groupContext}
        activeGroupContext={item.activeGroupContext}
        effectiveGroup={item.effectiveGroup}
        onGroupClick={handleGroupClick}
        isLowestPrice={item.isLowestPrice}
        showsOptimalGroup={item.hasAutoSelectedGroup}
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
            <section aria-labelledby={`${headingId} ${billingModeId}`}>
              <header className="dark:border-dark-bg-tertiary dark:bg-dark-bg-primary/45 mb-3 flex min-w-0 flex-wrap items-center gap-x-3 gap-y-2 border-y border-gray-200 bg-gray-50/80 px-3 py-2.5 sm:px-4">
                <h2
                  id={headingId}
                  className="text-foreground min-w-0 flex-1 font-mono text-sm font-semibold break-all"
                >
                  {group.modelName}
                </h2>
                <Badge variant="secondary" size="sm" className="shrink-0">
                  <span id={billingModeId}>
                    {getBillingModeText(group.quotaType)}
                  </span>
                </Badge>
                <div className="dark:text-dark-text-secondary flex shrink-0 flex-wrap items-center gap-x-3 gap-y-1 text-xs text-gray-600">
                  <span>
                    {t("priceComparison.results.comparable")}:{" "}
                    <strong className="font-semibold text-emerald-700 dark:text-emerald-400">
                      {group.comparableItems.length}
                    </strong>
                  </span>
                  {group.notComparedItems.length > 0 && (
                    <span>
                      {t("priceComparison.results.notCompared")}:{" "}
                      <strong className="text-foreground font-semibold">
                        {group.notComparedItems.length}
                      </strong>
                    </span>
                  )}
                </div>
              </header>

              <div className="space-y-3">
                {group.comparableItems.map((item) => (
                  <Fragment key={getModelItemKey(item)}>
                    {renderModelItem(item)}
                  </Fragment>
                ))}

                {group.notComparedItems.length > 0 && (
                  <div className="dark:border-dark-bg-tertiary space-y-3 border-t border-dashed border-gray-200 pt-3">
                    <div className="px-1">
                      <p className="text-foreground text-xs font-medium">
                        {t("priceComparison.results.notCompared")}
                      </p>
                      <p className="dark:text-dark-text-tertiary mt-1 text-xs leading-5 text-gray-500">
                        {t("priceComparison.results.notComparedHint")}
                      </p>
                    </div>
                    {group.notComparedItems.map((item) => (
                      <Fragment key={getModelItemKey(item)}>
                        {renderModelItem(item)}
                      </Fragment>
                    ))}
                  </div>
                )}
              </div>
            </section>
          )
        }}
      />
    </div>
  )
}
