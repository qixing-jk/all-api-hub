import { SITE_TYPES } from "~/constants/siteType"
import { OPENROUTER_DISPLAY_NAME } from "~/services/accountSiteDefinitions/identifiers"
import type { ProviderModelCatalogCapability } from "~/services/apiAdapters/contracts/providerModelCatalog"
import { fetchOpenRouterPublicModelCatalog } from "~/services/apiService/openrouter/publicModelCatalog"
import type { OpenRouterPublicModel } from "~/services/apiService/openrouter/publicModelCatalogSchemas"
import {
  MODEL_LIST_SOURCE_KINDS,
  MODEL_PRICE_PRECISION_KINDS,
  MODEL_PRICE_SOURCE_KINDS,
  MODEL_UNAVAILABLE_PRICE_REASONS,
} from "~/services/modelList/pricingModel"
import type { ProviderModelCatalogModel } from "~/services/modelList/providerCatalogAdmission"
import {
  MODEL_DISPLAY_FACT_LABELS,
  MODEL_DISPLAY_FACT_TYPES,
  MODEL_DISPLAY_SECTION_LABELS,
  type ModelDisplayFact,
} from "~/services/models/modelDisplayFacts"

const OPENROUTER_PUBLIC_MODEL_CATALOG_CACHE_TTL_MS = 5 * 60 * 1000
const OPENROUTER_PROVIDER_MODEL_CATALOG_SOURCE_ID = "openrouter-public"

/** Reads a plain record while excluding arrays and primitive values. */
function readRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined
}

/** Trims provider text and omits blank or non-string values. */
function normalizeNonBlankString(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined
  const normalized = value.trim()
  return normalized || undefined
}

/** Keeps nonnegative integer token quantities and omits malformed values. */
function normalizeTokenQuantity(value: unknown): number | undefined {
  return typeof value === "number" && Number.isInteger(value) && value >= 0
    ? value
    : undefined
}

/** Normalizes a provider list to unique, nonblank strings. */
function normalizeStringList(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined

  const normalized = Array.from(
    new Set(value.map(normalizeNonBlankString).filter(Boolean)),
  ) as string[]
  return normalized.length > 0 ? normalized : undefined
}

/** Converts a direct USD-per-token string to USD per million tokens. */
function normalizeUsdPerToken(value: unknown): number | undefined {
  if (typeof value !== "string" || !value.trim()) return undefined

  const normalized = Number(value)
  if (!Number.isFinite(normalized) || normalized < 0) return undefined

  const perMillion = normalized * 1_000_000
  return Number.isFinite(perMillion) ? perMillion : undefined
}

type PrimaryPriceStatus = "missing" | "invalid" | "valid"

/** Distinguishes absent primary prices from malformed and usable values. */
function classifyPrimaryPrice(value: unknown): PrimaryPriceStatus {
  if (value === undefined || value === null) return "missing"
  return normalizeUsdPerToken(value) === undefined ? "invalid" : "valid"
}

/**
 * OpenRouter public catalog contract:
 * https://openrouter.ai/docs/api/api-reference/models/list-all-models-and-their-properties
 * Pricing is USD per token; optional architecture/top-provider facts are
 * presentation-only, and public rows never enable account-key actions.
 */
function createPresentation(model: OpenRouterPublicModel) {
  const contextLimit = normalizeTokenQuantity(model.context_length)
  const architecture = readRecord(model.architecture)
  const outputModalities = normalizeStringList(architecture?.output_modalities)
  const topProvider = readRecord(model.top_provider)
  const maximumOutputTokens = normalizeTokenQuantity(
    topProvider?.max_completion_tokens,
  )
  const summaryFacts: ModelDisplayFact[] = []

  if (contextLimit !== undefined) {
    summaryFacts.push({
      type: MODEL_DISPLAY_FACT_TYPES.TokenQuantity,
      label: MODEL_DISPLAY_FACT_LABELS.ContextLimit,
      value: contextLimit,
    })
  }
  if (outputModalities) {
    summaryFacts.push({
      type: MODEL_DISPLAY_FACT_TYPES.StringList,
      label: MODEL_DISPLAY_FACT_LABELS.OutputModalities,
      values: outputModalities,
    })
  }

  const detailFacts: ModelDisplayFact[] = []
  if (maximumOutputTokens !== undefined) {
    detailFacts.push({
      type: MODEL_DISPLAY_FACT_TYPES.TokenQuantity,
      label: MODEL_DISPLAY_FACT_LABELS.MaximumOutputTokens,
      value: maximumOutputTokens,
    })
  }

  return {
    ...(summaryFacts.length > 0 ? { summaryFacts } : {}),
    ...(detailFacts.length > 0
      ? {
          sections: [
            {
              id: "specifications",
              label: MODEL_DISPLAY_SECTION_LABELS.Specifications,
              facts: detailFacts,
            },
          ],
        }
      : {}),
  }
}

/** Maps one OpenRouter DTO into the product-owned canonical model shape. */
function adaptOpenRouterPublicModel(
  model: OpenRouterPublicModel,
): ProviderModelCatalogModel {
  const pricingValue = model.pricing
  const pricing = readRecord(pricingValue)
  const rawPromptPrice = pricing?.prompt
  const rawCompletionPrice = pricing?.completion
  const inputPrice = normalizeUsdPerToken(rawPromptPrice)
  const outputPrice = normalizeUsdPerToken(rawCompletionPrice)
  const cacheReadPrice = normalizeUsdPerToken(pricing?.input_cache_read)
  const cacheWritePrice = normalizeUsdPerToken(pricing?.input_cache_write)
  const hasPrimaryPrice = inputPrice !== undefined && outputPrice !== undefined
  const primaryPriceStatuses = [
    classifyPrimaryPrice(rawPromptPrice),
    classifyPrimaryPrice(rawCompletionPrice),
  ]
  const hasInvalidPrimaryPrice =
    (pricingValue !== undefined && pricing === undefined) ||
    primaryPriceStatuses.includes("invalid")
  const displayName = normalizeNonBlankString(model.name)
  const description = normalizeNonBlankString(model.description)
  const presentation = createPresentation(model)

  return {
    model_name: model.id,
    ...(displayName ? { display_name: displayName } : {}),
    ...(description ? { model_description: description } : {}),
    ...(Object.keys(presentation).length > 0 ? { presentation } : {}),
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
