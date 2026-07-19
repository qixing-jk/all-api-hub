import { useCallback, useMemo } from "react"

import { resolveAccountExchangeRate } from "~/features/ModelList/accountExchangeRate"
import { applyAihubmixModelListCapabilities } from "~/features/ModelList/aihubmixModelList"
import {
  MODEL_GROUP_ACCESS_STATES,
  normalizeGroupRatios,
  resolveActiveModelGroupContext,
  resolveModelGroupContext,
  type ActiveModelGroupContext,
  type ModelGroupContext,
} from "~/features/ModelList/groupContext"
import { normalizeGroupNames } from "~/features/ModelList/groupNormalization"
import {
  createModelMetadataIndex,
  hasFilterableModelCapabilityMetadata,
  matchesModelCapabilityFilters,
  type ModelCapabilityMetadataCoverage,
  type ModelCapabilitySelectionValue,
} from "~/features/ModelList/modelCapabilityFilters"
import {
  createAccountSource,
  deriveModelListSourceCapabilities,
  MODEL_LIST_GROUP_SEMANTICS,
  MODEL_MANAGEMENT_SOURCE_KINDS,
  type ModelListSourceIdentity,
  type ModelManagementAccountSource,
  type ModelManagementItemSource,
  type ModelManagementSource,
} from "~/features/ModelList/modelManagementSources"
import {
  isModelListPriceSortMode,
  MODEL_LIST_SORT_MODES,
  type ModelListSortMode,
} from "~/features/ModelList/sortModes"
import {
  isModelPriceUnavailable,
  MODEL_UNAVAILABLE_PRICE_REASONS,
  type PricingResponse,
} from "~/services/modelList/pricingModel"
import { DEFAULT_MODEL_GROUP } from "~/services/models/constants"
import { resolveModelIdentity } from "~/services/models/modelMetadata/modelIdentityIndex"
import type {
  ModelMetadata,
  ModelVendorCandidate,
  ModelVendorCatalogEntry,
  ResolvedModelVendor,
} from "~/services/models/modelMetadata/types"
import {
  aggregateModelVendors,
  compareCodePoints,
  MODEL_VENDOR_FILTER_VALUES,
  resolveModelVendorCandidate,
  type ModelVendorFilterValue,
} from "~/services/models/modelVendor"
import {
  calculateModelPrice,
  isTokenBillingType,
} from "~/services/models/utils/modelPricing"

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
  allAccountsExcludedGroupsByAccountId?: Record<string, string[]>
  searchTerm: string
  selectedProvider: ModelVendorFilterValue
  selectedModelCapabilities: ModelCapabilitySelectionValue[]
  modelMetadata: ModelMetadata[]
  sortMode: ModelListSortMode
  showRealPrice: boolean
  accountFilterAccountIds?: string[]
}

type PricingBillingMode =
  | typeof MODEL_LIST_BILLING_MODES.TOKEN_BASED
  | typeof MODEL_LIST_BILLING_MODES.PER_CALL

interface ComparablePriceKey {
  billingMode: PricingBillingMode
  primary: number | null
  secondary: number | null
}

interface RawModelItem {
  model: PricingResponse["data"][number]
  source: ModelManagementItemSource
  sourceIdentity?: ModelListSourceIdentity
  groupRatios: Record<string, number>
  groupContext: ModelGroupContext
  exchangeRate: number
  modelMetadata?: ModelMetadata
  resolvedVendor: ResolvedModelVendor
}

type CandidateRawModelItem = Omit<RawModelItem, "resolvedVendor"> & {
  vendorCandidate: ModelVendorCandidate
}

export type CountedModelVendorCatalogEntry = ModelVendorCatalogEntry & {
  count: number
}

export interface AccountGroupOption {
  name: string
  ratio?: number
}

