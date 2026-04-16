import { CpuChipIcon } from "@heroicons/react/24/outline"
import { useCallback, useEffect, useMemo, useState } from "react"
import { useTranslation } from "react-i18next"
import { Virtuoso } from "react-virtuoso"

import { EmptyState } from "~/components/ui"
import { UI_CONSTANTS } from "~/constants/ui"
import type { CalculatedModelItem } from "~/features/ModelList/hooks/useFilteredModels"
import type {
  ModelManagementItemSource,
  ModelManagementSourceCapabilities,
} from "~/features/ModelList/modelManagementSources"
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
    account: Extract<ModelManagementItemSource, { kind: "account" }>["account"],
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
  displayCapabilities?: ModelManagementSourceCapabilities
  onFilterAccount?: (accountId: string) => void
}

/**
 * Builds a stable identity for a model row across refreshes and reordering.
 */
function getModelItemKey(item: CalculatedModelItem) {
  const source = item.source as ModelManagementItemSource
  const sourceKey =
    source.kind === "profile" ? source.profile.id : source.account.id

  return `${source.kind}:${sourceKey}:${item.model.model_name}`
}

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
    displayCapabilities,
    onFilterAccount,
  } = props
  const { t } = useTranslation("modelList")
  const modelKeys = useMemo(() => models.map(getModelItemKey), [models])
  const [expandedModelKeys, setExpandedModelKeys] = useState<string[]>([])

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
    <div className="h-[70vh]">
      <Virtuoso
        data={models}
        computeItemKey={(_, item) => getModelItemKey(item)}
        components={{
          Item: ({ children, ...props }) => (
            <div className="my-3 first:mt-0" {...props}>
              {children}
            </div>
          ),
        }}
        itemContent={(_index, item) => {
          const itemKey = getModelItemKey(item)
          const sourceForModel = item.source as ModelManagementItemSource
          const accountForModel =
            sourceForModel.kind === "account"
              ? sourceForModel.account
              : undefined
          const exchangeRate =
            accountForModel && accountForModel.balance?.USD > 0
              ? accountForModel.balance.CNY / accountForModel.balance.USD
              : UI_CONSTANTS.EXCHANGE_RATE.DEFAULT
          const modelId = item.model.model_name
          const historyTarget =
            sourceForModel.kind === "profile"
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
