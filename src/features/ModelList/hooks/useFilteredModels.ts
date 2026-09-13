import { useCallback, useMemo } from "react"

import { getModelBillingMode } from "~/features/ModelList/billingModes"
import { summarizeModelListGroupAccess } from "~/features/ModelList/groupAccessSummary"
import { deriveGroupAvailability } from "~/features/ModelList/groupAvailability"
import { resolveActiveModelGroupContext } from "~/features/ModelList/groupContext"
import { normalizeGroupNames } from "~/features/ModelList/groupNormalization"
import {
  createModelMetadataIndex,
  hasFilterableModelCapabilityMetadata,
  matchesModelCapabilityFilters,
  type ModelCapabilityMetadataCoverage,
  type ModelCapabilitySelectionValue,
} from "~/features/ModelList/modelCapabilityFilters"
import {
  getModelListSourceIdentityKey,
  supportsPricingDerivedBehavior,
  type ModelListItem,
} from "~/features/ModelList/modelListItems"
import {
  MODEL_MANAGEMENT_SOURCE_KINDS,
  type ModelManagementAccountSource,
  type ModelManagementSource,
} from "~/features/ModelList/modelManagementSources"
import { projectModelListMetadata } from "~/features/ModelList/modelMetadataProjection"
import {
  calculateModelListPrices,
  rankModelListPrices,
} from "~/features/ModelList/priceEvaluation"
import { type ModelListSortMode } from "~/features/ModelList/sortModes"
import { prepareModelListSources } from "~/features/ModelList/sourcePreparation"
import { type PricingResponse } from "~/services/modelList/pricingModel"
import type { PricingScenario } from "~/services/modelPricing/pricingPlan"
import type {
  ModelMetadata,
  ModelVendorCatalogEntry,
} from "~/services/models/modelMetadata/types"
import {
  MODEL_VENDOR_FILTER_VALUES,
  type ModelVendorFilterValue,
} from "~/services/models/modelVendor"

import {
  MODEL_LIST_BILLING_MODES,
  type ModelListBillingMode,
} from "../billingModes"
import { type ModelPriceComparisonWeights } from "../priceComparison"
import type { AccountPricingContext } from "./useModelData"

interface UseFilteredModelsProps {
  pricingData: PricingResponse | null
  pricingContexts: AccountPricingContext[]
  selectedSource: ModelManagementSource | null
  selectedBillingMode: ModelListBillingMode
  selectedGroups: string[]
  allAccountsExcludedGroupsByAccountId?: Record<string, string[]>
  searchTerm: string
  selectedProvider: ModelVendorFilterValue
  selectedModelCapabilities: ModelCapabilitySelectionValue[]
  modelMetadata: ModelMetadata[]
  sortMode: ModelListSortMode
  priceComparisonWeights: ModelPriceComparisonWeights
  pricingScenario?: PricingScenario
  isPriceComparisonActive?: boolean
  showRealPrice: boolean
  accountFilterAccountIds?: string[]
}

export type CountedModelVendorCatalogEntry = ModelVendorCatalogEntry & {
  count: number
}

/** Compares stable vendor keys without locale-dependent collation. */
function compareVendorKeys(left: string, right: string) {
  return left < right ? -1 : left > right ? 1 : 0
}

/** Derives tab entries and counts from rows that passed every base filter. */
function deriveVendorCatalog(
  items: readonly Pick<ModelListItem, "resolvedVendor">[],
): CountedModelVendorCatalogEntry[] {
  const entriesByKey = new Map<string, CountedModelVendorCatalogEntry>()

  for (const item of items) {
    const vendor = item.resolvedVendor
    if (vendor.state !== "resolved") continue

    const existing = entriesByKey.get(vendor.key)
    if (existing) {
      existing.count += 1
      continue
    }

    entriesByKey.set(
      vendor.key,
      vendor.kind === "known"
        ? {
            kind: "known",
            key: vendor.key,
            knownId: vendor.knownId,
            label: vendor.label,
            count: 1,
          }
        : {
            kind: "custom",
            key: vendor.key,
            label: vendor.label,
            count: 1,
          },
    )
  }

  return Array.from(entriesByKey.values()).sort(
    (left, right) =>
      right.count - left.count || compareVendorKeys(left.key, right.key),
  )
}

