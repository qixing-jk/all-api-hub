import type { AccountSiteType } from "~/constants/siteType"
import type { ModelVendorEvidence } from "~/services/models/modelDescriptor"
import type { ModelPresentation } from "~/services/models/modelDisplayFacts"

export type PerCallPrice = number | { input: number; output: number }

// Product-owned Model List pricing shape. Upstream adapters map their native
// payloads into this shape before Model List consumes it.
export interface ProductCanonicalModel {
  model_name: string
  display_name?: string
  vendorEvidence?: ModelVendorEvidence
  model_description?: string
  presentation?: ModelPresentation
  quota_type: number // 0 = token billing, 1 = per-call billing
  model_ratio: number
  model_price: number | PerCallPrice
  /**
   * Direct token prices in USD per 1M tokens for providers that do not expose
   * One-API/New-API ratio semantics.
   */
  token_price_usd_per_million?: {
    input?: number
    output?: number
    cache_read?: number
    cache_write?: number
  }
  /** Cache meter multipliers relative to the effective input token price. */
  token_price_ratios_to_input?: {
    cache_read?: number
    cache_write?: number
  }
  price_metadata?: ModelPriceMetadata
  owner_by?: string
  completion_ratio: number
  enable_groups: string[]
  supported_endpoint_types: string[]
}

/** Historical Model List name retained while callers migrate terminology. */
export type ModelPricing = ProductCanonicalModel

export const MODEL_LIST_SOURCE_KINDS = {
  USER_SCOPED: "user-scoped",
  CATALOG_FALLBACK: "catalog-fallback",
  SUB2API_RUNTIME_KEY: "sub2api-runtime-key",
  PROVIDER_CATALOG: "provider-catalog",
} as const

export type ModelListSourceKind =
  (typeof MODEL_LIST_SOURCE_KINDS)[keyof typeof MODEL_LIST_SOURCE_KINDS]

export const MODEL_CATALOG_SCOPES = {
  PERSONALIZED: "personalized",
  PROVIDER: "provider",
} as const

export type ModelCatalogScope =
  (typeof MODEL_CATALOG_SCOPES)[keyof typeof MODEL_CATALOG_SCOPES]

export const MODEL_CATALOG_FAILURE_CATEGORIES = {
  AUTH: "auth",
  PERMISSION: "permission",
  INVALID_RESPONSE: "invalid-response",
  CANCELLATION: "cancellation",
  RATE_LIMIT: "rate-limit",
  NETWORK: "network",
  UPSTREAM: "upstream",
} as const

export type ModelCatalogFailureCategory =
  (typeof MODEL_CATALOG_FAILURE_CATEGORIES)[keyof typeof MODEL_CATALOG_FAILURE_CATEGORIES]

export const MODEL_PRICE_SOURCE_KINDS = {
  NONE: "none",
  OFFICIAL_RATE_ESTIMATE: "official-rate-estimate",
  CHANNEL_PRICING: "channel-pricing",
  PROVIDER_CATALOG: "provider-catalog",
} as const

export type ModelPriceSourceKind =
  (typeof MODEL_PRICE_SOURCE_KINDS)[keyof typeof MODEL_PRICE_SOURCE_KINDS]

export const MODEL_PRICE_PRECISION_KINDS = {
  EXACT: "exact",
  ESTIMATED: "estimated",
  UNAVAILABLE: "unavailable",
} as const

export type ModelPricePrecisionKind =
  (typeof MODEL_PRICE_PRECISION_KINDS)[keyof typeof MODEL_PRICE_PRECISION_KINDS]

export const MODEL_UNAVAILABLE_PRICE_REASONS = {
  MODEL_LIST_ONLY: "model-list-only",
  NO_USABLE_GROUP: "no-usable-group",
  GROUP_RATIO_UNAVAILABLE: "group-ratio-unavailable",
  KEY_GROUP_UNKNOWN: "key-group-unknown",
  OFFICIAL_PRICE_MISSING: "official-price-missing",
  OFFICIAL_PRICE_INVALID: "official-price-invalid",
  PRICING_SOURCE_UNAVAILABLE: "pricing-source-unavailable",
} as const

export type ModelUnavailablePriceReason =
  (typeof MODEL_UNAVAILABLE_PRICE_REASONS)[keyof typeof MODEL_UNAVAILABLE_PRICE_REASONS]

export interface ModelPriceMetadata {
  source: ModelPriceSourceKind
  precision: ModelPricePrecisionKind
  unavailable_reason?: ModelUnavailablePriceReason
  source_date?: string
  unmatched_model_count?: number
}

export interface ModelListSourceInfo {
  kind: ModelListSourceKind
  provider?: AccountSiteType
  catalogScope?: ModelCatalogScope
  catalogFallback?: {
    from: ModelCatalogScope
    failureCategory: ModelCatalogFailureCategory
  }
  supportsRuntimeModelList?: boolean
  supportsPricing?: boolean
  actionPolicy?: ModelListSourceActionPolicy
}

/** Provider-neutral downgrades for actions and account-scoped presentation. */
export interface ModelListSourceActionPolicy {
  supportsRatioDisplay?: boolean
  supportsGroupFiltering?: boolean
  supportsAccountSummary?: boolean
  supportsTokenCompatibility?: boolean
  supportsCredentialVerification?: boolean
  supportsBatchCredentialVerification?: boolean
  supportsCliVerification?: boolean
}

/**
 * Returns whether a model row intentionally lacks usable pricing data.
 */
export function isModelPriceUnavailable(
  model: Pick<ModelPricing, "price_metadata">,
) {
  return (
    model.price_metadata?.precision === MODEL_PRICE_PRECISION_KINDS.UNAVAILABLE
  )
}

export interface PricingResponse {
  data: ModelPricing[]
  group_ratio: Record<string, number>
  success: boolean
  usable_group: Record<string, unknown>
  model_list_source?: ModelListSourceInfo
}
