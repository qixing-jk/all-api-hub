import {
  MODEL_LIST_SOURCE_KINDS,
  MODEL_PRICE_PRECISION_KINDS,
  MODEL_PRICE_SOURCE_KINDS,
  MODEL_UNAVAILABLE_PRICE_REASONS,
  type ModelPricing,
  type PricingResponse,
} from "~/services/modelList/pricingModel"
import {
  normalizeModelDescriptors,
  type ModelDescriptor,
} from "~/services/models/modelDescriptor"

interface BuildModelListCatalogPricingResponseParams {
  models: readonly ModelDescriptor[]
  unavailableReason?: (typeof MODEL_UNAVAILABLE_PRICE_REASONS)[keyof typeof MODEL_UNAVAILABLE_PRICE_REASONS]
  source?: PricingResponse["model_list_source"]
}

/**
 * Normalize and de-duplicate model ids returned by upstream model-list endpoints.
 */
export function normalizeModelListModelIds(modelIds: unknown[]): string[] {
  return Array.from(
    new Set(
      modelIds
        .filter(
          (id): id is string => typeof id === "string" && id.trim().length > 0,
        )
        .map((id) => id.trim()),
    ),
  )
}

/**
 * Convert a model descriptor into the minimal pricing-model shape used by Model List.
 */
function createModelListCatalogModel(
  model: ModelDescriptor,
  unavailableReason: (typeof MODEL_UNAVAILABLE_PRICE_REASONS)[keyof typeof MODEL_UNAVAILABLE_PRICE_REASONS] = MODEL_UNAVAILABLE_PRICE_REASONS.MODEL_LIST_ONLY,
): ModelPricing {
  return {
    model_name: model.id,
    ...(model.vendorEvidence === undefined
      ? {}
      : { vendorEvidence: model.vendorEvidence }),
    quota_type: 0,
    model_ratio: 0,
    model_price: 0,
    price_metadata: {
      source: MODEL_PRICE_SOURCE_KINDS.NONE,
      precision: MODEL_PRICE_PRECISION_KINDS.UNAVAILABLE,
      unavailable_reason: unavailableReason,
    },
    completion_ratio: 1,
    enable_groups: [],
    supported_endpoint_types: [],
  }
}

/**
 * Build a minimal Model-List-compatible response for catalog-only sources.
 */
export function buildModelListCatalogPricingResponse({
  models,
  unavailableReason = MODEL_UNAVAILABLE_PRICE_REASONS.MODEL_LIST_ONLY,
  source = {
    kind: MODEL_LIST_SOURCE_KINDS.CATALOG_FALLBACK,
    supportsPricing: false,
  },
}: BuildModelListCatalogPricingResponseParams): PricingResponse {
  return {
    data: normalizeModelDescriptors(models).map((model) =>
      createModelListCatalogModel(model, unavailableReason),
    ),
    group_ratio: {},
    model_list_source: source,
    success: true,
    usable_group: {},
  }
}
