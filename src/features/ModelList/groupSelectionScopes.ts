export const MODEL_LIST_GROUP_SELECTION_SCOPES = {
  SINGLE_SOURCE: "single-source",
  ALL_ACCOUNTS: "all-accounts",
} as const

export type ModelListGroupSelectionScope =
  (typeof MODEL_LIST_GROUP_SELECTION_SCOPES)[keyof typeof MODEL_LIST_GROUP_SELECTION_SCOPES]
