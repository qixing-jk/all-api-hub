import type { AccountSiteType } from "~/constants/siteType"
import type { ProviderModelCatalogCapability } from "~/services/apiAdapters/contracts/providerModelCatalog"
import {
  fetchKimiAccountModelCatalog,
  fetchKimiPricingDoc,
} from "~/services/apiService/kimiOpenPlatform"
import { ApiError } from "~/services/apiTransport/errors"
import type { ApiServiceRequest } from "~/services/apiTransport/type"
import {
  getKimiOpenPlatformDeployment,
  type KimiOpenPlatformDeployment,
} from "~/services/kimiOpenPlatform/deployments"
import type { KimiPricingDocEntry } from "~/services/kimiOpenPlatform/pricingDoc"
import {
  MODEL_CATALOG_SCOPES,
  MODEL_LIST_SOURCE_KINDS,
  MODEL_PRICE_PRECISION_KINDS,
  MODEL_PRICE_SOURCE_KINDS,
  MODEL_UNAVAILABLE_PRICE_REASONS,
  type ModelCatalogScope,
} from "~/services/modelList/pricingModel"
import type {
  ProviderModelCatalogModel,
  ProviderModelCatalogPricingResponse,
} from "~/services/modelList/providerCatalogAdmission"
import {
  PRICE_RATE_UNITS,
  PRICING_GROUP_MULTIPLIERS,
  PRICING_SOURCE_KINDS,
  TOKENS_PER_MILLION,
} from "~/services/modelPricing/pricingConstants"
import type {
  PriceRate,
  PricingPlan,
} from "~/services/modelPricing/pricingPlan"
import {
  isAbortError,
  toSanitizedErrorSummary,
} from "~/services/verification/aiApiVerification/utils"
import { AuthTypeEnum } from "~/types"

/** The published table moves only when the platform reprices. */
const KIMI_PRICING_DOC_CACHE_TTL_MS = 6 * 60 * 60 * 1000
/** A project's model list follows the account's plan, so it stays short-lived. */
const KIMI_PERSONALIZED_CACHE_TTL_MS = 5 * 60 * 1000
/** USD is the only currency the canonical price field can represent. */
const KIMI_USD_SYMBOL = "$"

/** Catalog errors are retained for fallback disclosure, so scrub credentials. */
async function withSafeCatalogErrors<T>(
  load: () => Promise<T>,
  abortSignal?: AbortSignal,
  credential = "",
): Promise<T> {
  try {
    return await load()
  } catch (error) {
    if (isAbortError(error, abortSignal)) throw error
    const message = toSanitizedErrorSummary(error, [credential])
    if (error instanceof ApiError)
      throw new ApiError(
        message,
        error.statusCode,
        error.endpoint,
        error.code,
        error.upstreamCode,
      )
    if (error instanceof TypeError) throw new TypeError(message)
    throw new Error(message)
  }
}

/** One catalogue row: a model id, and its published prices when readable. */
type KimiCatalogRow = {
  modelId: string
  entry?: KimiPricingDocEntry
}

/** Whether a published row can be quoted in the canonical USD price field. */
const isUsdPricedEntry = (entry: KimiPricingDocEntry | undefined): boolean =>
  entry !== undefined && entry.currencySymbol === KIMI_USD_SYMBOL

/**
 * Converts one catalogue row into the provider-catalogue shape.
 *
 * Preserve published currency and both cache TTLs in the structured plan.
 * Only USD rows also populate the legacy USD field; CNY never masquerades as
 * an exact USD price. The quote engine owns any requested currency conversion.
 */
function createKimiCatalogRow(
  row: KimiCatalogRow,
  pricingUrl: string,
): ProviderModelCatalogModel {
  const entry = row.entry
  const priced = isUsdPricedEntry(entry) ? entry : undefined

  return {
    model_name: row.modelId,
    quota_type: 0,
    model_ratio: 0,
    model_price: 0,
    ...(entry ? { pricingPlan: createPricingPlan(entry, pricingUrl) } : {}),
    ...(priced === undefined
      ? {}
      : {
          token_price_usd_per_million: {
            input: priced.inputPrice,
            output: priced.outputPrice,
            ...(priced.cacheReadPrice === undefined
              ? {}
              : { cache_read: priced.cacheReadPrice }),
            ...(priced.cacheWritePrice === undefined
              ? {}
              : { cache_write: priced.cacheWritePrice }),
          },
        }),
    price_metadata:
      priced === undefined
        ? {
            source: MODEL_PRICE_SOURCE_KINDS.PROVIDER_CATALOG,
            precision: MODEL_PRICE_PRECISION_KINDS.UNAVAILABLE,
            unavailable_reason:
              entry === undefined
                ? MODEL_UNAVAILABLE_PRICE_REASONS.OFFICIAL_PRICE_MISSING
                : MODEL_UNAVAILABLE_PRICE_REASONS.PRICING_SOURCE_UNAVAILABLE,
          }
        : {
            source: MODEL_PRICE_SOURCE_KINDS.PROVIDER_CATALOG,
            precision: MODEL_PRICE_PRECISION_KINDS.EXACT,
          },
    completion_ratio: 1,
    enable_groups: [],
    supported_endpoint_types: [],
  }
}