/** Counts rows that passed every base filter but have no resolved vendor. */
function deriveUnclassifiedVendorCount(
  items: readonly Pick<ModelListItem, "resolvedVendor">[],
): number {
  return items.filter((item) => item.resolvedVendor.state === "unknown").length
}

/** Clamps a stored selection against the catalog available this render. */
function resolveEffectiveSelectedVendor(
  selectedVendor: ModelVendorFilterValue,
  catalog: readonly CountedModelVendorCatalogEntry[],
  unclassifiedVendorCount: number,
): ModelVendorFilterValue {
  if (selectedVendor === MODEL_VENDOR_FILTER_VALUES.All) {
    return selectedVendor
  }
  if (selectedVendor === MODEL_VENDOR_FILTER_VALUES.Unclassified) {
    return unclassifiedVendorCount > 0
      ? selectedVendor
      : MODEL_VENDOR_FILTER_VALUES.All
  }

  return catalog.some((entry) => entry.key === selectedVendor)
    ? selectedVendor
    : MODEL_VENDOR_FILTER_VALUES.All
}

/** Applies only an already-clamped vendor selection. */
function filterModelsByVendor<T extends Pick<ModelListItem, "resolvedVendor">>(
  items: T[],
  selectedVendor: ModelVendorFilterValue,
) {
  if (selectedVendor === MODEL_VENDOR_FILTER_VALUES.All) return items
  if (selectedVendor === MODEL_VENDOR_FILTER_VALUES.Unclassified) {
    return items.filter((item) => item.resolvedVendor.state === "unknown")
  }
  return items.filter(
    (item) =>
      item.resolvedVendor.state === "resolved" &&
      item.resolvedVendor.key === selectedVendor,
  )
}

type FilterOverrides = Partial<
  Pick<
    UseFilteredModelsProps,
    | "searchTerm"
    | "sortMode"
    | "selectedBillingMode"
    | "selectedGroups"
    | "selectedModelCapabilities"
  >
>

