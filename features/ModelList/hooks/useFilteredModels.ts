import { useMemo } from "react"

import { UI_CONSTANTS } from "~/constants/ui"
import type { PricingResponse } from "~/services/apiService/common/type"
import type { DisplaySiteData } from "~/types"
import { calculateModelPrice } from "~/utils/modelPricing"
import {
  filterModelsByProvider,
  type ProviderType,
} from "~/utils/modelProviders"

import type { AccountPricingContext } from "./useModelData"

interface UseFilteredModelsProps {
  pricingData: PricingResponse | null
  pricingContexts: AccountPricingContext[]
  currentAccount: DisplaySiteData | undefined
  selectedGroup: string
  searchTerm: string
  selectedProvider: ProviderType | "all"
  accountFilterAccountId?: string | null
}

/**
 * Derives filtered model list with pricing and helper metadata for UI controls.
 * Applies group, search, provider, and account filters on priced models.
 * @param params Hook input parameters.
 * @param params.pricingData Pricing response for a single account.
 * @param params.pricingContexts Pricing data across multiple accounts.
 * @param params.currentAccount Currently selected account for single-account mode.
 * @param params.selectedGroup User group to filter models by.
 * @param params.searchTerm Search keyword for model name/description.
 * @param params.selectedProvider Provider filter value or "all".
 * @param params.accountFilterAccountId Optional account id filter in all-accounts mode.
 * @returns Filtered models plus counts and available groups metadata.
 */
export function useFilteredModels(params: UseFilteredModelsProps) {
  const {
    pricingData,
    pricingContexts,
    currentAccount,
    selectedGroup,
    searchTerm,
    selectedProvider,
    accountFilterAccountId,
  } = params
  const modelsWithPricing = useMemo(() => {
    if (pricingContexts && pricingContexts.length > 0) {
      return pricingContexts.flatMap(({ account, pricing }) => {
        if (!pricing || !Array.isArray(pricing.data)) {
          return []
        }

        const exchangeRate =
          account.balance?.USD > 0
            ? account.balance.CNY / account.balance.USD
            : UI_CONSTANTS.EXCHANGE_RATE.DEFAULT

        return pricing.data.map((model) => {
          const calculatedPrice = calculateModelPrice(
            model,
            pricing.group_ratio || {},
            exchangeRate,
            selectedGroup === "all" ? "default" : selectedGroup,
          )

          return {
            model,
            calculatedPrice,
            account,
          }
        })
      })
    }

    if (!pricingData || !currentAccount || !Array.isArray(pricingData.data)) {
      return []
    }

    return pricingData.data.map((model) => {
      const exchangeRate =
        currentAccount.balance?.USD > 0
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
        account: currentAccount,
      }
    })
  }, [pricingContexts, pricingData, currentAccount, selectedGroup])

  const baseFilteredModels = useMemo(() => {
    let filtered = modelsWithPricing

    if (selectedGroup !== "all") {
      const groupSet = new Set<string>()

      if (pricingContexts && pricingContexts.length > 0) {
        pricingContexts.forEach((context) => {
          const ratio = context.pricing.group_ratio || {}
          Object.keys(ratio).forEach((key) => {
            if (key) {
              groupSet.add(key)
            }
          })
        })
      } else if (pricingData?.group_ratio) {
        Object.keys(pricingData.group_ratio).forEach((key) => {
          if (key) {
            groupSet.add(key)
          }
        })
      }

      if (groupSet.has(selectedGroup)) {
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
  }, [
    modelsWithPricing,
    selectedGroup,
    searchTerm,
    pricingData,
    pricingContexts,
  ])

  const accountFilteredBaseModels = useMemo(() => {
    if (!accountFilterAccountId) {
      return baseFilteredModels
    }

    return baseFilteredModels.filter(
      (item) => item.account?.id === accountFilterAccountId,
    )
  }, [baseFilteredModels, accountFilterAccountId])

  const filteredModels = useMemo(() => {
    if (selectedProvider === "all") {
      return accountFilteredBaseModels
    }
    return accountFilteredBaseModels.filter(
      (item) =>
        filterModelsByProvider([item.model], selectedProvider).length > 0,
    )
  }, [accountFilteredBaseModels, selectedProvider])

  const getProviderFilteredCount = (provider: ProviderType) => {
    return baseFilteredModels.filter(
      (item) => filterModelsByProvider([item.model], provider).length > 0,
    ).length
  }

  const availableGroups = useMemo(() => {
    const groupSet = new Set<string>()

    if (pricingContexts && pricingContexts.length > 0) {
      pricingContexts.forEach((context) => {
        const ratio = context.pricing.group_ratio || {}
        Object.keys(ratio).forEach((key) => {
          if (key) {
            groupSet.add(key)
          }
        })
      })
    } else if (pricingData?.group_ratio) {
      Object.keys(pricingData.group_ratio).forEach((key) => {
        if (key) {
          groupSet.add(key)
        }
      })
    }

    return Array.from(groupSet)
  }, [pricingContexts, pricingData])

  return {
    filteredModels,
    baseFilteredModels,
    getProviderFilteredCount,
    availableGroups,
  }
}
