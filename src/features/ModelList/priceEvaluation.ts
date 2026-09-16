import {
  resolveAccountExchangeRate,
  resolveKnownAccountExchangeRate,
} from "~/features/ModelList/accountExchangeRate"
import {
  getModelBillingMode,
  MODEL_LIST_BILLING_MODES,
} from "~/features/ModelList/billingModes"
import {
  MODEL_GROUP_ACCESS_STATES,
  resolveActiveModelGroupContext,
  type ActiveModelGroupContext,
} from "~/features/ModelList/groupContext"
import {
  getModelItemKey,
  supportsPricingDerivedBehavior,
  type CalculatedModelItem,
  type ModelListItem,
} from "~/features/ModelList/modelListItems"
import { MODEL_MANAGEMENT_SOURCE_KINDS } from "~/features/ModelList/modelManagementSources"
import {
  calculateWeightedTokenPrice,
  type ModelPriceComparisonWeights,
} from "~/features/ModelList/priceComparison"
import {
  isModelListPriceSortMode,
  MODEL_LIST_SORT_MODES,
  type ModelListSortMode,
} from "~/features/ModelList/sortModes"
import { resolveAccountSitePricingUrl } from "~/services/accounts/accountSiteProfile/urls"
import {
  isModelPriceUnavailable,
  MODEL_UNAVAILABLE_PRICE_REASONS,
} from "~/services/modelList/pricingModel"
import {
  CALCULATED_PRICE_KINDS,
  PRICING_PURPOSES,
  PRICING_SOURCE_KINDS,
  QUOTE_STATUSES,
  QUOTE_UNITS,
} from "~/services/modelPricing/pricingConstants"
import type {
  PricingScenario,
  QuoteResult,
} from "~/services/modelPricing/pricingPlan"
import { quoteCanonicalModelPrice } from "~/services/modelPricing/quoteCanonicalModelPrice"
import { compareCodePoints } from "~/services/models/modelVendor"
import {
  calculateModelPrice,
  isTokenBillingType,
  resolvePriceAmount,
} from "~/services/models/utils/modelPricing"

type PricingBillingMode =
  | typeof MODEL_LIST_BILLING_MODES.TOKEN_BASED
  | typeof MODEL_LIST_BILLING_MODES.PER_CALL

interface ComparablePriceKey {
  unit?: QuoteResult["unit"]
  billingMode: PricingBillingMode
  primary: number | null
  secondary: number | null
}

const BILLING_MODE_ORDER: Record<PricingBillingMode, number> = {
  [MODEL_LIST_BILLING_MODES.TOKEN_BASED]: 0,
  [MODEL_LIST_BILLING_MODES.PER_CALL]: 1,
}