/**
 * Derives filtered model list with pricing and helper metadata for UI controls.
 * Applies group, search, provider, and account filters on priced models.
 * @param params Hook input parameters.
 * @param params.pricingData Pricing response for a single account.
 * @param params.pricingContexts Pricing data across multiple accounts.
 * @param params.selectedSource Currently selected model-management source.
 * @param params.selectedBillingMode Active billing-mode filter value.
 * @param params.selectedGroups Candidate user groups used for filtering/comparison.
 * @param params.searchTerm Search keyword for request/display name or description.
 * @param params.selectedProvider Provider filter value.
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
    allAccountsExcludedGroupsByAccountId = {},
    searchTerm,
    selectedProvider,
    selectedModelCapabilities,
    modelMetadata,
    sortMode,
    priceComparisonWeights,
    pricingScenario,
    isPriceComparisonActive,
    showRealPrice,
    accountFilterAccountIds = [],
  } = params

  const modelMetadataIndex = useMemo(
    () => createModelMetadataIndex(modelMetadata),
    [modelMetadata],
  )
  const supportsModelCapabilityFilter = useMemo(
    () => hasFilterableModelCapabilityMetadata(modelMetadata),
    [modelMetadata],
  )

  const preparedSources = useMemo(
    () =>
      prepareModelListSources({ pricingContexts, pricingData, selectedSource }),
    [pricingContexts, pricingData, selectedSource],
  )

  const usesAccountContexts = pricingContexts.length > 0
  const selectedAccountId =
    selectedSource?.kind === MODEL_MANAGEMENT_SOURCE_KINDS.ACCOUNT
      ? selectedSource.account.id
      : undefined
  const {
    isGroupAccessAuthoritative,
    singleSourceGroupRatios,
    authoritativeGroupAccessByAccountId,
  } = useMemo(
    () =>
      summarizeModelListGroupAccess({
        sources: preparedSources,
        usesAccountContexts,
        selectedAccountId,
      }),
    [preparedSources, usesAccountContexts, selectedAccountId],
  )
  const rawModelItems = useMemo(
    () =>
      projectModelListMetadata(
        preparedSources.flatMap((source) => source.items),
        modelMetadataIndex,
      ),
    [preparedSources, modelMetadataIndex],
  )

  const availableGroups = useMemo(() => {
    if (
      !selectedSource?.capabilities.supportsGroupFiltering ||
      selectedSource.kind === MODEL_MANAGEMENT_SOURCE_KINDS.ALL_ACCOUNTS
    ) {
      return []
    }

    const groupSet = new Set<string>()

    rawModelItems.forEach((item) => {
      item.groupContext.usableGroups.forEach((group) => groupSet.add(group))
    })

    return Array.from(groupSet)
  }, [
    rawModelItems,
    selectedSource?.capabilities.supportsGroupFiltering,
    selectedSource?.kind,
  ])

  const {
    availableGroupsBySourceId,
    availableAccountGroupsByAccountId,
    availableAccountGroupOptionsByAccountId,
  } = useMemo(() => {
    const supportsAllAccountsGroups =
      selectedSource?.capabilities.supportsGroupFiltering &&
      selectedSource.kind === MODEL_MANAGEMENT_SOURCE_KINDS.ALL_ACCOUNTS

    return deriveGroupAvailability(
      supportsAllAccountsGroups
        ? rawModelItems.flatMap((item) =>
            item.source.kind === MODEL_MANAGEMENT_SOURCE_KINDS.ACCOUNT
              ? [
                  {
                    sourceId: getModelListSourceIdentityKey(item),
                    accountId: item.source.account.id,
                    usableGroups: item.groupContext.usableGroups,
                    groupRatios: item.groupRatios,
                  },
                ]
              : [],
          )
        : [],
    )
  }, [
    rawModelItems,
    selectedSource?.capabilities.supportsGroupFiltering,
    selectedSource?.kind,
  ])

  const includedAllAccountsGroupsBySourceId = useMemo(() => {
    if (selectedSource?.kind !== MODEL_MANAGEMENT_SOURCE_KINDS.ALL_ACCOUNTS) {
      return {}
    }

    return Object.fromEntries(
      rawModelItems.flatMap((item) => {
        if (item.source.kind !== MODEL_MANAGEMENT_SOURCE_KINDS.ACCOUNT) {
          return []
        }

        const sourceId = getModelListSourceIdentityKey(item)
        const groups = availableGroupsBySourceId[sourceId] ?? []
        const excludedGroups = new Set(
          normalizeGroupNames(
            allAccountsExcludedGroupsByAccountId[item.source.account.id] ?? [],
          ),
        )

        return [
          [sourceId, groups.filter((group) => !excludedGroups.has(group))],
        ]
      }),
    ) as Record<string, string[]>
  }, [
    allAccountsExcludedGroupsByAccountId,
    availableGroupsBySourceId,
    rawModelItems,
    selectedSource?.kind,
  ])

  const getGroupCandidatesForRawItem = useCallback(
    (
      item: ModelListItem,
      groups: string[] = selectedGroups,
    ): string[] | undefined => {
      if (!item.source.capabilities.supportsGroupFiltering) {
        return undefined
      }

      if (
        selectedSource?.kind === MODEL_MANAGEMENT_SOURCE_KINDS.ALL_ACCOUNTS &&
        item.source.kind === MODEL_MANAGEMENT_SOURCE_KINDS.ACCOUNT
      ) {
        if (item.groupContext.usableGroups.length === 0) {
          return undefined
        }

        return (
          includedAllAccountsGroupsBySourceId[
            getModelListSourceIdentityKey(item)
          ] ?? []
        )
      }

      const selected = normalizeGroupNames(groups)
      return selected.length > 0 ? selected : undefined
    },
    [includedAllAccountsGroupsBySourceId, selectedGroups, selectedSource?.kind],
  )

  const getBaseFilteredRawModels = useCallback(
    (overrides: FilterOverrides = {}) => {
      let filtered = rawModelItems
      const nextSearchTerm = overrides.searchTerm ?? searchTerm
      const nextSelectedBillingMode =
        overrides.selectedBillingMode ?? selectedBillingMode
      const nextSelectedGroups = overrides.selectedGroups ?? selectedGroups
      const nextSelectedModelCapabilities =
        overrides.selectedModelCapabilities ?? selectedModelCapabilities

      if (nextSearchTerm) {
        const searchLower = nextSearchTerm.toLowerCase()
        filtered = filtered.filter(
          (item) =>
            item.model.model_name.toLowerCase().includes(searchLower) ||
            item.model.display_name?.toLowerCase().includes(searchLower) ||
            item.model.model_description?.toLowerCase().includes(searchLower) ||
            false,
        )
      }

      filtered = filtered.filter((item) => {
        if (!supportsPricingDerivedBehavior(item)) {
          return true
        }

        const candidates = getGroupCandidatesForRawItem(
          item,
          nextSelectedGroups,
        )
        if (candidates === undefined) {
          return true
        }

        return (
          resolveActiveModelGroupContext({
            context: item.groupContext,
            candidateGroups: candidates,
          }).activeUsableGroups.length > 0
        )
      })

      if (nextSelectedBillingMode !== MODEL_LIST_BILLING_MODES.ALL) {
        filtered = filtered.filter(
          (item) =>
            !supportsPricingDerivedBehavior(item) ||
            getModelBillingMode(item.model.quota_type) ===
              nextSelectedBillingMode,
        )
      }

      if (
        supportsModelCapabilityFilter &&
        nextSelectedModelCapabilities.length > 0
      ) {
        filtered = filtered.filter((item) =>
          matchesModelCapabilityFilters({
            metadata: item.modelMetadata,
            filters: nextSelectedModelCapabilities,
          }),
        )
      }

      return filtered
    },
    [
      getGroupCandidatesForRawItem,
      rawModelItems,
      searchTerm,
      selectedBillingMode,
      selectedModelCapabilities,
      selectedGroups,
      supportsModelCapabilityFilter,
    ],
  )

  const baseFilteredRawModels = useMemo(
    () => getBaseFilteredRawModels(),
    [getBaseFilteredRawModels],
  )

  const getAccountFilteredRawModels = useCallback(
    (rawItems: ModelListItem[]) => {
      if (
        selectedSource?.kind !== MODEL_MANAGEMENT_SOURCE_KINDS.ALL_ACCOUNTS ||
        accountFilterAccountIds.length === 0
      ) {
        return rawItems
      }

      const selectedAccountIds = new Set(accountFilterAccountIds)

      return rawItems.filter(
        (item) =>
          item.source.kind !== MODEL_MANAGEMENT_SOURCE_KINDS.ACCOUNT ||
          selectedAccountIds.has(item.source.account.id),
      )
    },
    [accountFilterAccountIds, selectedSource?.kind],
  )

  const accountFilteredBaseRawModels = useMemo(
    () => getAccountFilteredRawModels(baseFilteredRawModels),
    [baseFilteredRawModels, getAccountFilteredRawModels],
  )

  // Filter previews and metadata counts need row identities, never quotes.
  const getFilteredModels = useCallback(
    (overrides: FilterOverrides = {}) => {
      const baseModels = getAccountFilteredRawModels(
        getBaseFilteredRawModels(overrides),
      )

      const effectiveVendor = resolveEffectiveSelectedVendor(
        selectedProvider,
        deriveVendorCatalog(baseModels),
        deriveUnclassifiedVendorCount(baseModels),
      )
      return filterModelsByVendor(baseModels, effectiveVendor)
    },
    [getAccountFilteredRawModels, getBaseFilteredRawModels, selectedProvider],
  )

  const getFilteredResultCount = useCallback(
    (overrides: FilterOverrides = {}) => getFilteredModels(overrides).length,
    [getFilteredModels],
  )

  const modelCapabilityMetadataCoverage =
    useMemo<ModelCapabilityMetadataCoverage>(() => {
      const modelsBeforeCapabilityFilters = getFilteredModels({
        selectedModelCapabilities: [],
      })
      const matched = modelsBeforeCapabilityFilters.filter(
        (item) => !!item.modelMetadata,
      ).length
      const total = modelsBeforeCapabilityFilters.length

      return {
        matched,
        total,
        unmatched: total - matched,
      }
    }, [getFilteredModels])

  const accountSummaryCountsByAccountId = useMemo(() => {
    if (selectedSource?.kind !== MODEL_MANAGEMENT_SOURCE_KINDS.ALL_ACCOUNTS) {
      return new Map<string, number>()
    }

    // In all-accounts mode rawModelItems are built only from pricingContexts,
    // so the filtered summary rows are account-backed by construction.
    const accountSummaryItems = baseFilteredRawModels as Array<
      ModelListItem & { source: ModelManagementAccountSource }
    >
    const countMap = new Map<string, number>()

    accountSummaryItems.forEach((item) => {
      if (!item.source.capabilities.supportsAccountSummary) {
        return
      }

      const accountId = item.source.account.id
      countMap.set(accountId, (countMap.get(accountId) ?? 0) + 1)
    })

    return countMap
  }, [baseFilteredRawModels, selectedSource?.kind])

  const baseFilteredModels = useMemo(
    () =>
      calculateModelListPrices({
        rawItems: accountFilteredBaseRawModels,
        getGroupCandidates: getGroupCandidatesForRawItem,
        showRealPrice,
        priceComparisonWeights,
        pricingScenario,
        isPriceComparisonActive,
      }),
    [
      accountFilteredBaseRawModels,
      getGroupCandidatesForRawItem,
      priceComparisonWeights,
      pricingScenario,
      isPriceComparisonActive,
      showRealPrice,
    ],
  )

  const vendorCatalog = useMemo(
    () => deriveVendorCatalog(baseFilteredModels),
    [baseFilteredModels],
  )
  const unclassifiedVendorCount = useMemo(
    () => deriveUnclassifiedVendorCount(baseFilteredModels),
    [baseFilteredModels],
  )
  const effectiveSelectedVendor = useMemo(
    () =>
      resolveEffectiveSelectedVendor(
        selectedProvider,
        vendorCatalog,
        unclassifiedVendorCount,
      ),
    [selectedProvider, unclassifiedVendorCount, vendorCatalog],
  )
  const shouldRepairSelectedVendor =
    effectiveSelectedVendor !== selectedProvider

  const filteredModels = useMemo(() => {
    const vendorFilteredModels = filterModelsByVendor(
      baseFilteredModels,
      effectiveSelectedVendor,
    )

    return rankModelListPrices({
      items: vendorFilteredModels,
      showRealPrice,
      priceComparisonWeights,
      sortMode,
      compareAcrossSources:
        selectedSource?.kind === MODEL_MANAGEMENT_SOURCE_KINDS.ALL_ACCOUNTS,
    })
  }, [
    baseFilteredModels,
    effectiveSelectedVendor,
    priceComparisonWeights,
    selectedSource?.kind,
    showRealPrice,
    sortMode,
  ])

  return {
    filteredModels,
    accountSummaryCountsByAccountId,
    baseFilteredModels,
    vendorCatalog,
    unclassifiedVendorCount,
    effectiveSelectedVendor,
    shouldRepairSelectedVendor,
    allVendorsFilteredCount: baseFilteredModels.length,
    getFilteredModels,
    getFilteredResultCount,
    modelCapabilityMetadataCoverage,
    isGroupAccessAuthoritative,
    singleSourceGroupRatios,
    authoritativeGroupAccessByAccountId,
    availableGroups,
    availableAccountGroupsByAccountId,
    availableAccountGroupOptionsByAccountId,
    supportsModelCapabilityFilter,
  }
}
