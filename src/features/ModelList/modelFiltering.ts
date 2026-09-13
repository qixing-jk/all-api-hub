import {
  getModelBillingMode,
  MODEL_LIST_BILLING_MODES,
  type ModelListBillingMode,
} from "~/features/ModelList/billingModes"
import { resolveActiveModelGroupContext } from "~/features/ModelList/groupContext"
import {
  matchesModelCapabilityFilters,
  type ModelCapabilityMetadataCoverage,
  type ModelCapabilitySelectionValue,
} from "~/features/ModelList/modelCapabilityFilters"
import {
  supportsPricingDerivedBehavior,
  type ModelListItem,
} from "~/features/ModelList/modelListItems"
import { MODEL_MANAGEMENT_SOURCE_KINDS } from "~/features/ModelList/modelManagementSources"
import type { ModelListSortMode } from "~/features/ModelList/sortModes"
import type { ModelVendorCatalogEntry } from "~/services/models/modelMetadata/types"
import {
  MODEL_VENDOR_FILTER_VALUES,
  type ModelVendorFilterValue,
} from "~/services/models/modelVendor"

interface ModelListFilters {
  searchTerm: string
  selectedBillingMode: ModelListBillingMode
  selectedGroups: string[]
  selectedModelCapabilities: ModelCapabilitySelectionValue[]
}
// Sorting does not change membership; previews accept the control's complete draft.
type FilterOverrides = Partial<ModelListFilters> & {
  sortMode?: ModelListSortMode
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

/** Resolves vendor selection against this result scope before filtering it. */
export function projectModelListVendorFilter<
  T extends Pick<ModelListItem, "resolvedVendor">,
>(items: T[], selectedProvider: ModelVendorFilterValue) {
  const vendorCatalog = deriveVendorCatalog(items)
  const unclassifiedVendorCount = deriveUnclassifiedVendorCount(items)
  const effectiveSelectedVendor = resolveEffectiveSelectedVendor(
    selectedProvider,
    vendorCatalog,
    unclassifiedVendorCount,
  )
  return {
    items: filterModelsByVendor(items, effectiveSelectedVendor),
    vendorCatalog,
    unclassifiedVendorCount,
    effectiveSelectedVendor,
    shouldRepairSelectedVendor: effectiveSelectedVendor !== selectedProvider,
  }
}

/**
 * Builds one immutable-render filtering snapshot without evaluating prices.
 * Account summaries use base rows; vendor views additionally apply account selection;
 * capability coverage excludes only the capability filter. Drafts use these same stages.
 */
export function createModelListFilterPipeline(params: {
  items: ModelListItem[]
  filters: ModelListFilters
  supportsModelCapabilityFilter: boolean
  isAllAccounts: boolean
  accountFilterAccountIds: string[]
  getGroupCandidates: (
    item: ModelListItem,
    groups: string[],
  ) => string[] | undefined
}) {
  const {
    items: rawModelItems,
    filters,
    supportsModelCapabilityFilter,
    isAllAccounts,
    accountFilterAccountIds,
    getGroupCandidates,
  } = params
  const {
    searchTerm,
    selectedBillingMode,
    selectedGroups,
    selectedModelCapabilities,
  } = filters
  const selectedAccountIds = new Set(accountFilterAccountIds)
  const filterBase = (overrides: FilterOverrides = {}) => {
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

      const candidates = getGroupCandidates(item, nextSelectedGroups)
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
  }
  const filterAccounts = (items: ModelListItem[]) =>
    !isAllAccounts || selectedAccountIds.size === 0
      ? items
      : items.filter(
          (item) =>
            item.source.kind !== MODEL_MANAGEMENT_SOURCE_KINDS.ACCOUNT ||
            selectedAccountIds.has(item.source.account.id),
        )
  const baseRows = filterBase()
  const accountFilteredBaseRawModels = filterAccounts(baseRows)
  const accountSummaryCountsByAccountId = new Map<string, number>()
  if (isAllAccounts) {
    for (const item of baseRows) {
      if (
        item.source.kind !== MODEL_MANAGEMENT_SOURCE_KINDS.ACCOUNT ||
        !item.source.capabilities.supportsAccountSummary
      )
        continue
      const accountId = item.source.account.id
      accountSummaryCountsByAccountId.set(
        accountId,
        (accountSummaryCountsByAccountId.get(accountId) ?? 0) + 1,
      )
    }
  }
  const forVendor = (selectedProvider: ModelVendorFilterValue) => {
    const currentVendorRows = projectModelListVendorFilter(
      accountFilteredBaseRawModels,
      selectedProvider,
    ).items
    const getFilteredModels = (overrides: FilterOverrides = {}) => {
      const unchanged =
        (overrides.searchTerm ?? searchTerm) === searchTerm &&
        (overrides.selectedBillingMode ?? selectedBillingMode) ===
          selectedBillingMode &&
        (overrides.selectedGroups ?? selectedGroups) === selectedGroups &&
        (overrides.selectedModelCapabilities ?? selectedModelCapabilities) ===
          selectedModelCapabilities
      return unchanged
        ? currentVendorRows
        : projectModelListVendorFilter(
            filterAccounts(filterBase(overrides)),
            selectedProvider,
          ).items
    }
    const getFilteredResultCount = (overrides: FilterOverrides = {}) =>
      getFilteredModels(overrides).length
    const beforeCapabilityFilter =
      selectedModelCapabilities.length === 0
        ? currentVendorRows
        : getFilteredModels({ selectedModelCapabilities: [] })
    const matched = beforeCapabilityFilter.filter(
      (item) => !!item.modelMetadata,
    ).length
    const total = beforeCapabilityFilter.length
    const modelCapabilityMetadataCoverage: ModelCapabilityMetadataCoverage = {
      matched,
      total,
      unmatched: total - matched,
    }
    return {
      getFilteredModels,
      getFilteredResultCount,
      modelCapabilityMetadataCoverage,
    }
  }
  return {
    accountFilteredBaseRawModels,
    accountSummaryCountsByAccountId,
    forVendor,
  }
}
