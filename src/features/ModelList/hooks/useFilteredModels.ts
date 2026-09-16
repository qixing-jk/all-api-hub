import { useCallback, useMemo } from "react"

import { summarizeModelListGroupAccess } from "~/features/ModelList/groupAccessSummary"
import { deriveGroupAvailability } from "~/features/ModelList/groupAvailability"
import { normalizeGroupNames } from "~/features/ModelList/groupNormalization"
import {
  createModelMetadataIndex,
  hasFilterableModelCapabilityMetadata,
  type ModelCapabilitySelectionValue,
} from "~/features/ModelList/modelCapabilityFilters"
import {
  createModelListFilterPipeline,
  projectModelListVendorFilter,
} from "~/features/ModelList/modelFiltering"
import {
  getModelListSourceIdentityKey,
  type ModelListItem,
} from "~/features/ModelList/modelListItems"
import {
  MODEL_MANAGEMENT_SOURCE_KINDS,
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
import type { ModelMetadata } from "~/services/models/modelMetadata/types"
import { type ModelVendorFilterValue } from "~/services/models/modelVendor"

import { type ModelListBillingMode } from "../billingModes"
import { type ModelPriceComparisonWeights } from "../priceComparison"
import type { AccountPricingContext } from "./useModelData"

const EMPTY_EXCLUDED_GROUPS: Record<string, string[]> = {}
const EMPTY_ACCOUNT_IDS: string[] = []

interface UseFilteredModelsProps {
  showUnavailableModels?: boolean
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
    showUnavailableModels = false,
    pricingData,
    pricingContexts,
    selectedSource,
    selectedBillingMode,
    selectedGroups,
    allAccountsExcludedGroupsByAccountId = EMPTY_EXCLUDED_GROUPS,
    searchTerm,
    selectedProvider,
    selectedModelCapabilities,
    modelMetadata,
    sortMode,
    priceComparisonWeights,
    pricingScenario,
    isPriceComparisonActive,
    showRealPrice,
    accountFilterAccountIds = EMPTY_ACCOUNT_IDS,
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

  const isAllAccounts =
    selectedSource?.kind === MODEL_MANAGEMENT_SOURCE_KINDS.ALL_ACCOUNTS
  const filterPipeline = useMemo(
    () =>
      createModelListFilterPipeline({
        items: rawModelItems,
        filters: {
          showUnavailableModels,
          searchTerm,
          selectedBillingMode,
          selectedGroups,
          selectedModelCapabilities,
        },
        supportsModelCapabilityFilter,
        isAllAccounts,
        accountFilterAccountIds,
        getGroupCandidates: getGroupCandidatesForRawItem,
      }),
    [
      rawModelItems,
      showUnavailableModels,
      searchTerm,
      selectedBillingMode,
      selectedGroups,
      selectedModelCapabilities,
      supportsModelCapabilityFilter,
      isAllAccounts,
      accountFilterAccountIds,
      getGroupCandidatesForRawItem,
    ],
  )

  const { accountFilteredBaseRawModels, accountSummaryCountsByAccountId } =
    filterPipeline
  const {
    getFilteredModels,
    getFilteredResultCount,
    modelCapabilityMetadataCoverage,
  } = useMemo(
    () => filterPipeline.forVendor(selectedProvider),
    [filterPipeline, selectedProvider],
  )

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

  const {
    items: vendorFilteredModels,
    vendorCatalog,
    unclassifiedVendorCount,
    effectiveSelectedVendor,
    shouldRepairSelectedVendor,
  } = useMemo(
    () => projectModelListVendorFilter(baseFilteredModels, selectedProvider),
    [baseFilteredModels, selectedProvider],
  )

  const filteredModels = useMemo(() => {
    return rankModelListPrices({
      items: vendorFilteredModels,
      showRealPrice,
      priceComparisonWeights,
      sortMode,
      compareAcrossSources:
        selectedSource?.kind === MODEL_MANAGEMENT_SOURCE_KINDS.ALL_ACCOUNTS,
    })
  }, [
    vendorFilteredModels,
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
