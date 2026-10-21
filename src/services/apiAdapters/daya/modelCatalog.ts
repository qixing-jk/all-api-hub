import { SITE_TYPES } from "~/constants/siteType"
import type { ModelPricingCapability } from "~/services/apiAdapters/contracts/modelPricing"
import { DAYA_ENDPOINTS } from "~/services/apiService/daya/constants"
import { fetchDayaIdentity } from "~/services/apiService/daya/identity"
import {
  fetchDayaData,
  invalidDayaResponse,
  withDayaSession,
} from "~/services/apiService/daya/transport"
import type { ModelCatalogSnapshot } from "~/services/modelCatalog/snapshot"
import {
  MODEL_CATALOG_SCOPES,
  MODEL_LIST_SOURCE_KINDS,
  MODEL_PRICE_PRECISION_KINDS,
  MODEL_PRICE_SOURCE_KINDS,
  MODEL_UNAVAILABLE_PRICE_REASONS,
} from "~/services/modelList/pricingModel"
import {
  createModelDisplayLabel,
  MODEL_DISPLAY_FACT_LABELS,
  type ModelDisplayFact,
} from "~/services/models/modelDisplayFacts"
import { isRecord } from "~/utils/core/object"

const protocols: Readonly<Record<string, string>> = {
  "OpenAI Chat Completions": "/v1/chat/completions",
  "OpenAI Responses": "/v1/responses",
  "Anthropic Messages": "/v1/messages",
  "Google Gemini": "/v1beta/models",
  "OpenAI Images": "/v1/images/generations",
}
const nonnegative = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value) && value >= 0

/**
 * Public catalogue prices already include display_discount_multiplier. Native
 * cards divide by that multiplier only to show the crossed-out original price.
 * These are provider-wide reference prices, not a key/group/plan billing quote;
 * model detail pages may carry additional context or image pricing rules.
 */
export const dayaModelPricing: ModelPricingCapability = {
  runtimeKeyFallback: "account-pricing",
  async fetchPricing(request): Promise<ModelCatalogSnapshot> {
    return withDayaSession(request, async (scoped) => {
      await fetchDayaIdentity(scoped)
      const endpoint = DAYA_ENDPOINTS.CatalogModels
      const data = await fetchDayaData(scoped, endpoint)
      if (!Array.isArray(data)) return invalidDayaResponse(endpoint)
      const url = `${new URL(request.baseUrl).origin}/catalog/models`
      return {
        success: true,
        groupAccess: { kind: "not-applicable" },
        groupRatios: {},
        data: data.map((value) => {
          if (
            !isRecord(value) ||
            typeof value.model !== "string" ||
            !value.model.trim() ||
            typeof value.provider_name !== "string" ||
            !Array.isArray(value.protocols) ||
            !value.protocols.every((p) => typeof p === "string")
          )
            return invalidDayaResponse(endpoint)
          // Image-only catalogue rows expose a zero output placeholder while
          // the detail page owns per-image rules. Do not quote those as tokens.
          const tokenOutput =
            Array.isArray(value.output_modalities) &&
            value.output_modalities.includes("text")
          const priced =
            tokenOutput &&
            nonnegative(value.input_price_per_million) &&
            nonnegative(value.output_price_per_million)
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

          if (nonnegative(value.context_window) && value.context_window > 0)
            facts.push({
              type: "token-quantity",
              label: MODEL_DISPLAY_FACT_LABELS.ContextLimit,
              value: value.context_window,
            })
          if (
            nonnegative(value.max_output_tokens) &&
            value.max_output_tokens > 0
          )
            facts.push({
              type: "token-quantity",
              label: MODEL_DISPLAY_FACT_LABELS.MaximumOutputTokens,
              value: value.max_output_tokens,
            })
          return {
            model_name: value.model.trim(),
            owner_by: value.provider_name,
            vendorEvidence: {
              kind: "publisher" as const,
              name: value.provider_name,
            },
            quota_type: 0,
            model_ratio: 0,
            model_price: 0,
            completion_ratio: 1,
            enable_groups: [],
            supported_endpoint_types: [
              ...new Set(
                value.protocols.flatMap((p) =>
                  protocols[p] ? [protocols[p]!] : [],
                ),
              ),
            ],
            presentation: { summaryFacts: facts },
            ...(priced
              ? {
                  token_price_usd_per_million: {
                    input: value.input_price_per_million as number,
                    output: value.output_price_per_million as number,
                    ...(nonnegative(value.cache_read_price_per_million)
                      ? { cache_read: value.cache_read_price_per_million }
                      : {}),
                  },
                }
              : {}),
            price_metadata: {
              source: MODEL_PRICE_SOURCE_KINDS.PROVIDER_CATALOG,
              ...(!tokenOutput ? { billing_mode_known: false } : {}),
              precision: priced
                ? MODEL_PRICE_PRECISION_KINDS.EXACT
                : MODEL_PRICE_PRECISION_KINDS.UNAVAILABLE,
              ...(!priced
                ? {
                    unavailable_reason: tokenOutput
                      ? MODEL_UNAVAILABLE_PRICE_REASONS.OFFICIAL_PRICE_MISSING
                      : MODEL_UNAVAILABLE_PRICE_REASONS.PRICING_SOURCE_UNAVAILABLE,
                  }
                : {}),
              source_url: url,
            },
          }
        }),
        model_list_source: {
          kind: MODEL_LIST_SOURCE_KINDS.PROVIDER_CATALOG,
          provider: SITE_TYPES.DAYA,
          catalogScope: MODEL_CATALOG_SCOPES.PROVIDER,
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
    })
  },
}
