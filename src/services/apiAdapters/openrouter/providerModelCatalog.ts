import { SITE_TYPES } from "~/constants/siteType"
import { OPENROUTER_DISPLAY_NAME } from "~/services/accountSiteDefinitions/identifiers"
import type { ProviderModelCatalogCapability } from "~/services/apiAdapters/contracts/providerModelCatalog"
import { normalizeOpenRouterModel } from "~/services/apiAdapters/openrouter/modelPresentation"
import { fetchOpenRouterPublicModelCatalog } from "~/services/apiService/openrouter/publicModelCatalog"
import type { OpenRouterPublicModel } from "~/services/apiService/openrouter/publicModelCatalogSchemas"
import {
  MODEL_LIST_SOURCE_KINDS,
  MODEL_PRICE_PRECISION_KINDS,
  MODEL_PRICE_SOURCE_KINDS,
  MODEL_UNAVAILABLE_PRICE_REASONS,
} from "~/services/modelList/pricingModel"
import type { ProviderModelCatalogModel } from "~/services/modelList/providerCatalogAdmission"

const OPENROUTER_PUBLIC_MODEL_CATALOG_CACHE_TTL_MS = 5 * 60 * 1000
const OPENROUTER_PROVIDER_MODEL_CATALOG_SOURCE_ID = "openrouter-public"

/** Maps one OpenRouter DTO into the product-owned canonical model shape. */
function adaptOpenRouterPublicModel(
  model: OpenRouterPublicModel,
): ProviderModelCatalogModel {
  const normalized = normalizeOpenRouterModel(model)
  const {
    inputPrice,
    outputPrice,
    cacheReadPrice,
    cacheWritePrice,
    hasInvalidPrimaryPrice,
  } = normalized.pricing
  const hasPrimaryPrice = inputPrice !== undefined && outputPrice !== undefined

  return {
    model_name: model.id,
    ...(normalized.displayName ? { display_name: normalized.displayName } : {}),
    ...(normalized.description
      ? { model_description: normalized.description }
      : {}),
    ...(normalized.vendorEvidence
      ? { vendorEvidence: normalized.vendorEvidence }
      : {}),
    ...(normalized.presentation
      ? { presentation: normalized.presentation }
      : {}),
    quota_type: 0,
    model_ratio: 0,
    model_price: 0,
    ...(hasPrimaryPrice ||
    cacheReadPrice !== undefined ||
    cacheWritePrice !== undefined
      ? {
          token_price_usd_per_million: {
            ...(hasPrimaryPrice
              ? { input: inputPrice, output: outputPrice }
              : {}),
            ...(cacheReadPrice !== undefined
              ? { cache_read: cacheReadPrice }
              : {}),
            ...(cacheWritePrice !== undefined
              ? { cache_write: cacheWritePrice }
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
          unavailable_reason: hasInvalidPrimaryPrice
            ? MODEL_UNAVAILABLE_PRICE_REASONS.OFFICIAL_PRICE_INVALID
            : MODEL_UNAVAILABLE_PRICE_REASONS.OFFICIAL_PRICE_MISSING,
        },
    completion_ratio: 1,
    enable_groups: [],
    supported_endpoint_types: [],
  }
}

export const openRouterProviderModelCatalog: ProviderModelCatalogCapability = {
  source: {
    id: OPENROUTER_PROVIDER_MODEL_CATALOG_SOURCE_ID,
    provider: SITE_TYPES.OPENROUTER,
    displayName: OPENROUTER_DISPLAY_NAME,
    cacheTtlMs: OPENROUTER_PUBLIC_MODEL_CATALOG_CACHE_TTL_MS,
  },
  async fetchPricing(request) {
    const models = await fetchOpenRouterPublicModelCatalog(request.abortSignal)

    return {
      data: models.map(adaptOpenRouterPublicModel),
      group_ratio: {},
      success: true,
      usable_group: {},
      model_list_source: {
        kind: MODEL_LIST_SOURCE_KINDS.PROVIDER_CATALOG,
        provider: SITE_TYPES.OPENROUTER,
        supportsRuntimeModelList: false,
        supportsPricing: true,
        actionPolicy: {
          supportsRatioDisplay: false,
          supportsGroupFiltering: false,
          supportsAccountSummary: false,
          supportsTokenCompatibility: false,
          supportsCredentialVerification: false,
          supportsBatchCredentialVerification: false,
          supportsCliVerification: false,
        },
      },
    }
  },
}