/** https://platform.kimi.ai/docs/pricing: all rates are per million tokens. */
function createPricingPlan(
  entry: KimiPricingDocEntry,
  url: string,
): PricingPlan {
  const rate = (amount: number): PriceRate => ({
    amount,
    currency: entry.currencySymbol === "$" ? "USD" : "CNY",
    unit: PRICE_RATE_UNITS.TOKEN,
    per: TOKENS_PER_MILLION,
  })
  return {
    rates: {
      input: rate(entry.inputPrice),
      output: rate(entry.outputPrice),
      ...(entry.cacheReadPrice === undefined
        ? {}
        : { cacheRead: rate(entry.cacheReadPrice) }),
      ...(entry.cacheWritePrice === undefined
        ? {}
        : { cacheWrite: rate(entry.cacheWritePrice) }),
      ...(entry.cacheWrite1hPrice === undefined
        ? {}
        : { cacheWrite1h: rate(entry.cacheWrite1hPrice) }),
    },
    rules: [],
    ...(entry.contextLength === undefined
      ? {}
      : { limits: { totalTokens: entry.contextLength } }),
    groupMultiplier: PRICING_GROUP_MULTIPLIERS.INCLUDED,
    source: { kind: PRICING_SOURCE_KINDS.CATALOG, url },
    issues: [],
  }
}

/** Builds the response both catalogue paths return. */
function createKimiCatalogResponse(
  rows: readonly KimiCatalogRow[],
  deployment: KimiOpenPlatformDeployment,
  catalogScope: ModelCatalogScope,
): ProviderModelCatalogPricingResponse {
  const pricingUrl = `${deployment.consoleOrigin}/docs/pricing`
  return {
    data: rows.map((row) => createKimiCatalogRow(row, pricingUrl)),
    groupRatios: {},
    success: true,
    groupAccess: { kind: "not-applicable" },
    model_list_source: {
      kind: MODEL_LIST_SOURCE_KINDS.PROVIDER_CATALOG,
      provider: deployment.siteType,
      catalogScope,
      supportsRuntimeModelList: false,
      supportsPricing: rows.some((row) => row.entry !== undefined),
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

/** One priced row per published table entry, in the order the document lists. */
const rowsFromEntries = (
  entries: readonly KimiPricingDocEntry[],
): KimiCatalogRow[] =>
  entries.map((entry) => ({ modelId: entry.modelId, entry }))

/** Joins a model-id list to the published prices the table carries for them. */
function toRows(
  modelIds: readonly string[],
  entries: readonly KimiPricingDocEntry[],
): KimiCatalogRow[] {
  const byId = new Map(entries.map((entry) => [entry.modelId, entry]))
  return modelIds.map((modelId) => {
    const entry = byId.get(modelId)
    return entry === undefined ? { modelId } : { modelId, entry }
  })
}

/**
 * Kimi publishes one price table per deployment, and answers a project's model
 * list from the console session.
 *
 * The account's own list is the honest catalogue — it holds the models this
 * project may actually call — and it is asked for first. When it fails, the
 * framework falls back to the platform's published table, which covers every
 * model the platform sells rather than the ones this account can reach.
 */
export function createKimiOpenPlatformProviderModelCatalog(
  siteType: AccountSiteType,
): ProviderModelCatalogCapability {
  const deployment = getKimiOpenPlatformDeployment(siteType)
  if (!deployment) {
    throw new Error(`unknown_kimi_site_type:${siteType}`)
  }

  return {
    source: {
      id: `kimi-open-platform-pricing-doc-${deployment.siteType}`,
      provider: siteType,
      displayName: deployment.displayName,
      cacheTtlMs: KIMI_PRICING_DOC_CACHE_TTL_MS,
    },
    async fetchPricing(request) {
      return withSafeCatalogErrors(async () => {
        const entries = await fetchKimiPricingDoc({
          baseUrl: deployment.consoleOrigin,
          abortSignal: request.abortSignal,
        })
        if (entries.length === 0) throw new Error("invalid_kimi_pricing_doc")
        return createKimiCatalogResponse(
          rowsFromEntries(entries),
          deployment,
          MODEL_CATALOG_SCOPES.PROVIDER,
        )
      }, request.abortSignal)
    },
    personalized: {
      cacheTtlMs: KIMI_PERSONALIZED_CACHE_TTL_MS,
      async fetchPricing(request) {
        return withSafeCatalogErrors(
          async () => {
            const accountRequest: ApiServiceRequest = {
              baseUrl: deployment.consoleOrigin,
              accountId: request.accountId,
              abortSignal: request.abortSignal,
              auth: {
                authType: AuthTypeEnum.AccessToken,
                accessToken: request.credential,
              },
            }
            const models = await fetchKimiAccountModelCatalog(accountRequest)
            if (models.length === 0) throw new Error("kimi_model_list_empty")
            // A price-table hiccup must not cost the account its model list.
            const entries = await fetchKimiPricingDoc(accountRequest).catch(
              (error: unknown) => {
                if (isAbortError(error, request.abortSignal)) throw error
                return []
              },
            )
            return createKimiCatalogResponse(
              toRows(
                models.map((model) => model.id),
                entries,
              ),
              deployment,
              MODEL_CATALOG_SCOPES.PERSONALIZED,
            )
          },
          request.abortSignal,
          request.credential,
        )
      },
    },
  }
}
