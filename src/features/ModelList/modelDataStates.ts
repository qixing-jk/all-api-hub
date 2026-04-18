export const MODEL_LIST_QUERY_KEYS = {
  PRICING: "model-pricing",
  CATALOG: "model-catalog",
} as const

export const MODEL_LIST_QUERY_SCOPE_VALUES = {
  NONE: "none",
} as const

export const MODEL_LIST_DATA_ERROR_CODES = {
  INVALID_FORMAT: "INVALID_FORMAT",
} as const

export const MODEL_LIST_ACCOUNT_ERROR_TYPES = {
  INVALID_FORMAT: "invalid-format",
  LOAD_FAILED: "load-failed",
} as const

export type ModelListAccountErrorType =
  (typeof MODEL_LIST_ACCOUNT_ERROR_TYPES)[keyof typeof MODEL_LIST_ACCOUNT_ERROR_TYPES]
