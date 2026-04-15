import { useMemo } from "react"

import { UI_CONSTANTS } from "~/constants/ui"
import {
  createAccountSource,
  type ModelManagementSource,
} from "~/features/ModelList/modelManagementSources"
import {
  MODEL_LIST_SORT_MODES,
  type ModelListSortMode,
} from "~/features/ModelList/sortModes"
import type { PricingResponse } from "~/services/apiService/common/type"
import {
  calculateModelPrice,
  isTokenBillingType,
} from "~/services/models/utils/modelPricing"
import {
  filterModelsByProvider,
  type ProviderType,
} from "~/services/models/utils/modelProviders"

import type { AccountPricingContext } from "./useModelData"

interface UseFilteredModelsProps {
  pricingData: PricingResponse | null
  pricingContexts: AccountPricingContext[]
  selectedSource: ModelManagementSource | null
  selectedGroup: string
  searchTerm: string
  selectedProvider: ProviderType | "all"
  sortMode: ModelListSortMode
  showRealPrice: boolean
  accountFilterAccountId?: string | null
}

type BillingMode = "token-based" | "per-call"

interface ComparablePriceKey {
  billingMode: BillingMode
  primary: number | null
  secondary: number | null
}

export type CalculatedModelItem = {
  model: PricingResponse["data"][number]
  calculatedPrice: ReturnType<typeof calculateModelPrice>
  source:
    | ReturnType<typeof createAccountSource>
    | Extract<NonNullable<ModelManagementSource>, { kind: "profile" }>
  isLowestPrice?: boolean
}

const BILLING_MODE_ORDER: Record<BillingMode, number> = {
  "token-based": 0,
  "per-call": 1,
}

/**
 *
 */
function isFiniteNumber(value: number | null | undefined): value is number {
  return typeof value === "number" && Number.isFinite(value)
}

/**
 *
 */
function getSourceExchangeRate(item: CalculatedModelItem) {
  if (item.source.kind !== "account") {
    return 1
  }

  const { USD = 0, CNY = 0 } = item.source.account.balance ?? {}
  return USD > 0 ? CNY / USD : UI_CONSTANTS.EXCHANGE_RATE.DEFAULT
}

/**
 *
 */
function getComparablePriceKey(
  item: CalculatedModelItem,
  showRealPrice: boolean,
): ComparablePriceKey {
  if (isTokenBillingType(item.model.quota_type)) {
    return {
      billingMode: "token-based",
      primary: isFiniteNumber(
        showRealPrice
          ? item.calculatedPrice.inputCNY
          : item.calculatedPrice.inputUSD,
      )
        ? showRealPrice
          ? item.calculatedPrice.inputCNY
          : item.calculatedPrice.inputUSD
        : null,
      secondary: isFiniteNumber(
        showRealPrice
          ? item.calculatedPrice.outputCNY
          : item.calculatedPrice.outputUSD,
      )
        ? showRealPrice
          ? item.calculatedPrice.outputCNY
          : item.calculatedPrice.outputUSD
        : null,
    }
  }

  const perCallPrice = item.calculatedPrice.perCallPrice
  const exchangeRate = showRealPrice ? getSourceExchangeRate(item) : 1

  if (typeof perCallPrice === "number") {
    const normalized = perCallPrice * exchangeRate
    return {
      billingMode: "per-call",
      primary: isFiniteNumber(normalized) ? normalized : null,
      secondary: isFiniteNumber(normalized) ? normalized : null,
    }
  }

  if (perCallPrice && typeof perCallPrice === "object") {
    const input = perCallPrice.input * exchangeRate
    const output = perCallPrice.output * exchangeRate
    return {
      billingMode: "per-call",
      primary: isFiniteNumber(input) ? input : null,
      secondary: isFiniteNumber(output) ? output : null,
    }
  }

  return {
    billingMode: "per-call",
    primary: null,
    secondary: null,
  }
}

/**
 *
 */
function compareNullableNumber(a: number | null, b: number | null) {
  const aValid = isFiniteNumber(a)
  const bValid = isFiniteNumber(b)

  if (aValid && bValid) {
    return a - b
  }

  if (aValid) {
    return -1
  }

  if (bValid) {
    return 1
  }

  return 0
}

