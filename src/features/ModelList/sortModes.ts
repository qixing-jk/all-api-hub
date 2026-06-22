export const MODEL_LIST_SORT_MODES = {
  DEFAULT: "default",
  PRICE_ASC: "price-asc",
  PRICE_DESC: "price-desc",
  MODEL_CHEAPEST_FIRST: "model-cheapest-first",
  VERIFICATION_LATENCY_ASC: "verification-latency-asc",
} as const

export type ModelListSortMode =
  (typeof MODEL_LIST_SORT_MODES)[keyof typeof MODEL_LIST_SORT_MODES]

/** Returns true when the sort mode depends on model pricing metadata. */
export function isModelListPriceSortMode(sortMode: ModelListSortMode) {
  return (
    sortMode === MODEL_LIST_SORT_MODES.PRICE_ASC ||
    sortMode === MODEL_LIST_SORT_MODES.PRICE_DESC ||
    sortMode === MODEL_LIST_SORT_MODES.MODEL_CHEAPEST_FIRST
  )
}
