import { CpuChipIcon } from "@heroicons/react/24/outline"
import { forwardRef, useCallback, useEffect, useMemo, useState } from "react"
import type { HTMLAttributes } from "react"
import { useTranslation } from "react-i18next"
import { Virtuoso } from "react-virtuoso"

import { EmptyState } from "~/components/ui"
import { UI_CONSTANTS } from "~/constants/ui"
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
import { cn } from "~/lib/utils"
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
  onVerifyModel?: (source: ModelManagementItemSource, modelId: string) => void
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
    modelEnableGroups: string[],
  ) => void
  onModelClick?: (model: CalculatedModelItem) => void
  count?: number
  showRealPrice: boolean
  showRatioColumn: boolean
  showEndpointTypes: boolean
  selectedGroups: string[]
  handleGroupClick: (group: string) => void
  availableGroups: string[]
  groupSelectionScope?: ModelListGroupSelectionScope
  isGroupSelectionInteractive?: boolean
  displayCapabilities?: ModelManagementSourceCapabilities
  onFilterAccount?: (accountId: string) => void
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
    selectedGroups,
    handleGroupClick,
    availableGroups,
    groupSelectionScope = MODEL_LIST_GROUP_SELECTION_SCOPES.SINGLE_SOURCE,
    isGroupSelectionInteractive = true,
    displayCapabilities,
    onFilterAccount,
  } = props
  const { t } = useTranslation("modelList")
  const modelKeys = useMemo(() => models.map(getModelItemKey), [models])
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

  return (
    <div
      className="max-h-[70vh] overflow-hidden"
      style={{ height: listContainerHeight }}
    >
      <Virtuoso
        className="h-full"
        data={models}
        computeItemKey={(_, item) => getModelItemKey(item)}
        components={{
          Item: ModelRowsItem,
          List: ModelRowsList,
        }}
        totalListHeightChanged={setListHeight}
        style={{ height: "100%" }}
        itemContent={(_index, item) => {
          const itemKey = getModelItemKey(item)
          const sourceForModel = item.source as ModelManagementItemSource
          const accountForModel =
            sourceForModel.kind === MODEL_MANAGEMENT_SOURCE_KINDS.ACCOUNT
              ? sourceForModel.account
              : undefined
          const exchangeRate =
            accountForModel && accountForModel.balance?.USD > 0
              ? accountForModel.balance.CNY / accountForModel.balance.USD
              : UI_CONSTANTS.EXCHANGE_RATE.DEFAULT
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
              calculatedPrice={item.calculatedPrice}
              exchangeRate={exchangeRate}
              showRealPrice={showRealPrice}
              showRatioColumn={showRatioColumn}
              showEndpointTypes={showEndpointTypes}
              groupRatios={item.groupRatios}
              effectiveGroup={item.effectiveGroup}
              selectedGroups={selectedGroups}
              onGroupClick={handleGroupClick}
              availableGroups={availableGroups}
              isAllGroupsMode={selectedGroups.length === 0}
              isLowestPrice={item.isLowestPrice}
              showsOptimalGroup={item.hasAutoSelectedGroup}
              groupSelectionScope={groupSelectionScope}
              isGroupSelectionInteractive={isGroupSelectionInteractive}
              source={sourceForModel}
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
        }}
      />
    </div>
  )
}
