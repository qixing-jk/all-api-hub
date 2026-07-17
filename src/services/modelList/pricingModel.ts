import type { AccountSiteType } from "~/constants/siteType"
import type { ModelVendorEvidence } from "~/services/models/modelDescriptor"

export type PerCallPrice = number | { input: number; output: number }

// Product-owned Model List pricing shape. Upstream adapters map their native
// payloads into this shape before Model List consumes it.
export interface ModelPricing {
  model_name: string
  vendorEvidence?: ModelVendorEvidence
  model_description?: string
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
  price_metadata?: ModelPriceMetadata
  owner_by?: string
  completion_ratio: number
  enable_groups: string[]
  supported_endpoint_types: string[]
}

export const MODEL_LIST_SOURCE_KINDS = {
  USER_SCOPED: "user-scoped",
  CATALOG_FALLBACK: "catalog-fallback",
  SUB2API_RUNTIME_KEY: "sub2api-runtime-key",
} as const

export type ModelListSourceKind =
  (typeof MODEL_LIST_SOURCE_KINDS)[keyof typeof MODEL_LIST_SOURCE_KINDS]

export const MODEL_PRICE_SOURCE_KINDS = {
  NONE: "none",
  OFFICIAL_RATE_ESTIMATE: "official-rate-estimate",
  CHANNEL_PRICING: "channel-pricing",
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
  supportsRuntimeModelList?: boolean
  supportsPricing?: boolean
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
