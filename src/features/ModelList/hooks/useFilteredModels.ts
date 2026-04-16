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

import {
  MODEL_LIST_BILLING_MODES,
  type ModelListBillingMode,
} from "../billingModes"
import type { AccountPricingContext } from "./useModelData"

interface UseFilteredModelsProps {
  pricingData: PricingResponse | null
  pricingContexts: AccountPricingContext[]
  selectedSource: ModelManagementSource | null
  selectedBillingMode: ModelListBillingMode
  selectedGroups: string[]
  searchTerm: string
  selectedProvider: ProviderType | "all"
  sortMode: ModelListSortMode
  showRealPrice: boolean
  accountFilterAccountIds?: string[]
}

type BillingMode = "token-based" | "per-call"

interface ComparablePriceKey {
  billingMode: BillingMode
  primary: number | null
  secondary: number | null
}

interface RawModelItem {
  model: PricingResponse["data"][number]
  source:
    | ReturnType<typeof createAccountSource>
    | Extract<NonNullable<ModelManagementSource>, { kind: "profile" }>
  groupRatios: Record<string, number>
  exchangeRate: number
}

export type CalculatedModelItem = {
  model: PricingResponse["data"][number]
  calculatedPrice: ReturnType<typeof calculateModelPrice>
  source:
    | ReturnType<typeof createAccountSource>
    | Extract<NonNullable<ModelManagementSource>, { kind: "profile" }>
  groupRatios: Record<string, number>
  effectiveGroup?: string
  hasAutoSelectedGroup?: boolean
  isLowestPrice?: boolean
}

const BILLING_MODE_ORDER: Record<BillingMode, number> = {
  "token-based": 0,
  "per-call": 1,
}

/** Returns true when the value is a finite number. */
function isFiniteNumber(value: number | null | undefined): value is number {
  return typeof value === "number" && Number.isFinite(value)
}

/** Resolves the exchange rate for account-backed prices. */
function getSourceExchangeRate(item: Pick<CalculatedModelItem, "source">) {
  if (item.source.kind !== "account") {
    return 1
  }

  const { USD = 0, CNY = 0 } = item.source.account.balance ?? {}
  return USD > 0 ? CNY / USD : UI_CONSTANTS.EXCHANGE_RATE.DEFAULT
}

