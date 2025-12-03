import { useMemo } from "react"

import { UI_CONSTANTS } from "~/constants/ui"
import type { PricingResponse } from "~/services/apiService/common/type"
import type { DisplaySiteData } from "~/types"
import { calculateModelPrice } from "~/utils/modelPricing"
import {
  filterModelsByProvider,
  type ProviderType,
} from "~/utils/modelProviders"

interface UseFilteredModelsProps {
  pricingData: PricingResponse | null
  currentAccount: DisplaySiteData | undefined
  selectedGroup: string
  searchTerm: string
  selectedProvider: ProviderType | "all"
}

export function useFilteredModels({
  pricingData,
  currentAccount,
  selectedGroup,
  searchTerm,
  selectedProvider,
}: UseFilteredModelsProps) {
  const modelsWithPricing = useMemo(() => {
    if (!pricingData || !currentAccount || !Array.isArray(pricingData.data)) {
      return []
    }

    return pricingData.data.map((model) => {
      const exchangeRate =
        currentAccount?.balance?.USD > 0
          ? currentAccount.balance.CNY / currentAccount.balance.USD
          : UI_CONSTANTS.EXCHANGE_RATE.DEFAULT

      const calculatedPrice = calculateModelPrice(
        model,
        pricingData.group_ratio || {},
        exchangeRate,
        selectedGroup === "all" ? "default" : selectedGroup,
      )

      return {
        model,
        calculatedPrice,
      }
    })
  }, [pricingData, currentAccount, selectedGroup])

  const baseFilteredModels = useMemo(() => {
    let filtered = modelsWithPricing

    if (selectedGroup !== "all") {
      const availableGroupsList = pricingData?.group_ratio
        ? Object.keys(pricingData.group_ratio).filter((key) => key !== "")
        : []
      if (availableGroupsList.includes(selectedGroup)) {
        filtered = filtered.filter((item) =>
          item.model.enable_groups.includes(selectedGroup),
        )
      }
    }

    if (searchTerm) {
      const searchLower = searchTerm.toLowerCase()
      filtered = filtered.filter(
        (item) =>
          item.model.model_name.toLowerCase().includes(searchLower) ||
          item.model.model_description?.toLowerCase().includes(searchLower) ||
          false,
      )
    }

    return filtered
  }, [modelsWithPricing, selectedGroup, searchTerm, pricingData])

  const filteredModels = useMemo(() => {
    if (selectedProvider === "all") {
      return baseFilteredModels
    }
    return baseFilteredModels.filter(
      (item) =>
        filterModelsByProvider([item.model], selectedProvider).length > 0,
    )
  }, [baseFilteredModels, selectedProvider])

  const getProviderFilteredCount = (provider: ProviderType) => {
    return baseFilteredModels.filter(
      (item) => filterModelsByProvider([item.model], provider).length > 0,
    ).length
  }

  const availableGroups = useMemo(() => {
    if (!pricingData || !pricingData.group_ratio) {
      return []
    }
    return Object.keys(pricingData.group_ratio).filter((key) => key !== "")
  }, [pricingData])

  return {
    filteredModels,
    baseFilteredModels,
    getProviderFilteredCount,
    availableGroups,
  }
}
