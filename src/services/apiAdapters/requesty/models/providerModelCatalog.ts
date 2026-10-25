import {
  REQUESTY_API_BASE_URL,
  REQUESTY_DISPLAY_NAME,
  SITE_TYPES,
} from "~/services/accountSiteDefinitions/identifiers"
import type { ProviderModelCatalogCapability } from "~/services/apiAdapters/contracts/providerModelCatalog"
import type { RequestyPublicModel } from "~/services/apiService/requesty/publicModelCatalog"
import { fetchRequestyPublicModelCatalog } from "~/services/apiService/requesty/publicModelCatalog"
import {
  MODEL_CATALOG_SCOPES,
  MODEL_LIST_SOURCE_KINDS,
  MODEL_PRICE_PRECISION_KINDS,
  MODEL_PRICE_SOURCE_KINDS,
  MODEL_UNAVAILABLE_PRICE_REASONS,
} from "~/services/modelList/pricingModel"
import type { ProviderModelCatalogModel } from "~/services/modelList/providerCatalogAdmission"
import {
  PRICE_RATE_UNITS,
  PRICING_GROUP_MULTIPLIERS,
  PRICING_ISSUE_CODES,
  PRICING_METERS,
  PRICING_SOURCE_KINDS,
} from "~/services/modelPricing/pricingConstants"
import type { PricingPlan } from "~/services/modelPricing/pricingPlan"

const REQUESTY_PROVIDER_MODEL_CATALOG_SOURCE_ID = "requesty-public"
const REQUESTY_PROVIDER_MODEL_CATALOG_CACHE_TTL_MS = 5 * 60 * 1000

/** Requesty quotes USD per token; the quote engine takes explicit per-token rates. */
const tokenRate = (usdPerToken: number) => ({
  amount: usdPerToken,
  currency: "USD" as const,
  unit: PRICE_RATE_UNITS.TOKEN,
  per: 1,
})

/** Whether the upstream quote carries usable input/output prices. */
const hasUsablePrimaryPrice = (model: RequestyPublicModel): boolean =>
  Number.isFinite(model.inputPrice) &&
  Number.isFinite(model.outputPrice) &&
  model.inputPrice >= 0 &&
  model.outputPrice >= 0

/** Builds the canonical pricing plan from Requesty's per-token catalog quote. */
function buildPricingPlan(model: RequestyPublicModel): PricingPlan {
  const hasPrimaryPrice = hasUsablePrimaryPrice(model)
  const plan: PricingPlan = {
    // Unpriced rows must not carry rates: the admission boundary rejects
    // negative or non-finite amounts outright.
    rates: hasPrimaryPrice
      ? {
          [PRICING_METERS.INPUT]: tokenRate(model.inputPrice),
          [PRICING_METERS.OUTPUT]: tokenRate(model.outputPrice),
          ...(model.cachedPrice !== undefined
            ? { [PRICING_METERS.CACHE_READ]: tokenRate(model.cachedPrice) }
            : {}),
        }
      : {},
    rules: [],
    groupMultiplier: PRICING_GROUP_MULTIPLIERS.INCLUDED,
    source: {
      kind: PRICING_SOURCE_KINDS.CATALOG,
      capturedAt: new Date().toISOString(),
      url: `${REQUESTY_API_BASE_URL}/models`,
    },
    issues: [],
    ...(model.contextWindow
      ? { limits: { totalTokens: model.contextWindow } }
      : {}),
  }
  return plan
}

/** Maps one Requesty catalog row into the canonical model shape. */
function adaptRequestyModel(
  model: RequestyPublicModel,
): ProviderModelCatalogModel {
  const hasPrimaryPrice = hasUsablePrimaryPrice(model)
  const plan = buildPricingPlan(model)
  if (!hasPrimaryPrice) {
    plan.issues.push({
      code: PRICING_ISSUE_CODES.PRICE_UNAVAILABLE,
      meters: [PRICING_METERS.INPUT, PRICING_METERS.OUTPUT],
    })
  }
  return {
    model_name: model.id,
    ...(model.description ? { model_description: model.description } : {}),
    pricingPlan: plan,
    // Exact provider quotes must also carry the canonical per-million-token
    // prices the provider catalog admission boundary validates against.
    ...(hasPrimaryPrice
      ? {
          token_price_usd_per_million: {
            input: model.inputPrice * 1e6,
            output: model.outputPrice * 1e6,
            ...(model.cachedPrice !== undefined
              ? { cache_read: model.cachedPrice * 1e6 }
              : {}),
          },
        }
      : {}),
    price_metadata: hasPrimaryPrice
      ? {
          source: MODEL_PRICE_SOURCE_KINDS.PROVIDER_CATALOG,
          precision: MODEL_PRICE_PRECISION_KINDS.EXACT,
        }
      : {
          source: MODEL_PRICE_SOURCE_KINDS.PROVIDER_CATALOG,
          precision: MODEL_PRICE_PRECISION_KINDS.UNAVAILABLE,
          unavailable_reason:
            MODEL_UNAVAILABLE_PRICE_REASONS.OFFICIAL_PRICE_MISSING,
        },
    quota_type: 0,
    model_ratio: 0,
    model_price: 0,
    completion_ratio: 1,
    enable_groups: [],
    supported_endpoint_types: [],
  }
}

export const requestyProviderModelCatalog: ProviderModelCatalogCapability = {
  source: {
    id: REQUESTY_PROVIDER_MODEL_CATALOG_SOURCE_ID,
    provider: SITE_TYPES.REQUESTY,
    displayName: REQUESTY_DISPLAY_NAME,
    cacheTtlMs: REQUESTY_PROVIDER_MODEL_CATALOG_CACHE_TTL_MS,
  },
  async fetchPricing() {
    const models = await fetchRequestyPublicModelCatalog()
    return {
      data: models.map(adaptRequestyModel),
      groupRatios: {},
      success: true,
      groupAccess: { kind: "not-applicable" },
      model_list_source: {
        kind: MODEL_LIST_SOURCE_KINDS.PROVIDER_CATALOG,
        provider: SITE_TYPES.REQUESTY,
        catalogScope: MODEL_CATALOG_SCOPES.PROVIDER,
        supportsRuntimeModelList: false,
        supportsPricing: true,
        actionPolicy: {
          supportsGroupFiltering: false,
          supportsAccountSummary: false,
          supportsTokenCompatibility: false,
          supportsCredentialVerification: false,
          supportsBatchCredentialVerification: false,
          supportsCliVerification: false,
        },
      },
    } as const
  },
}
