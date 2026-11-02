import { SITE_TYPES } from "~/constants/siteType"
import { AIMLAPI_DISPLAY_NAME } from "~/services/accountSiteDefinitions/identifiers"
import type { ModelPricingCapability } from "~/services/apiAdapters/contracts/modelPricing"
import type { ProviderModelCatalogCapability } from "~/services/apiAdapters/contracts/providerModelCatalog"
import { AIMLAPI_CATALOG_PRICING_URL } from "~/services/apiService/aimlapi/apiPricing"
import { AIMLAPI_MODEL_ENDPOINT_TYPES as endpointTypes } from "~/services/apiService/aimlapi/constants"
import { fetchAimlApiModelCatalog } from "~/services/apiService/aimlapi/models"
import { fetchAimlApiPrices } from "~/services/apiService/aimlapi/pricing"
import type { ApiServiceRequest } from "~/services/apiTransport/type"
import {
  MODEL_CATALOG_SCOPES,
  MODEL_LIST_SOURCE_KINDS,
  MODEL_PRICE_PRECISION_KINDS,
  MODEL_PRICE_SOURCE_KINDS,
  MODEL_UNAVAILABLE_PRICE_REASONS,
  type ModelUnavailablePriceReason,
} from "~/services/modelList/pricingModel"
import type {
  ProviderModelCatalogModel,
  ProviderModelCatalogPricingResponse,
} from "~/services/modelList/providerCatalogAdmission"
import {
  PRICING_GROUP_MULTIPLIERS,
  PRICING_SOURCE_KINDS,
  PRICING_USAGE_MODES,
} from "~/services/modelPricing/pricingConstants"
import {
  createModelDisplayLabel,
  MODEL_DISPLAY_FACT_LABELS,
} from "~/services/models/modelDisplayFacts"
import type { ModelDisplayFact } from "~/services/models/modelDisplayFacts"
import { isAbortError } from "~/services/verification/aiApiVerification/utils"
import { AuthTypeEnum } from "~/types"

const AIMLAPI_PRICING_CACHE_VERSION = "structured-pricing-v13"
const AIMLAPI_PROVIDER_CATALOG_SOURCE_ID = `aimlapi-public-${AIMLAPI_PRICING_CACHE_VERSION}`
const AIMLAPI_PROVIDER_CATALOG_CACHE_TTL_MS = 10 * 60 * 1000

/**
 * Inference protocols a catalogue row declares, expressed as the extension's
 * endpoint types. The deployment publishes its own route names, so this table
 * is the only place that translation happens.
 */
const ENDPOINT_TYPES: Readonly<Record<string, string>> = {
  [endpointTypes.Chat]: "openai",
  [endpointTypes.Responses]: "openai-response",
  [endpointTypes.ImageGeneration]: "openai",
  [endpointTypes.ImageEditing]: "openai",
  [endpointTypes.Embeddings]: "openai",
  [endpointTypes.Messages]: "anthropic",
  [endpointTypes.VideoGeneration]: "openai",
  [endpointTypes.TextToSpeech]: "openai",
  [endpointTypes.SpeechToText]: "openai",
  [endpointTypes.AudioGeneration]: "openai",
  [endpointTypes.Ocr]: "openai",
}

const endpointTypesFor = (type: string): string[] => {
  const mapped = ENDPOINT_TYPES[type]
  return mapped ? [mapped] : []
}

/** Maps one public catalogue row into the product-owned canonical shape. */
function adaptAimlApiModel(
  model: Awaited<ReturnType<typeof fetchAimlApiModelCatalog>>[number],
  prices: Awaited<ReturnType<typeof fetchAimlApiPrices>>["prices"],
  unavailableReason: ModelUnavailablePriceReason,
): ProviderModelCatalogModel {
  const price = prices.get(model.id)
  const facts: ModelDisplayFact[] = [
    {
      type: "text",
      label: createModelDisplayLabel(
        "displayFacts.catalogScope",
        "Catalog scope",
      ),
      value: createModelDisplayLabel(
        "displayFacts.providerReferenceCatalog",
        "Full site catalogue",
      ),
    },
  ]
  if (model.info.contextLength && model.info.contextLength > 0) {
    facts.push({
      type: "token-quantity",
      label: MODEL_DISPLAY_FACT_LABELS.ContextLimit,
      value: model.info.contextLength,
    })
  }
  if (model.info.outputMax && model.info.outputMax > 0) {
    facts.push({
      type: "token-quantity",
      label: MODEL_DISPLAY_FACT_LABELS.MaximumOutputTokens,
      value: model.info.outputMax,
    })
  }

  return {
    model_name: model.id,
    ...(model.info.name.trim() ? { display_name: model.info.name.trim() } : {}),
    ...(model.info.description
      ? { model_description: model.info.description }
      : {}),
    owner_by: model.info.developer,
    vendorEvidence: { kind: "publisher", name: model.info.developer },
    quota_type: 0,
    model_ratio: 0,
    model_price: 0,
    completion_ratio: 1,
    enable_groups: [],
    supported_endpoint_types: endpointTypesFor(model.type),
    presentation: { summaryFacts: facts },
    ...(price
      ? {
          ...(price.tokenPrices
            ? { token_price_usd_per_million: price.tokenPrices }
            : {}),
          pricingPlan: {
            rates: price.rates,
            ...(price.requiredUsage
              ? { requiredUsage: price.requiredUsage }
              : {}),
            ...(price.usageMode ? { usageMode: price.usageMode } : {}),
            ...(price.comparison ? { comparison: price.comparison } : {}),
            rules: price.rules ?? [],
            ...(price.requiresRuleMatch ? { requiresRuleMatch: true } : {}),
            groupMultiplier: PRICING_GROUP_MULTIPLIERS.INCLUDED,
            source: {
              kind: PRICING_SOURCE_KINDS.CATALOG,
              url: price.sourceUrl ?? AIMLAPI_CATALOG_PRICING_URL,
              ...(price.notes ? { notes: price.notes } : {}),
              ...(price.hasUnpricedCharges ? { hasUnpricedCharges: true } : {}),
              ...(price.rulesUnavailable ? { rulesUnavailable: true } : {}),
            },
            issues: price.issues ?? [],
          },
        }
      : {}),
    price_metadata: {
      source: MODEL_PRICE_SOURCE_KINDS.PROVIDER_CATALOG,
      precision: price?.rulesUnavailable
        ? MODEL_PRICE_PRECISION_KINDS.UNAVAILABLE
        : price?.estimated
          ? MODEL_PRICE_PRECISION_KINDS.ESTIMATED
          : price
            ? MODEL_PRICE_PRECISION_KINDS.EXACT
            : MODEL_PRICE_PRECISION_KINDS.UNAVAILABLE,
      ...(price?.rulesUnavailable
        ? {
            unavailable_reason:
              MODEL_UNAVAILABLE_PRICE_REASONS.PRICING_RULES_UNAVAILABLE,
          }
        : price
          ? {}
          : {
              billing_mode_known: false,
              unavailable_reason: unavailableReason,
            }),
      source_url: price?.sourceUrl ?? AIMLAPI_CATALOG_PRICING_URL,
      ...(price?.usageMode === PRICING_USAGE_MODES.CUSTOM
        ? { billing_mode_known: false }
        : {}),
    },
  }
}