/**
 *
 */
function comparePriceKeys(
  a: ComparablePriceKey,
  b: ComparablePriceKey,
  direction: 1 | -1,
) {
  const primaryComparison = compareNullableNumber(a.primary, b.primary)
  if (primaryComparison !== 0) {
    return primaryComparison * direction
  }

  const secondaryComparison = compareNullableNumber(a.secondary, b.secondary)
  if (secondaryComparison !== 0) {
    return secondaryComparison * direction
  }

  return 0
}

/**
 *
 */
function getModelItemKey(item: CalculatedModelItem) {
  const sourceId =
    item.source.kind === "account"
      ? item.source.account.id
      : item.source.profile.id

  return `${item.source.kind}:${sourceId}:${item.model.model_name}`
}

/**
 *
 */
function getSourceSortLabel(item: CalculatedModelItem) {
  return item.source.kind === "account"
    ? item.source.account.name
    : item.source.profile.name
}

/**
 * Derives filtered model list with pricing and helper metadata for UI controls.
 * Applies group, search, provider, and account filters on priced models.
 * @param params Hook input parameters.
 * @param params.pricingData Pricing response for a single account.
 * @param params.pricingContexts Pricing data across multiple accounts.
 * @param params.selectedSource Currently selected model-management source.
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
    selectedSource,
    selectedGroup,
    searchTerm,
    selectedProvider,
    sortMode,
    showRealPrice,
    accountFilterAccountId,
  } = params
  const modelGroup = useMemo(
    () => (selectedGroup === "all" ? "default" : selectedGroup),
    [selectedGroup],
  )

  const modelsWithPricing = useMemo<CalculatedModelItem[]>(() => {
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
            modelGroup,
          )

          return {
            model,
            calculatedPrice,
            source: createAccountSource(account),
          }
        })
      })
    }

    if (!pricingData || !selectedSource || !Array.isArray(pricingData.data)) {
      return []
    }

    if (selectedSource.kind === "profile") {
      return pricingData.data.map((model) => ({
        model,
        calculatedPrice: calculateModelPrice(model, {}, 1, modelGroup),
        source: selectedSource,
      }))
    }

    if (selectedSource.kind !== "account") {
      return []
    }

    return pricingData.data.map((model) => {
      const exchangeRate =
        selectedSource.account.balance?.USD > 0
          ? selectedSource.account.balance.CNY /
            selectedSource.account.balance.USD
          : UI_CONSTANTS.EXCHANGE_RATE.DEFAULT

      const calculatedPrice = calculateModelPrice(
        model,
        pricingData.group_ratio || {},
        exchangeRate,
        modelGroup,
      )

      return {
        model,
        calculatedPrice,
        source: selectedSource,
      }
    })
  }, [modelGroup, pricingContexts, pricingData, selectedSource])

  const baseFilteredModels = useMemo(() => {
    let filtered = modelsWithPricing

    const supportsGroupFiltering =
      selectedSource?.capabilities.supportsGroupFiltering ?? false

    if (supportsGroupFiltering && selectedGroup !== "all") {
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
    selectedSource?.capabilities.supportsGroupFiltering,
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
      (item) =>
        item.source.kind !== "account" ||
        item.source.account.id === accountFilterAccountId,
    )
  }, [baseFilteredModels, accountFilterAccountId])

  const filteredModels = useMemo(() => {
    const providerFilteredModels =
      selectedProvider === "all"
        ? accountFilteredBaseModels
        : accountFilteredBaseModels.filter(
            (item) =>
              filterModelsByProvider([item.model], selectedProvider).length > 0,
          )

    const priceKeys = new Map<string, ComparablePriceKey>()
    providerFilteredModels.forEach((item) => {
      priceKeys.set(
        getModelItemKey(item),
        getComparablePriceKey(item, showRealPrice),
      )
    })

    const lowestPriceKeys = new Set<string>()
    if (selectedSource?.kind === "all-accounts") {
      const groups = new Map<string, CalculatedModelItem[]>()

      providerFilteredModels.forEach((item) => {
        const priceKey = priceKeys.get(getModelItemKey(item))
        if (!priceKey) {
          return
        }

        const groupKey = `${item.model.model_name}:${priceKey.billingMode}`
        const group = groups.get(groupKey) ?? []
        group.push(item)
        groups.set(groupKey, group)
      })

      groups.forEach((groupItems) => {
        const comparableItems = groupItems.filter((item) => {
          const priceKey = priceKeys.get(getModelItemKey(item))
          return (
            priceKey &&
            (isFiniteNumber(priceKey.primary) ||
              isFiniteNumber(priceKey.secondary))
          )
        })

        if (comparableItems.length === 0) {
          return
        }

        let bestItem = comparableItems[0]
        let bestPriceKey = priceKeys.get(getModelItemKey(bestItem))

        comparableItems.slice(1).forEach((item) => {
          const itemPriceKey = priceKeys.get(getModelItemKey(item))
          if (!bestPriceKey || !itemPriceKey) {
            return
          }

          if (comparePriceKeys(itemPriceKey, bestPriceKey, 1) < 0) {
            bestItem = item
            bestPriceKey = itemPriceKey
          }
        })

        if (!bestPriceKey) {
          return
        }

        const resolvedBestPriceKey = bestPriceKey
        comparableItems.forEach((item) => {
          const itemPriceKey = priceKeys.get(getModelItemKey(item))
          if (
            itemPriceKey &&
            comparePriceKeys(itemPriceKey, resolvedBestPriceKey, 1) === 0
          ) {
            lowestPriceKeys.add(getModelItemKey(item))
          }
        })
      })
    }

    const direction = sortMode === MODEL_LIST_SORT_MODES.PRICE_DESC ? -1 : 1

    const sortedWithIndices = providerFilteredModels
      .map((item, index) => ({
        item,
        index,
        itemKey: getModelItemKey(item),
        priceKey: priceKeys.get(getModelItemKey(item))!,
      }))
      .sort((a, b) => {
        if (sortMode === MODEL_LIST_SORT_MODES.DEFAULT) {
          return a.index - b.index
        }

        if (sortMode === MODEL_LIST_SORT_MODES.MODEL_CHEAPEST_FIRST) {
          const modelNameComparison = a.item.model.model_name.localeCompare(
            b.item.model.model_name,
          )
          if (modelNameComparison !== 0) {
            return modelNameComparison
          }
        }

        const billingModeComparison =
          BILLING_MODE_ORDER[a.priceKey.billingMode] -
          BILLING_MODE_ORDER[b.priceKey.billingMode]
        if (billingModeComparison !== 0) {
          return billingModeComparison
        }

        const priceComparison = comparePriceKeys(
          a.priceKey,
          b.priceKey,
          direction,
        )
        if (priceComparison !== 0) {
          return priceComparison
        }

        const modelNameComparison = a.item.model.model_name.localeCompare(
          b.item.model.model_name,
        )
        if (modelNameComparison !== 0) {
          return modelNameComparison
        }

        const sourceLabelComparison = getSourceSortLabel(a.item).localeCompare(
          getSourceSortLabel(b.item),
        )
        if (sourceLabelComparison !== 0) {
          return sourceLabelComparison
        }

        if (a.itemKey !== b.itemKey) {
          return a.itemKey.localeCompare(b.itemKey)
        }

        return a.index - b.index
      })

    return sortedWithIndices.map(({ item, itemKey }) => ({
      ...item,
      isLowestPrice: lowestPriceKeys.has(itemKey),
    }))
  }, [
    accountFilteredBaseModels,
    selectedProvider,
    selectedSource?.kind,
    showRealPrice,
    sortMode,
  ])

  const getProviderFilteredCount = (provider: ProviderType) => {
    return accountFilteredBaseModels.filter(
      (item) => filterModelsByProvider([item.model], provider).length > 0,
    ).length
  }

  const availableGroups = useMemo(() => {
    if (!selectedSource?.capabilities.supportsGroupFiltering) {
      return []
    }

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
  }, [
    pricingContexts,
    pricingData,
    selectedSource?.capabilities.supportsGroupFiltering,
  ])

  return {
    filteredModels,
    baseFilteredModels,
    allProvidersFilteredCount: accountFilteredBaseModels.length,
    getProviderFilteredCount,
    availableGroups,
  }
}