/** Returns true when the value is a finite number. */
function isFiniteNumber(value: number | null | undefined): value is number {
  return typeof value === "number" && Number.isFinite(value)
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
  priceComparisonWeights: ModelPriceComparisonWeights,
): ComparablePriceKey {
  const quote = item.calculatedPrice.quote
  if (quote)
    return {
      unit: quote.unit,
      billingMode:
        quote.unit === QUOTE_UNITS.REQUEST
          ? MODEL_LIST_BILLING_MODES.PER_CALL
          : MODEL_LIST_BILLING_MODES.TOKEN_BASED,
      primary: quote.status === QUOTE_STATUSES.COMPLETE ? quote.amount : null,
      secondary: null,
    }
  if (
    isModelPriceUnavailable(item.model) ||
    item.calculatedPrice.kind === CALCULATED_PRICE_KINDS.UNAVAILABLE
  ) {
    return {
      billingMode: getModelBillingMode(item.model.quota_type),
      primary: null,
      secondary: null,
    }
  }

  if (item.calculatedPrice.kind === CALCULATED_PRICE_KINDS.TOKEN) {
    const currency = showRealPrice ? "CNY" : "USD"
    const exchangeRate = getSourceExchangeRate(item)
    const inputPrice = resolvePriceAmount(
      item.calculatedPrice.usdPerMillionTokens.input,
      currency,
      exchangeRate,
    )
    const outputPrice = resolvePriceAmount(
      item.calculatedPrice.usdPerMillionTokens.output,
      currency,
      exchangeRate,
    )
    const cacheReadPrice = item.calculatedPrice.usdPerMillionTokens.cacheRead
    const cacheWritePrice = item.calculatedPrice.usdPerMillionTokens.cacheWrite
    const weightedPrice = calculateWeightedTokenPrice(
      {
        input: inputPrice,
        output: outputPrice,
        ...(cacheReadPrice === undefined
          ? {}
          : {
              cacheRead: resolvePriceAmount(
                cacheReadPrice,
                currency,
                exchangeRate,
              ),
            }),
        ...(cacheWritePrice === undefined
          ? {}
          : {
              cacheWrite: resolvePriceAmount(
                cacheWritePrice,
                currency,
                exchangeRate,
              ),
            }),
      },
      priceComparisonWeights,
    )

    return {
      billingMode: MODEL_LIST_BILLING_MODES.TOKEN_BASED,
      primary: weightedPrice,
      secondary: null,
    }
  }

  const perCallPrice = item.calculatedPrice.usdPerCall
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

/** Resolves the billing unit for planned and legacy prices. */
function comparisonUnit(key: ComparablePriceKey) {
  return (
    key.unit ??
    (key.billingMode === MODEL_LIST_BILLING_MODES.PER_CALL
      ? QUOTE_UNITS.REQUEST
      : QUOTE_UNITS.MILLION_SELECTED_TOKENS)
  )
}

/** Compares prices within their billing units in the requested direction. */
function comparePriceKeys(
  a: ComparablePriceKey,
  b: ComparablePriceKey,
  direction: 1 | -1,
) {
  const unitComparison = compareCodePoints(comparisonUnit(a), comparisonUnit(b))
  if (unitComparison) return unitComparison
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

/** Returns the source label used for deterministic sorting. */
function getSourceSortLabel(item: CalculatedModelItem) {
  return item.source.kind === MODEL_MANAGEMENT_SOURCE_KINDS.ACCOUNT
    ? item.source.account.name
    : item.source.profile.name
}

/** Picks the best priced calculated item across candidate groups. */
function resolveBestCalculatedItem(
  rawItem: ModelListItem,
  groupCandidates: string[] | undefined,
  showRealPrice: boolean,
  priceComparisonWeights: ModelPriceComparisonWeights,
  pricingScenario?: PricingScenario,
  isPriceComparisonActive = pricingScenario !== undefined,
): CalculatedModelItem {
  const calculatePrice = (
    model: typeof rawItem.model,
    groupMultiplier: number,
  ) => {
    const price = calculateModelPrice(model, groupMultiplier)
    if (
      (price.kind === CALCULATED_PRICE_KINDS.UNAVAILABLE &&
        !model.pricingPlan) ||
      (!isPriceComparisonActive &&
        !model.pricingPlan &&
        price.kind !== CALCULATED_PRICE_KINDS.TOKEN)
    )
      return price
    const scenario = pricingScenario ?? {
      purpose: PRICING_PURPOSES.TOKEN_INDEX,
      usage: priceComparisonWeights,
    }
    const quote = quoteCanonicalModelPrice(model, scenario, {
      groupMultiplier,
      currency: showRealPrice ? "CNY" : "USD",
      ...(rawItem.source.kind === MODEL_MANAGEMENT_SOURCE_KINDS.ACCOUNT
        ? { cnyPerUsd: resolveKnownAccountExchangeRate(rawItem.source.account) }
        : {}),
    })
    if (
      !quote.source.url &&
      quote.source.kind === PRICING_SOURCE_KINDS.ACCOUNT &&
      rawItem.source.kind === MODEL_MANAGEMENT_SOURCE_KINDS.ACCOUNT
    ) {
      quote.source = {
        ...quote.source,
        url: resolveAccountSitePricingUrl({
          siteType: rawItem.source.account.siteType,
          baseUrl: rawItem.source.account.baseUrl,
          modelName: model.model_name,
        }),
      }
    }
    return {
      ...price,
      quote,
      isComparisonActive: isPriceComparisonActive,
    }
  }
  const activeGroupContext = resolveActiveModelGroupContext({
    context: rawItem.groupContext,
    candidateGroups: groupCandidates,
  })
  const createCalculatedItem = (params: {
    calculatedPrice: ReturnType<typeof calculateModelPrice>
    activeGroupContext: ActiveModelGroupContext
    effectiveGroup?: string
    hasUniquelyOptimalGroup?: boolean
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
    comparableModelIdentity: rawItem.comparableModelIdentity,
    resolvedVendor: rawItem.resolvedVendor,
    hasUniquelyOptimalGroup: params.hasUniquelyOptimalGroup,
  })

  if (
    rawItem.groupContext.accessState ===
    MODEL_GROUP_ACCESS_STATES.NOT_APPLICABLE
  ) {
    return createCalculatedItem({
      calculatedPrice: calculatePrice(rawItem.model, 1),
      activeGroupContext,
    })
  }

  if (isModelPriceUnavailable(rawItem.model)) {
    return createCalculatedItem({
      calculatedPrice: calculatePrice(rawItem.model, 1),
      activeGroupContext,
    })
  }

  if (activeGroupContext.activePriceableGroups.length === 0) {
    const unavailableReason =
      rawItem.groupContext.accessState === MODEL_GROUP_ACCESS_STATES.KNOWN &&
      rawItem.groupContext.usableGroups.length === 0
        ? MODEL_UNAVAILABLE_PRICE_REASONS.NO_USABLE_GROUP
        : MODEL_UNAVAILABLE_PRICE_REASONS.GROUP_RATIO_UNAVAILABLE

    return createCalculatedItem({
      calculatedPrice: {
        kind: CALCULATED_PRICE_KINDS.UNAVAILABLE,
        billingMode: isTokenBillingType(rawItem.model.quota_type)
          ? "token"
          : "per-call",
        reason: unavailableReason,
      },
      activeGroupContext,
    })
  }

  let bestResult: CalculatedModelItem | null = null
  let bestKey: ComparablePriceKey | null = null
  let bestPriceMatchCount = 0

  for (const group of activeGroupContext.activePriceableGroups) {
    const calculatedPrice = calculatePrice(
      rawItem.model,
      rawItem.groupRatios[group],
    )
    const candidateItem = createCalculatedItem({
      calculatedPrice,
      effectiveGroup: group,
      activeGroupContext: resolveActiveModelGroupContext({
        context: rawItem.groupContext,
        candidateGroups: groupCandidates,
        effectiveGroup: group,
      }),
    })
    const candidateKey = getComparablePriceKey(
      candidateItem,
      showRealPrice,
      priceComparisonWeights,
    )

    if (!bestResult || !bestKey) {
      bestResult = candidateItem
      bestKey = candidateKey
      bestPriceMatchCount = 1
      continue
    }

    const priceComparison = comparePriceKeys(candidateKey, bestKey, 1)
    if (priceComparison < 0) {
      bestResult = candidateItem
      bestKey = candidateKey
      bestPriceMatchCount = 1
      continue
    }

    if (priceComparison === 0) {
      bestPriceMatchCount += 1

      if (compareCodePoints(group, bestResult.effectiveGroup ?? "") < 0) {
        bestResult = candidateItem
        bestKey = candidateKey
      }
    }
  }

  // activePriceableGroups is non-empty after the guard above, so the loop
  // always initializes the best candidate. Preserve that invariant for TS.
  const resolvedBestResult = bestResult as CalculatedModelItem

  return {
    ...resolvedBestResult,
    // Keep deterministic tie-breaking for price calculation, but only present
    // one group as optimal when it is the unique lowest-price candidate.
    hasUniquelyOptimalGroup:
      activeGroupContext.activePriceableGroups.length > 1
        ? bestPriceMatchCount === 1
        : undefined,
  }
}

/** Prices already-filtered rows without changing their visibility. */
export function calculateModelListPrices(params: {
  rawItems: ModelListItem[]
  getGroupCandidates: (item: ModelListItem) => string[] | undefined
  showRealPrice: boolean
  priceComparisonWeights: ModelPriceComparisonWeights
  pricingScenario?: PricingScenario
  isPriceComparisonActive?: boolean
}) {
  const {
    rawItems,
    getGroupCandidates,
    showRealPrice,
    priceComparisonWeights,
    pricingScenario,
    isPriceComparisonActive,
  } = params

  return rawItems.map((item) =>
    resolveBestCalculatedItem(
      item,
      getGroupCandidates(item),
      showRealPrice,
      priceComparisonWeights,
      pricingScenario,
      isPriceComparisonActive,
    ),
  )
}

/** Orders evaluated rows and marks comparable minima within matching model and billing units. */
export function rankModelListPrices(params: {
  items: CalculatedModelItem[]
  showRealPrice: boolean
  priceComparisonWeights: ModelPriceComparisonWeights
  sortMode: ModelListSortMode
  compareAcrossSources: boolean
}): CalculatedModelItem[] {
  const {
    items,
    showRealPrice,
    priceComparisonWeights,
    sortMode,
    compareAcrossSources,
  } = params
  const priceKeys = new Map<string, ComparablePriceKey>()
  items.forEach((item) => {
    if (!supportsPricingDerivedBehavior(item)) {
      if (isModelPriceUnavailable(item.model)) {
        priceKeys.set(
          getModelItemKey(item),
          getComparablePriceKey(item, showRealPrice, priceComparisonWeights),
        )
      }
      return
    }

    priceKeys.set(
      getModelItemKey(item),
      getComparablePriceKey(item, showRealPrice, priceComparisonWeights),
    )
  })

  const lowestPriceKeys = new Set<string>()
  if (compareAcrossSources) {
    const groups = new Map<string, CalculatedModelItem[]>()

    items.forEach((item) => {
      const priceKey = priceKeys.get(getModelItemKey(item))
      if (!priceKey) {
        return
      }

      const groupKey = JSON.stringify([
        item.comparableModelIdentity.key,
        priceKey.billingMode,
        comparisonUnit(priceKey),
      ])
      const group = groups.get(groupKey) ?? []
      group.push(item)
      groups.set(groupKey, group)
    })

    groups.forEach((groupItems) => {
      const comparableItems = groupItems.filter((item) => {
        const priceKey = priceKeys.get(getModelItemKey(item))
        return priceKey && hasComparablePriceValue(priceKey)
      })

      // The badge describes this comparison's complete quotes. Provenance
      // remains visible on each quote and does not determine comparability.
      if (comparableItems.length < 2) {
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

  const indexedItems = items.map((item, index) => ({
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
      const modelIdentityComparison = compareCodePoints(
        a.item.comparableModelIdentity.key,
        b.item.comparableModelIdentity.key,
      )
      if (modelIdentityComparison !== 0) {
        return modelIdentityComparison
      }
    }

    const billingModeComparison =
      BILLING_MODE_ORDER[a.priceKey.billingMode] -
      BILLING_MODE_ORDER[b.priceKey.billingMode]
    if (billingModeComparison !== 0) {
      return billingModeComparison
    }

    const priceComparison = comparePriceKeys(a.priceKey, b.priceKey, direction)
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

  return sortedWithIndices.map(({ item, itemKey, priceKey }) => ({
    ...item,
    isLowestPrice: lowestPriceKeys.has(itemKey),
    isPriceComparable:
      priceKey !== undefined && hasComparablePriceValue(priceKey),
  }))
}
