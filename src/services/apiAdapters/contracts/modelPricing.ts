import type { ApiServiceRequest } from "~/services/apiTransport/type"
import type { PricingResponse } from "~/services/modelList/pricingModel"

export type ModelPricingRequest = ApiServiceRequest

export const MODEL_PRICING_RUNTIME_KEY_FALLBACKS = {
  ACCOUNT_PRICING: "account-pricing",
} as const

export type ModelPricingCapability = {
  fetchPricing(request: ModelPricingRequest): Promise<PricingResponse>
  /** Invalidates provider-owned shared snapshots before a manual refresh. */
  invalidateCache?(): void
  /** Uses account pricing for fallback when runtime key secrets cannot be revealed. */
  runtimeKeyFallback?: (typeof MODEL_PRICING_RUNTIME_KEY_FALLBACKS)[keyof typeof MODEL_PRICING_RUNTIME_KEY_FALLBACKS]
}
