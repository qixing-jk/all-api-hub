export const MODEL_LIST_BILLING_MODES = {
  ALL: "all",
  TOKEN_BASED: "token-based",
  PER_CALL: "per-call",
} as const

export type ModelListBillingMode =
  (typeof MODEL_LIST_BILLING_MODES)[keyof typeof MODEL_LIST_BILLING_MODES]