export type CalculatedModelItem = {
  model: PricingResponse["data"][number]
  calculatedPrice: ReturnType<typeof calculateModelPrice>
  source: ModelManagementItemSource
  sourceIdentity?: ModelListSourceIdentity
  groupRatios: Record<string, number>
  groupContext: ModelGroupContext
  activeGroupContext: ActiveModelGroupContext
  effectiveGroup?: string
  modelMetadata?: ModelMetadata
  resolvedVendor: ResolvedModelVendor
  hasAutoSelectedGroup?: boolean
  isLowestPrice?: boolean
}

const BILLING_MODE_ORDER: Record<PricingBillingMode, number> = {
  [MODEL_LIST_BILLING_MODES.TOKEN_BASED]: 0,
  [MODEL_LIST_BILLING_MODES.PER_CALL]: 1,
}

/** Compares stable vendor keys without locale-dependent collation. */
function compareVendorKeys(left: string, right: string) {
  return left < right ? -1 : left > right ? 1 : 0
}

/** Derives tab entries and counts from rows that passed every base filter. */
function deriveVendorCatalog(
  items: readonly CalculatedModelItem[],
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
  items: readonly CalculatedModelItem[],
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
function filterCalculatedModelsByVendor(
  items: CalculatedModelItem[],
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

/** Returns true when the value is a finite number. */
function isFiniteNumber(value: number | null | undefined): value is number {
  return typeof value === "number" && Number.isFinite(value)
}

/** Creates an account group option without inventing an unknown ratio. */
function toAccountGroupOption(
  name: string,
  ratio: number | undefined,
): AccountGroupOption {
  return { name, ...(isFiniteNumber(ratio) ? { ratio } : {}) }
}

/** Compares normalized ratio maps without relying on object identity. */
function haveEqualGroupRatios(
  left: Readonly<Record<string, number>>,
  right: Readonly<Record<string, number>>,
) {
  const leftEntries = Object.entries(left)
  return (
    leftEntries.length === Object.keys(right).length &&
    leftEntries.every(([group, ratio]) => right[group] === ratio)
  )
}

/** Resolves whether one adapted pricing response can safely repair group state. */
function isPricingGroupAccessAuthoritative(params: {
  groupSemantics: ModelManagementSource["groupSemantics"]
  pricing: PricingResponse
  groupContexts: readonly ModelGroupContext[]
}) {
  if (params.groupSemantics === MODEL_LIST_GROUP_SEMANTICS.NOT_APPLICABLE) {
    return true
  }

  if (
    params.groupContexts.some(
      (context) => context.accessState === MODEL_GROUP_ACCESS_STATES.UNKNOWN,
    )
  ) {
    return false
  }

  if (params.groupContexts.length === 0) {
    return params.pricing.model_list_source?.supportsPricing !== false
  }

  return true
}

/** Resolves the exchange rate for account-backed prices. */
function getSourceExchangeRate(item: Pick<CalculatedModelItem, "source">) {
  if (item.source.kind !== MODEL_MANAGEMENT_SOURCE_KINDS.ACCOUNT) {
    return 1
  }

  return resolveAccountExchangeRate(item.source.account)
}

/** Builds a normalized price key used for comparisons and sorting. */
function getComparablePriceKey(
  item: Pick<CalculatedModelItem, "model" | "calculatedPrice" | "source">,
  showRealPrice: boolean,
): ComparablePriceKey {
  if (
    isModelPriceUnavailable(item.model) ||
    item.calculatedPrice.priceAvailability === "unavailable"
  ) {
    return {
      billingMode: getModelBillingMode(item.model.quota_type),
      primary: null,
      secondary: null,
    }
  }

  if (isTokenBillingType(item.model.quota_type)) {
    const inputPrice = showRealPrice
      ? item.calculatedPrice.inputCNY
      : item.calculatedPrice.inputUSD
    const outputPrice = showRealPrice
      ? item.calculatedPrice.outputCNY
      : item.calculatedPrice.outputUSD

    return {
      billingMode: MODEL_LIST_BILLING_MODES.TOKEN_BASED,
      primary: isFiniteNumber(inputPrice) ? inputPrice : null,
      secondary: isFiniteNumber(outputPrice) ? outputPrice : null,
    }
  }

  const perCallPrice = item.calculatedPrice.perCallPrice
  const exchangeRate = showRealPrice ? getSourceExchangeRate(item) : 1

  if (typeof perCallPrice === "number") {
    const normalized = perCallPrice * exchangeRate
    return {
      billingMode: MODEL_LIST_BILLING_MODES.PER_CALL,
      primary: isFiniteNumber(normalized) ? normalized : null,
      secondary: isFiniteNumber(normalized) ? normalized : null,
    }
  }

  if (perCallPrice && typeof perCallPrice === "object") {
    const input = perCallPrice.input * exchangeRate
    const output = perCallPrice.output * exchangeRate
    return {
      billingMode: MODEL_LIST_BILLING_MODES.PER_CALL,
      primary: isFiniteNumber(input) ? input : null,
      secondary: isFiniteNumber(output) ? output : null,
    }
  }

  return {
    billingMode: MODEL_LIST_BILLING_MODES.PER_CALL,
    primary: null,
    secondary: null,
  }
}

/** Orders nullable numbers with finite values before missing ones. */
function compareNullableNumber(
  a: number | null,
  b: number | null,
  direction: 1 | -1,
) {
  const aValid = isFiniteNumber(a)
  const bValid = isFiniteNumber(b)

  if (aValid && bValid) {
    return (a - b) * direction
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
  const primaryComparison = compareNullableNumber(
    a.primary,
    b.primary,
    direction,
  )
  if (primaryComparison !== 0) {
    return primaryComparison
  }

  const secondaryComparison = compareNullableNumber(
    a.secondary,
    b.secondary,
    direction,
  )
  if (secondaryComparison !== 0) {
    return secondaryComparison
  }

  return 0
}

/** Returns true when a price key has at least one finite comparable value. */
function hasComparablePriceValue(priceKey: ComparablePriceKey) {
  return isFiniteNumber(priceKey.primary) || isFiniteNumber(priceKey.secondary)
}

/** Resolves the row identity used for source-scoped model-list comparisons. */
function getModelListSourceIdentityKey(params: {
  source: ModelManagementItemSource
  sourceIdentity?: ModelListSourceIdentity
}) {
  return (
    params.sourceIdentity?.id ??
    (params.source.kind === MODEL_MANAGEMENT_SOURCE_KINDS.ACCOUNT
      ? params.source.account.id
      : params.source.profile.id)
  )
}

/** Resolves the source-level group/filter key for a raw model item. */
function getRawItemSourceIdentityKey(
  item: Pick<RawModelItem, "source" | "sourceIdentity">,
) {
  return getModelListSourceIdentityKey({
    source: item.source,
    sourceIdentity: item.sourceIdentity,
  })
}

/** Creates a stable identifier for a calculated model item. */
export function getModelItemKey(
  item: Pick<CalculatedModelItem, "model" | "source" | "sourceIdentity">,
) {
  const sourceId = getModelListSourceIdentityKey({
    source: item.source,
    sourceIdentity: item.sourceIdentity,
  })

  return `${item.source.kind}:${sourceId}:${item.model.model_name}`
}

/** Returns the source label used for deterministic sorting. */
function getSourceSortLabel(item: CalculatedModelItem) {
  return item.source.kind === MODEL_MANAGEMENT_SOURCE_KINDS.ACCOUNT
    ? item.source.account.name
    : item.source.profile.name
}

/** Maps quota type values onto the model-list billing modes. */
function getModelBillingMode(quotaType: number): PricingBillingMode {
  return isTokenBillingType(quotaType)
    ? MODEL_LIST_BILLING_MODES.TOKEN_BASED
    : MODEL_LIST_BILLING_MODES.PER_CALL
}

/** Returns true when row pricing metadata should affect filters and sorting. */
function supportsPricingDerivedBehavior(
  item: Pick<CalculatedModelItem, "model" | "source">,
) {
  if (isModelPriceUnavailable(item.model)) {
    return false
  }

  return (
    item.source.kind !== MODEL_MANAGEMENT_SOURCE_KINDS.ACCOUNT ||
    item.source.capabilities.supportsPricing
  )
}

/** Picks the best priced calculated item across candidate groups. */
function resolveBestCalculatedItem(
  rawItem: RawModelItem,
  groupCandidates: string[] | undefined,
  showRealPrice: boolean,
): CalculatedModelItem | null {
  const activeGroupContext = resolveActiveModelGroupContext({
    context: rawItem.groupContext,
    candidateGroups: groupCandidates,
  })
  const createCalculatedItem = (params: {
    calculatedPrice: ReturnType<typeof calculateModelPrice>
    activeGroupContext: ActiveModelGroupContext
    effectiveGroup?: string
    hasAutoSelectedGroup?: boolean
  }): CalculatedModelItem => ({
    model: rawItem.model,
    calculatedPrice: params.calculatedPrice,
    source: rawItem.source,
    sourceIdentity: rawItem.sourceIdentity,
    groupRatios: rawItem.groupRatios,
    groupContext: rawItem.groupContext,
    activeGroupContext: params.activeGroupContext,
    effectiveGroup: params.effectiveGroup,
    modelMetadata: rawItem.modelMetadata,
    resolvedVendor: rawItem.resolvedVendor,
    hasAutoSelectedGroup: params.hasAutoSelectedGroup,
  })

  if (
    rawItem.groupContext.accessState ===
    MODEL_GROUP_ACCESS_STATES.NOT_APPLICABLE
  ) {
    return createCalculatedItem({
      calculatedPrice: calculateModelPrice(
        rawItem.model,
        rawItem.groupRatios,
        rawItem.exchangeRate,
        DEFAULT_MODEL_GROUP,
      ),
      activeGroupContext,
    })
  }

  if (isModelPriceUnavailable(rawItem.model)) {
    return createCalculatedItem({
      calculatedPrice: calculateModelPrice(
        rawItem.model,
        rawItem.groupRatios,
        rawItem.exchangeRate,
        DEFAULT_MODEL_GROUP,
      ),
      activeGroupContext,
    })
  }

  if (
    groupCandidates !== undefined &&
    activeGroupContext.activeUsableGroups.length === 0
  ) {
    return null
  }

  if (activeGroupContext.activePriceableGroups.length === 0) {
    const unavailableReason =
      rawItem.groupContext.accessState === MODEL_GROUP_ACCESS_STATES.KNOWN &&
      rawItem.groupContext.usableGroups.length === 0
        ? MODEL_UNAVAILABLE_PRICE_REASONS.NO_USABLE_GROUP
        : MODEL_UNAVAILABLE_PRICE_REASONS.GROUP_RATIO_UNAVAILABLE

    return createCalculatedItem({
      calculatedPrice: {
        priceAvailability: "unavailable",
        unavailableReason,
      },
      activeGroupContext,
    })
  }

  let bestResult: CalculatedModelItem | null = null
  let bestKey: ComparablePriceKey | null = null

  activeGroupContext.activePriceableGroups.forEach((group) => {
    const calculatedPrice = calculateModelPrice(
      rawItem.model,
      rawItem.groupRatios,
      rawItem.exchangeRate,
      group,
    )
    const candidateItem = createCalculatedItem({
      calculatedPrice,
      effectiveGroup: group,
      activeGroupContext: resolveActiveModelGroupContext({
        context: rawItem.groupContext,
        candidateGroups: groupCandidates,
        effectiveGroup: group,
      }),
      hasAutoSelectedGroup: activeGroupContext.activePriceableGroups.length > 1,
    })
    const candidateKey = getComparablePriceKey(candidateItem, showRealPrice)

    if (!bestResult || !bestKey) {
      bestResult = candidateItem
      bestKey = candidateKey
      return
    }

    const priceComparison = comparePriceKeys(candidateKey, bestKey, 1)
    if (priceComparison < 0) {
      bestResult = candidateItem
      bestKey = candidateKey
      return
    }

    if (
      priceComparison === 0 &&
      compareCodePoints(group, bestResult.effectiveGroup ?? "") < 0
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
  getGroupCandidates: (item: RawModelItem) => string[] | undefined
  showRealPrice: boolean
}) {
  const { rawItems, getGroupCandidates, showRealPrice } = params

  return rawItems
    .map((item) =>
      resolveBestCalculatedItem(item, getGroupCandidates(item), showRealPrice),
    )
    .filter((item): item is CalculatedModelItem => item !== null)
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
 * @param params.searchTerm Search keyword for model name/description.
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

  const rawModelState = useMemo(() => {
    let isGroupAccessAuthoritative = false
    let singleSourceGroupRatios: Record<string, number> = {}
    let matchingSingleAccountContextCount = 0
    const groupAccessAuthorityByAccountId = new Map<string, boolean>()
    const recordAccountGroupAccessAuthority = (
      accountId: string,
      isAuthoritative: boolean,
    ) => {
      const previous = groupAccessAuthorityByAccountId.get(accountId)
      groupAccessAuthorityByAccountId.set(
        accountId,
        previous === undefined ? isAuthoritative : previous && isAuthoritative,
      )
    }
    const projectSingleAccountContextFacts = (params: {
      accountId: string
      isAuthoritative: boolean
      groupRatios: Record<string, number>
    }) => {
      if (
        selectedSource?.kind !== MODEL_MANAGEMENT_SOURCE_KINDS.ACCOUNT ||
        selectedSource.account.id !== params.accountId
      ) {
        return
      }

      if (matchingSingleAccountContextCount === 0) {
        isGroupAccessAuthoritative = params.isAuthoritative
        singleSourceGroupRatios = params.groupRatios
      } else {
        isGroupAccessAuthoritative &&= params.isAuthoritative
        if (
          !haveEqualGroupRatios(singleSourceGroupRatios, params.groupRatios)
        ) {
          singleSourceGroupRatios = {}
        }
      }
      matchingSingleAccountContextCount += 1
    }

    const attachVendorCandidate = (
      item: Omit<RawModelItem, "resolvedVendor" | "modelMetadata">,
    ): CandidateRawModelItem => {
      const lookupResult = resolveModelIdentity(
        modelMetadataIndex,
        item.model.model_name,
      )

      return {
        ...item,
        modelMetadata:
          lookupResult.state === "resolved" ? lookupResult.metadata : undefined,
        vendorCandidate: resolveModelVendorCandidate(
          {
            id: item.model.model_name,
            vendorEvidence: item.model.vendorEvidence,
          },
          lookupResult,
        ),
      }
    }
    const createPricingSourceItems = (params: {
      pricing: PricingResponse
      source: RawModelItem["source"]
      sourceIdentity?: ModelListSourceIdentity
      usableGroup: PricingResponse["usable_group"]
      exchangeRate: number
    }) => {
      const groupRatios = normalizeGroupRatios(params.pricing.group_ratio ?? {})
      const sourceItems = params.pricing.data.map((model) => {
        const groupContext = resolveModelGroupContext({
          groupSemantics: params.source.groupSemantics,
          model,
          usableGroup: params.usableGroup,
          groupRatios,
          modelListSource: params.pricing.model_list_source,
        })

        return attachVendorCandidate({
          model,
          source: params.source,
          sourceIdentity: params.sourceIdentity,
          groupRatios,
          groupContext,
          exchangeRate: params.exchangeRate,
        })
      })

      return { groupRatios, sourceItems }
    }

    const candidateItems = (() => {
      if (pricingContexts && pricingContexts.length > 0) {
        return pricingContexts.flatMap(
          ({ account, pricing, sourceIdentity }) => {
            if (!pricing || !Array.isArray(pricing.data)) {
              recordAccountGroupAccessAuthority(account.id, false)
              projectSingleAccountContextFacts({
                accountId: account.id,
                isAuthoritative: false,
                groupRatios: {},
              })
              return []
            }

            const exchangeRate = resolveAccountExchangeRate(account)

            const accountSource = createAccountSource(account)
            const allAccountsRowSource = {
              ...accountSource,
              capabilities: {
                ...accountSource.capabilities,
                supportsAccountSummary: true,
              },
            }
            const source = applyAihubmixModelListCapabilities(
              {
                ...allAccountsRowSource,
                capabilities: deriveModelListSourceCapabilities({
                  capabilities: allAccountsRowSource.capabilities,
                  modelListSource: pricing.model_list_source,
                }),
              },
              pricing,
            )
            const { groupRatios, sourceItems } = createPricingSourceItems({
              pricing,
              source,
              sourceIdentity,
              usableGroup: pricing.usable_group ?? {},
              exchangeRate,
            })
            const isAuthoritative = isPricingGroupAccessAuthoritative({
              groupSemantics: source.groupSemantics,
              pricing,
              groupContexts: sourceItems.map((item) => item.groupContext),
            })
            recordAccountGroupAccessAuthority(account.id, isAuthoritative)
            projectSingleAccountContextFacts({
              accountId: account.id,
              isAuthoritative,
              groupRatios,
            })

            return sourceItems
          },
        )
      }

      if (!pricingData || !selectedSource || !Array.isArray(pricingData.data)) {
        return []
      }

      if (selectedSource.kind === MODEL_MANAGEMENT_SOURCE_KINDS.PROFILE) {
        const { groupRatios, sourceItems } = createPricingSourceItems({
          pricing: pricingData,
          source: selectedSource,
          usableGroup: {},
          exchangeRate: 1,
        })
        singleSourceGroupRatios = groupRatios
        isGroupAccessAuthoritative = isPricingGroupAccessAuthoritative({
          groupSemantics: selectedSource.groupSemantics,
          pricing: pricingData,
          groupContexts: sourceItems.map((item) => item.groupContext),
        })
        return sourceItems
      }

      if (selectedSource.kind !== MODEL_MANAGEMENT_SOURCE_KINDS.ACCOUNT) {
        return []
      }

      const exchangeRate = resolveAccountExchangeRate(selectedSource.account)

      const source = applyAihubmixModelListCapabilities(
        {
          ...selectedSource,
          capabilities: deriveModelListSourceCapabilities({
            capabilities: selectedSource.capabilities,
            modelListSource: pricingData.model_list_source,
          }),
        },
        pricingData,
      )
      const { groupRatios, sourceItems } = createPricingSourceItems({
        pricing: pricingData,
        source,
        usableGroup: pricingData.usable_group ?? {},
        exchangeRate,
      })
      singleSourceGroupRatios = groupRatios
      isGroupAccessAuthoritative = isPricingGroupAccessAuthoritative({
        groupSemantics: source.groupSemantics,
        pricing: pricingData,
        groupContexts: sourceItems.map((item) => item.groupContext),
      })
      return sourceItems
    })()

    const { resolved } = aggregateModelVendors(
      candidateItems.map((item) => item.vendorCandidate),
    )

    return {
      rawModelItems: candidateItems.map(
        ({ vendorCandidate: _candidate, ...item }, index) => ({
          ...item,
          resolvedVendor: resolved[index],
        }),
      ),
      isGroupAccessAuthoritative,
      singleSourceGroupRatios,
      authoritativeGroupAccessByAccountId: Object.fromEntries(
        groupAccessAuthorityByAccountId,
      ) as Record<string, boolean>,
    }
  }, [modelMetadataIndex, pricingContexts, pricingData, selectedSource])
  const {
    rawModelItems,
    isGroupAccessAuthoritative,
    singleSourceGroupRatios,
    authoritativeGroupAccessByAccountId,
  } = rawModelState

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

  const availableGroupsBySourceId = useMemo(() => {
    if (
      !selectedSource?.capabilities.supportsGroupFiltering ||
      selectedSource.kind !== MODEL_MANAGEMENT_SOURCE_KINDS.ALL_ACCOUNTS
    ) {
      return {}
    }

    const groupsBySourceId = new Map<string, Set<string>>()

    rawModelItems.forEach((item) => {
      if (item.source.kind !== MODEL_MANAGEMENT_SOURCE_KINDS.ACCOUNT) {
        return
      }

      const sourceId = getRawItemSourceIdentityKey(item)
      const sourceGroups = groupsBySourceId.get(sourceId) ?? new Set<string>()

      item.groupContext.usableGroups.forEach((group) => sourceGroups.add(group))

      groupsBySourceId.set(sourceId, sourceGroups)
    })

    return Object.fromEntries(
      Array.from(groupsBySourceId.entries()).map(([sourceId, groups]) => [
        sourceId,
        normalizeGroupNames(groups),
      ]),
    ) as Record<string, string[]>
  }, [
    rawModelItems,
    selectedSource?.capabilities.supportsGroupFiltering,
    selectedSource?.kind,
  ])

  const availableAccountGroupsByAccountId = useMemo(() => {
    if (
      !selectedSource?.capabilities.supportsGroupFiltering ||
      selectedSource.kind !== MODEL_MANAGEMENT_SOURCE_KINDS.ALL_ACCOUNTS
    ) {
      return {}
    }

    const groupsByAccountId = new Map<string, Set<string>>()

    rawModelItems.forEach((item) => {
      if (item.source.kind !== MODEL_MANAGEMENT_SOURCE_KINDS.ACCOUNT) {
        return
      }

      const accountId = item.source.account.id
      const accountGroups =
        groupsByAccountId.get(accountId) ?? new Set<string>()

      item.groupContext.usableGroups.forEach((group) =>
        accountGroups.add(group),
      )

      groupsByAccountId.set(accountId, accountGroups)
    })

    return Object.fromEntries(
      Array.from(groupsByAccountId.entries()).map(([accountId, groups]) => [
        accountId,
        normalizeGroupNames(groups),
      ]),
    ) as Record<string, string[]>
  }, [
    rawModelItems,
    selectedSource?.capabilities.supportsGroupFiltering,
    selectedSource?.kind,
  ])

  const availableAccountGroupOptionsByAccountId = useMemo(() => {
    if (
      !selectedSource?.capabilities.supportsGroupFiltering ||
      selectedSource.kind !== MODEL_MANAGEMENT_SOURCE_KINDS.ALL_ACCOUNTS
    ) {
      return {}
    }

    const ratiosByAccountId = new Map<string, Map<string, number | undefined>>()

    rawModelItems.forEach((item) => {
      if (item.source.kind !== MODEL_MANAGEMENT_SOURCE_KINDS.ACCOUNT) {
        return
      }

      const accountId = item.source.account.id
      const ratioMap = ratiosByAccountId.get(accountId) ?? new Map()

      item.groupContext.usableGroups.forEach((group) => {
        const ratio = item.groupRatios[group]
        const finiteRatio = isFiniteNumber(ratio) ? ratio : undefined
        if (!ratioMap.has(group)) {
          ratioMap.set(group, finiteRatio)
          return
        }

        const existingRatio = ratioMap.get(group)
        if (
          existingRatio === undefined ||
          finiteRatio === undefined ||
          existingRatio !== finiteRatio
        ) {
          ratioMap.set(group, undefined)
        }
      })

      ratiosByAccountId.set(accountId, ratioMap)
    })

    return Object.fromEntries(
      Object.entries(availableAccountGroupsByAccountId).map(
        ([accountId, groups]) => [
          accountId,
          groups.map((group) =>
            toAccountGroupOption(
              group,
              ratiosByAccountId.get(accountId)?.get(group),
            ),
          ),
        ],
      ),
    ) as Record<string, AccountGroupOption[]>
  }, [
    availableAccountGroupsByAccountId,
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

        const sourceId = getRawItemSourceIdentityKey(item)
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
      item: RawModelItem,
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
            getRawItemSourceIdentityKey(item)
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
    (rawItems: RawModelItem[]) => {
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

  const getFilteredModels = useCallback(
    (overrides: FilterOverrides = {}) => {
      const baseModels = resolveCalculatedModels({
        rawItems: getAccountFilteredRawModels(
          getBaseFilteredRawModels(overrides),
        ),
        getGroupCandidates: (item) =>
          getGroupCandidatesForRawItem(
            item,
            overrides.selectedGroups ?? selectedGroups,
          ),
        showRealPrice,
      })

      const effectiveVendor = resolveEffectiveSelectedVendor(
        selectedProvider,
        deriveVendorCatalog(baseModels),
        deriveUnclassifiedVendorCount(baseModels),
      )
      return filterCalculatedModelsByVendor(baseModels, effectiveVendor)
    },
    [
      getAccountFilteredRawModels,
      getBaseFilteredRawModels,
      getGroupCandidatesForRawItem,
      selectedGroups,
      selectedProvider,
      showRealPrice,
    ],
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
      RawModelItem & { source: ModelManagementAccountSource }
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
      resolveCalculatedModels({
        rawItems: accountFilteredBaseRawModels,
        getGroupCandidates: getGroupCandidatesForRawItem,
        showRealPrice,
      }),
    [accountFilteredBaseRawModels, getGroupCandidatesForRawItem, showRealPrice],
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
    const vendorFilteredModels = filterCalculatedModelsByVendor(
      baseFilteredModels,
      effectiveSelectedVendor,
    )

    const priceKeys = new Map<string, ComparablePriceKey>()
    vendorFilteredModels.forEach((item) => {
      if (!supportsPricingDerivedBehavior(item)) {
        if (isModelPriceUnavailable(item.model)) {
          priceKeys.set(
            getModelItemKey(item),
            getComparablePriceKey(item, showRealPrice),
          )
        }
        return
      }

      priceKeys.set(
        getModelItemKey(item),
        getComparablePriceKey(item, showRealPrice),
      )
    })

    const lowestPriceKeys = new Set<string>()
    if (selectedSource?.kind === MODEL_MANAGEMENT_SOURCE_KINDS.ALL_ACCOUNTS) {
      const groups = new Map<string, CalculatedModelItem[]>()

      vendorFilteredModels.forEach((item) => {
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
          return priceKey && hasComparablePriceValue(priceKey)
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

    const indexedItems = vendorFilteredModels.map((item, index) => ({
      item,
      index,
      itemKey: getModelItemKey(item),
      priceKey: priceKeys.get(getModelItemKey(item)),
    }))

    const comparePricedRows = (
      a: (typeof indexedItems)[number] & { priceKey: ComparablePriceKey },
      b: (typeof indexedItems)[number] & { priceKey: ComparablePriceKey },
    ) => {
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
    }

    const sortedWithIndices = !isModelListPriceSortMode(sortMode)
      ? indexedItems
      : (() => {
          const pricedItems = indexedItems
            .filter(
              (
                item,
              ): item is (typeof indexedItems)[number] & {
                priceKey: ComparablePriceKey
              } => !!item.priceKey && hasComparablePriceValue(item.priceKey),
            )
            .sort(comparePricedRows)

          const missingPriceItems = indexedItems.filter(
            (item) => !item.priceKey || !hasComparablePriceValue(item.priceKey),
          )
          return [...pricedItems, ...missingPriceItems]
        })()

    return sortedWithIndices.map(({ item, itemKey }) => ({
      ...item,
      isLowestPrice: lowestPriceKeys.has(itemKey),
    }))
  }, [
    baseFilteredModels,
    effectiveSelectedVendor,
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