/** Pricing failures preserve discovery; cancellation still cancels the load. */
async function fetchCatalogRows(request: ApiServiceRequest) {
  const modelsPromise = fetchAimlApiModelCatalog(request, {
    includePricing: true,
  })
  const pricingPromise = fetchAimlApiPrices(modelsPromise).catch((error) => {
    if (isAbortError(error, request.abortSignal)) throw error
    return {
      prices: new Map(),
      publishedIds: new Set<string>(),
      missingPriceIds: new Set<string>(),
      sourceAvailable: false,
    }
  })
  const [models, pricing] = await Promise.all([modelsPromise, pricingPromise])
  const { prices, publishedIds } = pricing
  // AIMLAPI publishes one row per endpoint, while card identity is model id.
  // Merge endpoint capabilities before either catalog reaches the shared UI.
  const byId = new Map<string, ProviderModelCatalogModel>()
  for (const model of models) {
    const existing = byId.get(model.id)
    if (existing) {
      existing.supported_endpoint_types = Array.from(
        new Set([
          ...(existing.supported_endpoint_types ?? []),
          ...endpointTypesFor(model.type),
        ]),
      )
    } else {
      const reason = !pricing.sourceAvailable
        ? MODEL_UNAVAILABLE_PRICE_REASONS.PRICING_SOURCE_UNAVAILABLE
        : publishedIds.has(model.id) && !pricing.missingPriceIds.has(model.id)
          ? MODEL_UNAVAILABLE_PRICE_REASONS.OFFICIAL_PRICE_INVALID
          : MODEL_UNAVAILABLE_PRICE_REASONS.OFFICIAL_PRICE_MISSING
      byId.set(model.id, adaptAimlApiModel(model, prices, reason))
    }
  }
  return Array.from(byId.values())
}

/**
 * Provider-wide catalogue. The route is public, so this works for an account
 * whose regular API key is absent and for the anonymous model list alike.
 */
export const aimlApiProviderModelCatalog: ProviderModelCatalogCapability = {
  source: {
    id: AIMLAPI_PROVIDER_CATALOG_SOURCE_ID,
    provider: SITE_TYPES.AIMLAPI,
    displayName: AIMLAPI_DISPLAY_NAME,
    cacheTtlMs: AIMLAPI_PROVIDER_CATALOG_CACHE_TTL_MS,
  },
  async fetchPricing({
    abortSignal,
  }): Promise<ProviderModelCatalogPricingResponse> {
    const request = {
      baseUrl: "https://aimlapi.com",
      auth: { authType: AuthTypeEnum.None },
      ...(abortSignal ? { abortSignal } : {}),
    } satisfies ApiServiceRequest
    const data = await fetchCatalogRows(request)
    return {
      success: true,
      groupAccess: { kind: "not-applicable" },
      groupRatios: {},
      data,
      model_list_source: {
        kind: MODEL_LIST_SOURCE_KINDS.PROVIDER_CATALOG,
        provider: SITE_TYPES.AIMLAPI,
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
    }
  },
}

/**
 * Account-scoped pricing view.
 *
 * The account's own model access comes from the key's `scopes` and
 * `allowed_models`, not from this public catalogue, so the same provider-wide
 * facts serve the account list without claiming per-key visibility.
 */
export const aimlApiModelPricing: ModelPricingCapability = {
  cacheVersion: AIMLAPI_PRICING_CACHE_VERSION,
  async fetchPricing(request) {
    const data = await fetchCatalogRows(request)
    return {
      success: true,
      groupAccess: { kind: "not-applicable" },
      groupRatios: {},
      data,
    }
  },
}
