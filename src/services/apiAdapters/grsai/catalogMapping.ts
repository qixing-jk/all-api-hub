import { SITE_TYPES } from "~/constants/siteType"
import {
  GRSAI_CREDITS_PER_USD,
  toOptionalFiniteNumber,
  toOptionalString,
} from "~/services/apiService/grsai/parsing"
import type { GrsaiModel } from "~/services/apiService/grsai/type"
import type { ModelCatalogSnapshot } from "~/services/modelCatalog/snapshot"
import {
  MODEL_LIST_SOURCE_KINDS,
  MODEL_PRICE_PRECISION_KINDS,
  MODEL_PRICE_SOURCE_KINDS,
  MODEL_UNAVAILABLE_PRICE_REASONS,
  type ModelPricing,
} from "~/services/modelList/pricingModel"

/**
 * The console prices every model per call in its own credits. The product's
 * per-call price is a USD figure, so the figure is converted at the
 * deployment's published base rate (see `GRSAI_CREDITS_PER_USD`) and reported
 * as an estimate: credits bought in bulk carry a bonus, which makes the effective
 * rate lower than the base one.
 */
const creditsToUsd = (credits: number): number =>
  credits / GRSAI_CREDITS_PER_USD

const toModelPricing = (model: GrsaiModel): ModelPricing | null => {
  const name = toOptionalString(model.name) ?? toOptionalString(model.model)
  if (!name) return null

  const credits = toOptionalFiniteNumber(model.credits)
  const description = toOptionalString(model.desc)
  const priced = credits !== undefined && credits > 0

  return {
    model_name: name,
    display_name: name,
    ...(description ? { model_description: description } : {}),
    // Every console price is a per-call credit cost; the deployment sells no
    // token-metered models.
    quota_type: 1,
    model_ratio: 0,
    model_price: priced ? creditsToUsd(credits) : 0,
    price_metadata: priced
      ? {
          source: MODEL_PRICE_SOURCE_KINDS.PROVIDER_CATALOG,
          precision: MODEL_PRICE_PRECISION_KINDS.ESTIMATED,
        }
      : {
          source: MODEL_PRICE_SOURCE_KINDS.NONE,
          precision: MODEL_PRICE_PRECISION_KINDS.UNAVAILABLE,
          // Models the console prices per resolution (video) or per quality
          // tier report no per-call figure, so no single price is honest.
          unavailable_reason:
            MODEL_UNAVAILABLE_PRICE_REASONS.PRICING_SOURCE_UNAVAILABLE,
        },
    completion_ratio: 1,
    // The console sells one catalog for the whole account and groups keys
    // rather than restricting them, so there is nothing to scope a model to.
    enable_groups: [],
    supported_endpoint_types: [],
  }
}

/**
 * Builds the Model List snapshot from the console's own catalog.
 *
 * The deployment has no `GET /v1/models`, so the console catalog is the only
 * source of both the model list and its credit pricing.
 */
export function buildGrsaiPricingResponse(
  models: readonly GrsaiModel[],
): ModelCatalogSnapshot {
  const modelsByName = new Map<string, ModelPricing>()

  const effectiveCost = (pricing: ModelPricing): number =>
    pricing.price_metadata?.precision ===
    MODEL_PRICE_PRECISION_KINDS.UNAVAILABLE
      ? Number.POSITIVE_INFINITY
      : typeof pricing.model_price === "number"
        ? pricing.model_price
        : pricing.model_price.input

  for (const model of models) {
    const candidate = toModelPricing(model)
    if (!candidate) continue

    const existing = modelsByName.get(candidate.model_name)
    if (!existing || effectiveCost(candidate) < effectiveCost(existing)) {
      modelsByName.set(candidate.model_name, candidate)
    }
  }

  return {
    success: true,
    data: Array.from(modelsByName.values()),
    groupRatios: {},
    groupAccess: { kind: "not-applicable" },
    model_list_source: {
      kind: MODEL_LIST_SOURCE_KINDS.USER_SCOPED,
      provider: SITE_TYPES.GRSAI,
      supportsPricing: true,
      actionPolicy: {
        // The console has no user-defined groups.
        supportsGroupFiltering: false,
        supportsAccountSummary: true,
        supportsTokenCompatibility: false,
        supportsCredentialVerification: true,
        supportsBatchCredentialVerification: false,
        supportsCliVerification: false,
      },
    },
  }
}
