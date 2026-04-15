export const MODEL_LIST_SORT_MODES = {
  DEFAULT: "default",
  PRICE_ASC: "price-asc",
  PRICE_DESC: "price-desc",
  MODEL_CHEAPEST_FIRST: "model-cheapest-first",
} as const

export type ModelListSortMode =
  (typeof MODEL_LIST_SORT_MODES)[keyof typeof MODEL_LIST_SORT_MODES]
