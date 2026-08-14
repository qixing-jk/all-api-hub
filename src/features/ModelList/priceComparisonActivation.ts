import {
  MODEL_LIST_BILLING_MODES,
  type ModelListBillingMode,
} from "~/features/ModelList/billingModes"
import {
  ALL_ACCOUNTS_SOURCE_VALUE,
  MODEL_MANAGEMENT_SOURCE_KINDS,
  type ModelManagementSource,
  type ModelManagementSourceCapabilities,
} from "~/features/ModelList/modelManagementSources"
import {
  MODEL_LIST_SORT_MODES,
  type ModelListSortMode,
} from "~/features/ModelList/sortModes"
import { trackProductAnalyticsActionCompleted } from "~/services/productAnalytics/actions"
import {
  PRODUCT_ANALYTICS_ACTION_IDS,
  PRODUCT_ANALYTICS_ENTRYPOINTS,
  PRODUCT_ANALYTICS_FEATURE_IDS,
  PRODUCT_ANALYTICS_MODE_IDS,
  PRODUCT_ANALYTICS_RESULTS,
  PRODUCT_ANALYTICS_TARGET_KINDS,
  type ProductAnalyticsSurfaceId,
} from "~/services/productAnalytics/contracts"

interface PriceComparisonState {
  selectedSource: ModelManagementSource | null
  sourceCapabilities: ModelManagementSourceCapabilities
  isAllAccountsSource: boolean
  sortMode: ModelListSortMode
  selectedBillingMode: ModelListBillingMode
  selectedGroups: string[]
  showRealPrice: boolean
}

/** Returns whether the model list already matches the one-click comparison state. */
function isModelPriceComparisonActive(state: PriceComparisonState): boolean {
  return (
    state.isAllAccountsSource &&
    state.sortMode === MODEL_LIST_SORT_MODES.MODEL_CHEAPEST_FIRST &&
    state.selectedBillingMode === MODEL_LIST_BILLING_MODES.ALL &&
    state.selectedGroups.length === 0 &&
    state.showRealPrice
  )
}

/** Returns whether the one-click comparison shortcut should be offered. */
export function canEnableModelPriceComparison(
  state: PriceComparisonState,
): boolean {
  return (
    state.sourceCapabilities.supportsPricing &&
    state.selectedSource?.kind !== MODEL_MANAGEMENT_SOURCE_KINDS.PROFILE &&
    !isModelPriceComparisonActive(state)
  )
}

interface EnableModelPriceComparisonParams {
  isAllAccountsSource: boolean
  setSelectedSourceValue?: (sourceValue: string) => void
  setSortMode: (mode: ModelListSortMode) => void
  setSelectedBillingMode: (mode: ModelListBillingMode) => void
  setSelectedGroups: (groups: string[]) => void
  setShowRealPrice: (show: boolean) => void
  searchTerm: string
  surfaceId: ProductAnalyticsSurfaceId
}

/** Applies the existing one-click comparison state and records its entry surface. */
export function enableModelPriceComparison({
  isAllAccountsSource,
  setSelectedSourceValue,
  setSortMode,
  setSelectedBillingMode,
  setSelectedGroups,
  setShowRealPrice,
  searchTerm,
  surfaceId,
}: EnableModelPriceComparisonParams): void {
  if (!isAllAccountsSource) {
    setSelectedSourceValue?.(ALL_ACCOUNTS_SOURCE_VALUE)
  }
  setSortMode(MODEL_LIST_SORT_MODES.MODEL_CHEAPEST_FIRST)
  setSelectedBillingMode(MODEL_LIST_BILLING_MODES.ALL)
  setSelectedGroups([])
  setShowRealPrice(true)

  void trackProductAnalyticsActionCompleted({
    featureId: PRODUCT_ANALYTICS_FEATURE_IDS.ModelList,
    actionId: PRODUCT_ANALYTICS_ACTION_IDS.EnableModelPriceComparison,
    surfaceId,
    entrypoint: PRODUCT_ANALYTICS_ENTRYPOINTS.Options,
    result: PRODUCT_ANALYTICS_RESULTS.Success,
    insights: {
      targetKind: PRODUCT_ANALYTICS_TARGET_KINDS.ModelFilter,
      mode: PRODUCT_ANALYTICS_MODE_IDS.All,
      filterCount: 1 + (searchTerm.trim() ? 1 : 0),
    },
  })
}
