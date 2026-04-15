import { CpuChipIcon } from "@heroicons/react/24/outline"
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
  selectedGroup: string
  handleGroupClick: (group: string) => void
  availableGroups: string[]
  displayCapabilities?: ModelManagementSourceCapabilities
  onFilterAccount?: (accountId: string) => void
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
    selectedGroup,
    handleGroupClick,
    availableGroups,
    displayCapabilities,
    onFilterAccount,
  } = props
  const { t } = useTranslation("modelList")
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
        components={{
          Item: ({ children, ...props }) => (
            <div className="my-3 first:mt-0" {...props}>
              {children}
            </div>
          ),
        }}
        itemContent={(index, item) => {
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
              key={`${item.model.model_name}-${index}`}
              model={item.model}
              calculatedPrice={item.calculatedPrice}
              exchangeRate={exchangeRate}
              showRealPrice={showRealPrice}
              showRatioColumn={showRatioColumn}
              showEndpointTypes={showEndpointTypes}
              userGroup={selectedGroup === "all" ? "default" : selectedGroup}
              onGroupClick={handleGroupClick}
              availableGroups={availableGroups}
              isAllGroupsMode={selectedGroup === "all"}
              isLowestPrice={item.isLowestPrice}
              source={sourceForModel}
              displayCapabilities={displayCapabilities}
              verificationSummary={verificationSummary}
              onFilterAccount={onFilterAccount}
              onVerifyModel={onVerifyModel}
              onVerifyCliSupport={onVerifyCliSupport}
              onOpenModelKeyDialog={onOpenModelKeyDialog}
            />
          )
        }}
      />
    </div>
  )
}
