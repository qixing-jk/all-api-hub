import { SITE_TYPES } from "~/constants/siteType"
import { NOVITA_DISPLAY_NAME } from "~/services/accountSiteDefinitions/identifiers"
import type { ModelPricingCapability } from "~/services/apiAdapters/contracts/modelPricing"
import type { ProviderModelCatalogCapability } from "~/services/apiAdapters/contracts/providerModelCatalog"
import type { NovitaPublicModel } from "~/services/apiService/novita/publicModelCatalog"
import { fetchNovitaPublicModelCatalog } from "~/services/apiService/novita/publicModelCatalog"
import { createAccountBoundCatalogActionPolicy } from "~/services/modelList/catalogActionPolicy"
import {
  MODEL_CATALOG_SCOPES,
  MODEL_LIST_SOURCE_KINDS,
  MODEL_PRICE_PRECISION_KINDS,
  MODEL_PRICE_SOURCE_KINDS,
  MODEL_UNAVAILABLE_PRICE_REASONS,
  type ModelCatalogScope,
} from "~/services/modelList/pricingModel"
import type { ProviderModelCatalogModel } from "~/services/modelList/providerCatalogAdmission"
import {
  isAbortError,
  toSanitizedErrorSummary,
} from "~/services/verification/aiApiVerification/utils"
import { isRecord } from "~/utils/core/object"

const NOVITA_PUBLIC_MODEL_CATALOG_CACHE_TTL_MS = 5 * 60 * 1000
const NOVITA_PROVIDER_MODEL_CATALOG_SOURCE_ID = "novita-public"

/**
 * Novita publishes token prices on the public model rows: `price_per_m` in
 * 1/10000 USD per million tokens, and `price_per_m_decimal` as an exact USD
 * decimal string. Verified live on 2026-10-25.
 */
function readTokenPrice(
  entry: Record<string, unknown> | undefined,
): number | undefined {
  if (!isRecord(entry)) return undefined
  const decimal = entry.price_per_m_decimal
  if (typeof decimal === "string" && decimal.trim()) {
    const amount = Number(decimal)
    if (Number.isFinite(amount) && amount >= 0) return amount
  }
  const perM = entry.price_per_m
  if (typeof perM === "number" && Number.isFinite(perM) && perM >= 0) {
    return perM / 10_000
  }
  return undefined
}

/** Keeps abort intent while removing upstream detail from catalog errors. */
function toCatalogDisclosureError(
  error: unknown,
  abortSignal?: AbortSignal,
): unknown {
  if (isAbortError(error)) return error
  if (abortSignal?.aborted) {
    return new DOMException("The operation was aborted", "AbortError")
  }
  return new Error(toSanitizedErrorSummary(error, []))
}

/** Maps one public Novita model row into the canonical catalog shape. */
function adaptNovitaModel(model: NovitaPublicModel): ProviderModelCatalogModel {
  const pricing = isRecord(model.pricing) ? model.pricing : undefined
  const inputPrice = readTokenPrice(pricing?.prompt as Record<string, unknown>)
  const outputPrice = readTokenPrice(
    pricing?.completion as Record<string, unknown>,
  )
  const cacheReadPrice = readTokenPrice(
    pricing?.input_cache_read as Record<string, unknown>,
  )
  const hasPrimaryPrice = inputPrice !== undefined && outputPrice !== undefined

  // Provider strings must be trimmed: the catalog admission contract rejects
  // leading/trailing whitespace, and Novita publishes descriptions that end
  // with a trailing space.
  const displayName =
    typeof model.display_name === "string" ? model.display_name.trim() : ""
  const description =
    typeof model.description === "string" ? model.description.trim() : ""

  return {
    model_name: model.id.trim(),
    ...(displayName ? { display_name: displayName } : {}),
    ...(description ? { model_description: description } : {}),
    pricingPlan: undefined,
    quota_type: 0,
    model_ratio: 0,
    model_price: 0,
    ...(hasPrimaryPrice || cacheReadPrice !== undefined
      ? {
          token_price_usd_per_million: {
            ...(hasPrimaryPrice
              ? { input: inputPrice, output: outputPrice }
              : {}),
            ...(cacheReadPrice !== undefined
              ? { cache_read: cacheReadPrice }
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
    completion_ratio: 1,
    enable_groups: [],
    supported_endpoint_types: Array.isArray(model.endpoints)
      ? model.endpoints.filter(
          (endpoint): endpoint is string => typeof endpoint === "string",
        )
      : [],
  }
}

/** Decorates normalized Novita rows with their catalog visibility scope. */
function createNovitaCatalogPricingResponse(
  models: NovitaPublicModel[],
  catalogScope: ModelCatalogScope,
) {
  return {
    data: models.map(adaptNovitaModel),
    groupRatios: {},
    success: true as const,
    groupAccess: { kind: "not-applicable" as const },
    model_list_source: {
      kind: MODEL_LIST_SOURCE_KINDS.PROVIDER_CATALOG,
      provider: SITE_TYPES.NOVITA,
      catalogScope,
      supportsRuntimeModelList: false as const,
      supportsPricing: true as const,
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
}

export const novitaProviderModelCatalog: ProviderModelCatalogCapability = {
  source: {
    id: NOVITA_PROVIDER_MODEL_CATALOG_SOURCE_ID,
    provider: SITE_TYPES.NOVITA,
    displayName: NOVITA_DISPLAY_NAME,
    cacheTtlMs: NOVITA_PUBLIC_MODEL_CATALOG_CACHE_TTL_MS,
  },
  async fetchPricing(request) {
    try {
      const models = await fetchNovitaPublicModelCatalog(request.abortSignal)
      return createNovitaCatalogPricingResponse(
        models,
        MODEL_CATALOG_SCOPES.PROVIDER,
      )
    } catch (error) {
      throw toCatalogDisclosureError(error, request.abortSignal)
    }
  },
}
/** Account actions use this account's keys while prices remain provider-wide. */
export const novitaAccountModelPricing: ModelPricingCapability = {
  async fetchPricing(request) {
    const pricing = await novitaProviderModelCatalog.fetchPricing({
      abortSignal: request.abortSignal,
    })
    return {
      ...pricing,
      model_list_source: {
        ...pricing.model_list_source,
        actionPolicy: createAccountBoundCatalogActionPolicy({
          hasAccountContext: Boolean(request.accountId?.trim()),
        }),
      },
    }
  },
}
