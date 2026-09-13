import { isTokenBillingType } from "~/services/models/utils/modelPricing"

export const MODEL_LIST_BILLING_MODES = {
  ALL: "all",
  TOKEN_BASED: "token-based",
  PER_CALL: "per-call",
} as const

export type ModelListBillingMode =
  (typeof MODEL_LIST_BILLING_MODES)[keyof typeof MODEL_LIST_BILLING_MODES]

/** Maps quota type values onto the model-list billing modes. */
export function getModelBillingMode(quotaType: number) {
  return isTokenBillingType(quotaType)
    ? MODEL_LIST_BILLING_MODES.TOKEN_BASED
    : MODEL_LIST_BILLING_MODES.PER_CALL
}
