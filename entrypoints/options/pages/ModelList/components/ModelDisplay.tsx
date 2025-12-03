import { CpuChipIcon } from "@heroicons/react/24/outline"
import { useTranslation } from "react-i18next"
import { Virtuoso } from "react-virtuoso"

import { EmptyState } from "~/components/ui"
import { UI_CONSTANTS } from "~/constants/ui"
import type { DisplaySiteData } from "~/types"

import ModelItem from "./ModelItem"

interface ModelDisplayProps {
  models: any[]
  currentAccount: DisplaySiteData | undefined
  showRealPrice: boolean
  showRatioColumn: boolean
  showEndpointTypes: boolean
  selectedGroup: string
  handleGroupClick: (group: string) => void
  availableGroups: string[]
}

export function ModelDisplay({
  models,
  currentAccount,
  showRealPrice,
  showRatioColumn,
  showEndpointTypes,
  selectedGroup,
  handleGroupClick,
  availableGroups,
}: ModelDisplayProps) {
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
        itemContent={(index, item) => (
          <ModelItem
            key={`${item.model.model_name}-${index}`}
            model={item.model}
            calculatedPrice={item.calculatedPrice}
            exchangeRate={
              currentAccount && currentAccount?.balance?.USD > 0
                ? currentAccount.balance.CNY / currentAccount.balance.USD
                : UI_CONSTANTS.EXCHANGE_RATE.DEFAULT
            }
            showRealPrice={showRealPrice}
            showRatioColumn={showRatioColumn}
            showEndpointTypes={showEndpointTypes}
            userGroup={selectedGroup === "all" ? "default" : selectedGroup}
            onGroupClick={handleGroupClick}
            availableGroups={availableGroups}
            isAllGroupsMode={selectedGroup === "all"}
          />
        )}
      />
    </div>
  )
}
