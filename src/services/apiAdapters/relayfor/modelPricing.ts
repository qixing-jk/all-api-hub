import { SITE_TYPES } from "~/constants/siteType"
import type { ModelPricingCapability } from "~/services/apiAdapters/contracts/modelPricing"
import { MODEL_PRICING_RUNTIME_KEY_FALLBACKS } from "~/services/apiAdapters/contracts/modelPricing"
import { relayForModelPresentation } from "~/services/apiAdapters/relayfor/modelPresentation"
import {
  fetchRelayForModels,
  updateRelayForModelGroup,
} from "~/services/apiService/relayfor"
import type { RelayForModelListResponse } from "~/services/apiService/relayfor/type"
import type { ApiServiceRequest } from "~/services/apiTransport/type"
import type { ModelCatalogSnapshot } from "~/services/modelCatalog/snapshot"
import {
  MODEL_LIST_SOURCE_KINDS,
  MODEL_PRICE_PRECISION_KINDS,
  MODEL_PRICE_SOURCE_KINDS,
  MODEL_UNAVAILABLE_PRICE_REASONS,
  type ModelPricing,
} from "~/services/modelList/pricingModel"
import {
  PRICE_RATE_UNITS,
  PRICING_CONDITION_KINDS,
  PRICING_GROUP_MULTIPLIERS,
  PRICING_RANGE_AXES,
  PRICING_SOURCE_KINDS,
  PRICING_USAGE_MODES,
} from "~/services/modelPricing/pricingConstants"
import type { PricingPlan } from "~/services/modelPricing/pricingPlan"

const ENDPOINT_LABELS: Record<string, string> = {
  "/v1/chat/completions": "Chat Completions",
  "/v1/responses": "Responses",
  "/v1/responses/compact": "Responses Compact",
  "/v1/messages": "Messages",
  "/v1beta/models/{model}:generateContent": "Gemini",
  "/v1beta/models/{model}:streamGenerateContent": "Gemini Stream",
  "/v1/realtime": "Realtime",
}

const formatEndpointLabel = (endpoint: string): string =>
  ENDPOINT_LABELS[endpoint] || endpoint

const readFiniteNumber = (value: unknown): number | undefined =>
  typeof value === "number" && Number.isFinite(value) ? value : undefined

const tokenRates = (
  input: number,
  output: number,
  cacheRead?: number,
  cacheWrite?: number,
): PricingPlan["rates"] => {
  const rate = (amount: number) => ({
    amount,
    currency: "USD" as const,
    unit: PRICE_RATE_UNITS.TOKEN,
    per: 1_000_000,
  })
  return {
    input: rate(input),
    output: rate(output),
    ...(cacheRead !== undefined ? { cacheRead: rate(cacheRead) } : {}),
    ...(cacheWrite !== undefined ? { cacheWrite: rate(cacheWrite) } : {}),
  }
}

/**
 * Normalizes RelayFor models response into ModelCatalogSnapshot.
 */
