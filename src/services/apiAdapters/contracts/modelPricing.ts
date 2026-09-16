import type { ApiServiceRequest } from "~/services/apiTransport/type"
import type { ModelCatalogSnapshot } from "~/services/modelCatalog/snapshot"

export type ModelPricingRequest = ApiServiceRequest

export const MODEL_PRICING_RUNTIME_KEY_FALLBACKS = {
  ACCOUNT_PRICING: "account-pricing",
} as const

export type ModelPricingCapability = {
  fetchPricing(request: ModelPricingRequest): Promise<ModelCatalogSnapshot>
  /** Invalidates provider-owned shared snapshots before a manual refresh. */
  invalidateCache?(): void
  /** Uses account pricing for fallback when runtime key secrets cannot be revealed. */
  runtimeKeyFallback?: (typeof MODEL_PRICING_RUNTIME_KEY_FALLBACKS)[keyof typeof MODEL_PRICING_RUNTIME_KEY_FALLBACKS]
}
