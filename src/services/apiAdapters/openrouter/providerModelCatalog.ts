import { SITE_TYPES } from "~/constants/siteType"
import { OPENROUTER_DISPLAY_NAME } from "~/services/accountSiteDefinitions/identifiers"
import type { ProviderModelCatalogCapability } from "~/services/apiAdapters/contracts/providerModelCatalog"
import { normalizeOpenRouterModel } from "~/services/apiAdapters/openrouter/modelPresentation"
import { fetchOpenRouterPersonalizedModelCatalog } from "~/services/apiService/openrouter/personalizedModelCatalog"
import { fetchOpenRouterPublicModelCatalog } from "~/services/apiService/openrouter/publicModelCatalog"
import type { OpenRouterPublicModel } from "~/services/apiService/openrouter/publicModelCatalogSchemas"
import {
  MODEL_CATALOG_SCOPES,
  MODEL_LIST_SOURCE_KINDS,
  MODEL_PRICE_PRECISION_KINDS,
  MODEL_PRICE_SOURCE_KINDS,
  MODEL_UNAVAILABLE_PRICE_REASONS,
} from "~/services/modelList/pricingModel"
import type { ProviderModelCatalogModel } from "~/services/modelList/providerCatalogAdmission"

const OPENROUTER_PUBLIC_MODEL_CATALOG_CACHE_TTL_MS = 5 * 60 * 1000
const OPENROUTER_PROVIDER_MODEL_CATALOG_SOURCE_ID = "openrouter-public"

/** Maps one OpenRouter DTO into the product-owned canonical model shape. */
function adaptOpenRouterModel(
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

/** Decorates normalized OpenRouter rows with their catalog visibility scope. */
function createOpenRouterCatalogPricingResponse(
  models: OpenRouterPublicModel[],
  catalogScope: (typeof MODEL_CATALOG_SCOPES)[keyof typeof MODEL_CATALOG_SCOPES],
) {
  return {
    data: models.map(adaptOpenRouterModel),
    group_ratio: {},
    success: true,
    usable_group: {},
    model_list_source: {
      kind: MODEL_LIST_SOURCE_KINDS.PROVIDER_CATALOG,
      provider: SITE_TYPES.OPENROUTER,
      catalogScope,
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
  } as const
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
    return createOpenRouterCatalogPricingResponse(
      models,
      MODEL_CATALOG_SCOPES.PROVIDER,
    )
  },
  personalized: {
    // Ticket 01's sanitized live response recorded `private, no-store`:
    // .scratch/openrouter-model-catalog/issues/01-validate-personalized-catalog-contract.md
    // React Query may retain the current account result in memory, but it is
    // always immediately stale and never enters the provider-wide cache.
    cacheTtlMs: 0,
    async fetchPricing(request) {
      const models = await fetchOpenRouterPersonalizedModelCatalog({
        accountId: request.accountId,
        managementKey: request.credential,
        abortSignal: request.abortSignal,
      })
      return createOpenRouterCatalogPricingResponse(
        models,
        MODEL_CATALOG_SCOPES.PERSONALIZED,
      )
    },
  },
}