/** Builds a normalized price key used for comparisons and sorting. */
function getComparablePriceKey(
  item: Pick<CalculatedModelItem, "model" | "calculatedPrice" | "source">,
  showRealPrice: boolean,
): ComparablePriceKey {
  if (isTokenBillingType(item.model.quota_type)) {
    const inputPrice = showRealPrice
      ? item.calculatedPrice.inputCNY
      : item.calculatedPrice.inputUSD
    const outputPrice = showRealPrice
      ? item.calculatedPrice.outputCNY
      : item.calculatedPrice.outputUSD

    return {
      billingMode: "token-based",
      primary: isFiniteNumber(inputPrice) ? inputPrice : null,
      secondary: isFiniteNumber(outputPrice) ? outputPrice : null,
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

/** Orders nullable numbers with finite values before missing ones. */
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

/** Compares normalized price keys in the requested sort direction. */
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

/** Creates a stable identifier for a calculated model item. */
function getModelItemKey(item: Pick<CalculatedModelItem, "model" | "source">) {
  const sourceId =
    item.source.kind === "account"
      ? item.source.account.id
      : item.source.profile.id

  return `${item.source.kind}:${sourceId}:${item.model.model_name}`
}

/** Returns the source label used for deterministic sorting. */
function getSourceSortLabel(item: CalculatedModelItem) {
  return item.source.kind === "account"
    ? item.source.account.name
    : item.source.profile.name
}

/** Adds non-empty model groups to the shared available-group set. */
function addAvailableGroups(
  target: Set<string>,
  model: PricingResponse["data"][number],
) {
  model.enable_groups.forEach((group) => {
    if (group) {
      target.add(group)
    }
  })
}

/** Resolves which groups should be evaluated for a raw model item. */
function resolveCandidateGroups(
  rawItem: RawModelItem,
  groupCandidates: string[],
  supportsGroupFiltering: boolean,
) {
  if (!supportsGroupFiltering) {
    return ["default"]
  }

  return rawItem.model.enable_groups.filter((group) =>
    groupCandidates.includes(group),
  )
}

/** Maps quota type values onto the model-list billing modes. */
function getModelBillingMode(quotaType: number): BillingMode {
  return isTokenBillingType(quotaType)
    ? MODEL_LIST_BILLING_MODES.TOKEN_BASED
    : MODEL_LIST_BILLING_MODES.PER_CALL
}

/** Picks the best priced calculated item across candidate groups. */
function resolveBestCalculatedItem(
  rawItem: RawModelItem,
  groupCandidates: string[],
  supportsGroupFiltering: boolean,
  showRealPrice: boolean,
): CalculatedModelItem | null {
  const candidateGroups = resolveCandidateGroups(
    rawItem,
    groupCandidates,
    supportsGroupFiltering,
  )

  if (supportsGroupFiltering && candidateGroups.length === 0) {
    return null
  }

  const groupsToEvaluate =
    candidateGroups.length > 0 ? candidateGroups : ["default"]

  let bestResult: CalculatedModelItem | null = null
  let bestKey: ComparablePriceKey | null = null

  groupsToEvaluate.forEach((group) => {
    const calculatedPrice = calculateModelPrice(
      rawItem.model,
      rawItem.groupRatios,
      rawItem.exchangeRate,
      group,
    )
    const candidateItem: CalculatedModelItem = {
      model: rawItem.model,
      calculatedPrice,
      source: rawItem.source,
      groupRatios: rawItem.groupRatios,
      effectiveGroup: supportsGroupFiltering ? group : undefined,
      hasAutoSelectedGroup: groupsToEvaluate.length > 1,
    }
    const candidateKey = getComparablePriceKey(candidateItem, showRealPrice)

    if (!bestResult || !bestKey) {
      bestResult = candidateItem
      bestKey = candidateKey
      return
    }

    if (comparePriceKeys(candidateKey, bestKey, 1) < 0) {
      bestResult = candidateItem
      bestKey = candidateKey
      return
    }

    if (
      comparePriceKeys(candidateKey, bestKey, 1) === 0 &&
      group.localeCompare(bestResult.effectiveGroup ?? "") < 0
    ) {
      bestResult = candidateItem
      bestKey = candidateKey
    }
  })

  return bestResult
}

/** Maps raw priced rows into calculated display rows for the current filters. */
function resolveCalculatedModels(params: {
  rawItems: RawModelItem[]
  groupCandidates: string[]
  supportsGroupFiltering: boolean
  showRealPrice: boolean
}) {
  const { rawItems, groupCandidates, supportsGroupFiltering, showRealPrice } =
    params

  return rawItems
    .map((item) =>
      resolveBestCalculatedItem(
        item,
        groupCandidates,
        supportsGroupFiltering,
        showRealPrice,
      ),
    )
    .filter((item): item is CalculatedModelItem => item !== null)
}

/**
 * Derives filtered model list with pricing and helper metadata for UI controls.
 * Applies group, search, provider, and account filters on priced models.
 * @param params Hook input parameters.
 * @param params.pricingData Pricing response for a single account.
 * @param params.pricingContexts Pricing data across multiple accounts.
 * @param params.selectedSource Currently selected model-management source.
 * @param params.selectedBillingMode Active billing-mode filter value.
 * @param params.selectedGroups Candidate user groups used for filtering/comparison.
 * @param params.searchTerm Search keyword for model name/description.
 * @param params.selectedProvider Provider filter value or "all".
 * @param params.accountFilterAccountIds Optional account id filters in all-accounts mode.
 * @returns Filtered models plus counts and available groups metadata.
 */
export function useFilteredModels(params: UseFilteredModelsProps) {
  const {
    pricingData,
    pricingContexts,
    selectedSource,
    selectedBillingMode,
    selectedGroups,
    searchTerm,
    selectedProvider,
    sortMode,
    showRealPrice,
    accountFilterAccountIds = [],
  } = params

  const rawModelItems = useMemo<RawModelItem[]>(() => {
    if (pricingContexts && pricingContexts.length > 0) {
      return pricingContexts.flatMap(({ account, pricing }) => {
        if (!pricing || !Array.isArray(pricing.data)) {
          return []
        }

        const exchangeRate =
          account.balance?.USD > 0
            ? account.balance.CNY / account.balance.USD
            : UI_CONSTANTS.EXCHANGE_RATE.DEFAULT

        return pricing.data.map((model) => ({
          model,
          source: createAccountSource(account),
          groupRatios: pricing.group_ratio ?? {},
          exchangeRate,
        }))
      })
    }

    if (!pricingData || !selectedSource || !Array.isArray(pricingData.data)) {
      return []
    }

    if (selectedSource.kind === "profile") {
      return pricingData.data.map((model) => ({
        model,
        source: selectedSource,
        groupRatios: {},
        exchangeRate: 1,
      }))
    }

    if (selectedSource.kind !== "account") {
      return []
    }

    const exchangeRate =
      selectedSource.account.balance?.USD > 0
        ? selectedSource.account.balance.CNY /
          selectedSource.account.balance.USD
        : UI_CONSTANTS.EXCHANGE_RATE.DEFAULT

    return pricingData.data.map((model) => ({
      model,
      source: selectedSource,
      groupRatios: pricingData.group_ratio ?? {},
      exchangeRate,
    }))
  }, [pricingContexts, pricingData, selectedSource])

  const availableGroups = useMemo(() => {
    if (!selectedSource?.capabilities.supportsGroupFiltering) {
      return []
    }

    const groupSet = new Set<string>()

    rawModelItems.forEach((item) => {
      Object.keys(item.groupRatios).forEach((key) => {
        if (key) {
          groupSet.add(key)
        }
      })
      addAvailableGroups(groupSet, item.model)
    })

    return Array.from(groupSet)
  }, [rawModelItems, selectedSource?.capabilities.supportsGroupFiltering])

  const effectiveGroupCandidates = useMemo(() => {
    if (!selectedSource?.capabilities.supportsGroupFiltering) {
      return ["default"]
    }

    const uniqueSelectedGroups = Array.from(
      new Set(selectedGroups.filter(Boolean)),
    )

    if (uniqueSelectedGroups.length > 0) {
      return uniqueSelectedGroups
    }

    return availableGroups.length > 0 ? availableGroups : ["default"]
  }, [
    availableGroups,
    selectedGroups,
    selectedSource?.capabilities.supportsGroupFiltering,
  ])

  const baseFilteredRawModels = useMemo(() => {
    let filtered = rawModelItems

    if (searchTerm) {
      const searchLower = searchTerm.toLowerCase()
      filtered = filtered.filter(
        (item) =>
          item.model.model_name.toLowerCase().includes(searchLower) ||
          item.model.model_description?.toLowerCase().includes(searchLower) ||
          false,
      )
    }

    const supportsGroupFiltering =
      selectedSource?.capabilities.supportsGroupFiltering ?? false

    if (supportsGroupFiltering) {
      filtered = filtered.filter(
        (item) =>
          resolveCandidateGroups(
            item,
            effectiveGroupCandidates,
            supportsGroupFiltering,
          ).length > 0,
      )
    }

    if (selectedBillingMode !== MODEL_LIST_BILLING_MODES.ALL) {
      filtered = filtered.filter(
        (item) =>
          getModelBillingMode(item.model.quota_type) === selectedBillingMode,
      )
    }

    return filtered
  }, [
    selectedBillingMode,
    effectiveGroupCandidates,
    rawModelItems,
    searchTerm,
    selectedSource?.capabilities.supportsGroupFiltering,
  ])

  const accountFilteredBaseRawModels = useMemo(() => {
    if (
      selectedSource?.kind !== "all-accounts" ||
      accountFilterAccountIds.length === 0
    ) {
      return baseFilteredRawModels
    }

    const selectedAccountIds = new Set(accountFilterAccountIds)

    return baseFilteredRawModels.filter(
      (item) =>
        item.source.kind !== "account" ||
        selectedAccountIds.has(item.source.account.id),
    )
  }, [accountFilterAccountIds, baseFilteredRawModels, selectedSource?.kind])

  const accountSummaryCountsByAccountId = useMemo(() => {
    if (selectedSource?.kind !== "all-accounts") {
      return new Map<string, number>()
    }

    // In all-accounts mode rawModelItems are built only from pricingContexts,
    // so the filtered summary rows are account-backed by construction.
    const accountSummaryItems = baseFilteredRawModels as Array<
      RawModelItem & { source: ReturnType<typeof createAccountSource> }
    >
    const countMap = new Map<string, number>()

    accountSummaryItems.forEach((item) => {
      const accountId = item.source.account.id
      countMap.set(accountId, (countMap.get(accountId) ?? 0) + 1)
    })

    return countMap
  }, [baseFilteredRawModels, selectedSource?.kind])

  const baseFilteredModels = useMemo(
    () =>
      resolveCalculatedModels({
        rawItems: accountFilteredBaseRawModels,
        groupCandidates: effectiveGroupCandidates,
        supportsGroupFiltering:
          selectedSource?.capabilities.supportsGroupFiltering ?? false,
        showRealPrice,
      }),
    [
      accountFilteredBaseRawModels,
      effectiveGroupCandidates,
      selectedSource?.capabilities.supportsGroupFiltering,
      showRealPrice,
    ],
  )

  const filteredModels = useMemo(() => {
    const providerFilteredModels =
      selectedProvider === "all"
        ? baseFilteredModels
        : baseFilteredModels.filter(
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

        const effectiveGroupComparison = (
          a.item.effectiveGroup ?? ""
        ).localeCompare(b.item.effectiveGroup ?? "")
        if (effectiveGroupComparison !== 0) {
          return effectiveGroupComparison
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
    baseFilteredModels,
    selectedProvider,
    selectedSource?.kind,
    showRealPrice,
    sortMode,
  ])

  const getProviderFilteredCount = (provider: ProviderType) => {
    return baseFilteredModels.filter(
      (item) => filterModelsByProvider([item.model], provider).length > 0,
    ).length
  }

  return {
    filteredModels,
    accountSummaryCountsByAccountId,
    baseFilteredModels,
    allProvidersFilteredCount: baseFilteredModels.length,
    getProviderFilteredCount,
    availableGroups,
  }
}