function buildRelayForPricingResponse(
  response: RelayForModelListResponse,
  baseUrl = "https://relayfor.xyz",
): ModelCatalogSnapshot {
  const items = response?.items ?? []
  const data: ModelPricing[] = items
    .filter(
      (item) => typeof item?.model === "string" && item.model.trim().length > 0,
    )
    .map((item) => {
      const modelName = item.model.trim()
      const displayName = item.display_name?.trim() || modelName
      const supportedEndpoints = Array.isArray(item.supported_endpoints)
        ? item.supported_endpoints
            .filter(
              (ep): ep is string =>
                typeof ep === "string" && ep.trim().length > 0,
            )
            .map(formatEndpointLabel)
        : []

      const isPerCall = item.billing_mode === "request"
      const isFree = item.free_model === true

      if (isPerCall) {
        const perCallPrice = isFree
          ? 0
          : readFiniteNumber(item.effective_request_price) ??
            readFiniteNumber(item.base_request_price) ??
            0
        return {
          model_name: modelName,
          ...relayForModelPresentation(item, baseUrl),
          display_name: displayName,
          quota_type: 1,
          model_ratio: 0,
          model_price: perCallPrice,
          completion_ratio: 1,
          price_metadata: {
            source: MODEL_PRICE_SOURCE_KINDS.PROVIDER_CATALOG,
            precision: MODEL_PRICE_PRECISION_KINDS.EXACT,
          },
          enable_groups: [],
          supported_endpoint_types: supportedEndpoints,
        }
      }

      // Token billing (USD per 1M tokens)
      const effective = item.effective_prices || {}
      const base = item.base_prices || {}

      const input = isFree
        ? 0
        : readFiniteNumber(effective.input) ?? readFiniteNumber(base.input)
      const output = isFree
        ? 0
        : readFiniteNumber(effective.output) ?? readFiniteNumber(base.output)
      const cacheRead = isFree
        ? 0
        : readFiniteNumber(effective.cache_read) ??
          readFiniteNumber(base.cache_read)
      const cacheWrite = isFree
        ? 0
        : readFiniteNumber(effective.cache_write) ??
          readFiniteNumber(base.cache_write)

      const hasDirectPrice = input !== undefined && output !== undefined

      if (hasDirectPrice) {
        const multiplier =
          readFiniteNumber(item.effective_multiplier) ??
          readFiniteNumber(item.price_multiplier) ??
          1

        const longThreshold = readFiniteNumber(item.long_context_threshold)
        const longEffective = item.long_context_effective_prices || {}
        const longBase = item.long_context_base_prices || {}

        const longInput =
          readFiniteNumber(longEffective.input) ??
          readFiniteNumber(longBase.input)
        const longOutput =
          readFiniteNumber(longEffective.output) ??
          readFiniteNumber(longBase.output)
        const longCacheRead =
          readFiniteNumber(longEffective.cache_read) ??
          readFiniteNumber(longBase.cache_read)
        const longCacheWrite =
          readFiniteNumber(longEffective.cache_write) ??
          readFiniteNumber(longBase.cache_write)

        const hasLongContext =
          longThreshold !== undefined &&
          longThreshold > 0 &&
          longInput !== undefined &&
          longOutput !== undefined

        let pricingPlan: PricingPlan | undefined

        if (hasLongContext) {
          const thresholdStr = longThreshold.toLocaleString("en-US")
          const pricingDescription = `长上下文 > ${thresholdStr} 输入 Token：整次请求 输入 $${longInput} · 输出 $${longOutput}${longCacheRead !== undefined ? ` · 缓存读 $${longCacheRead}` : ""}${longCacheWrite !== undefined ? ` · 缓存写 $${longCacheWrite}` : ""} / 1M`
          pricingPlan = {
            rates: tokenRates(input, output, cacheRead, cacheWrite),
            usageMode: PRICING_USAGE_MODES.TOKENS,
            groupMultiplier: PRICING_GROUP_MULTIPLIERS.INCLUDED,
            issues: [],
            source: {
              kind: PRICING_SOURCE_KINDS.ACCOUNT,
              url: new URL("/console/#models", baseUrl).href,
              pricingDescription: {
                zh: pricingDescription,
                en: `Long context > ${thresholdStr} input tokens: entire request input $${longInput} · output $${longOutput}${longCacheRead !== undefined ? ` · cache read $${longCacheRead}` : ""}${longCacheWrite !== undefined ? ` · cache write $${longCacheWrite}` : ""} / 1M`,
              },
            },
            rules: [
              {
                id: "long-context",
                conditions: [
                  {
                    kind: PRICING_CONDITION_KINDS.RANGE,
                    axis: PRICING_RANGE_AXES.INPUT_TOKENS,
                    min: longThreshold + 1,
                  },
                ],
                rates: tokenRates(
                  longInput,
                  longOutput,
                  longCacheRead,
                  longCacheWrite,
                ),
              },
            ],
          }
        }

        return {
          model_name: modelName,
          ...relayForModelPresentation(item, baseUrl),
          display_name: displayName,
          quota_type: 0,
          model_ratio: multiplier,
          model_price: 0,
          completion_ratio: input > 0 && output > 0 ? output / input : 1,
          token_price_usd_per_million: {
            input,
            output,
            ...(cacheRead !== undefined ? { cache_read: cacheRead } : {}),
            ...(cacheWrite !== undefined ? { cache_write: cacheWrite } : {}),
          },
          ...(pricingPlan ? { pricingPlan } : {}),
          price_metadata: {
            source: MODEL_PRICE_SOURCE_KINDS.PROVIDER_CATALOG,
            precision: MODEL_PRICE_PRECISION_KINDS.EXACT,
          },
          enable_groups: [],
          supported_endpoint_types: supportedEndpoints,
        }
      }

      // Fallback for legacy ratio-style pricing object (e.g. mock test data)
      const promptRatio = item.pricing?.prompt_ratio
      const completionRatio = item.pricing?.completion_ratio
      const hasRatioPricing =
        typeof promptRatio === "number" && Number.isFinite(promptRatio)

      return {
        model_name: modelName,
        ...relayForModelPresentation(item, baseUrl),
        display_name: displayName,
        quota_type: 0,
        model_ratio: hasRatioPricing ? promptRatio : 1,
        model_price: 0,
        completion_ratio:
          typeof completionRatio === "number" &&
          Number.isFinite(completionRatio)
            ? completionRatio
            : 1,
        price_metadata: hasRatioPricing
          ? {
              source: MODEL_PRICE_SOURCE_KINDS.PROVIDER_CATALOG,
              precision: MODEL_PRICE_PRECISION_KINDS.EXACT,
            }
          : {
              source: MODEL_PRICE_SOURCE_KINDS.NONE,
              precision: MODEL_PRICE_PRECISION_KINDS.UNAVAILABLE,
              unavailable_reason:
                MODEL_UNAVAILABLE_PRICE_REASONS.PRICING_SOURCE_UNAVAILABLE,
            },
        enable_groups: [],
        supported_endpoint_types: supportedEndpoints,
      }
    })

  return {
    success: true,
    data,
    groupRatios: {},
    groupAccess: { kind: "not-applicable" },
    model_list_source: {
      kind: MODEL_LIST_SOURCE_KINDS.USER_SCOPED,
      provider: SITE_TYPES.RELAYFOR,
      supportsPricing: true,
      actionPolicy: {
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

export const relayForModelPricing: ModelPricingCapability = {
  async updateGroup(request, model, group) {
    await updateRelayForModelGroup(request, model, group)
  },
  runtimeKeyFallback: MODEL_PRICING_RUNTIME_KEY_FALLBACKS.ACCOUNT_PRICING,
  fetchPricing: async (
    request: ApiServiceRequest,
  ): Promise<ModelCatalogSnapshot> => {
    const response = await fetchRelayForModels(request)
    return buildRelayForPricingResponse(response, request.baseUrl)
  },
}
