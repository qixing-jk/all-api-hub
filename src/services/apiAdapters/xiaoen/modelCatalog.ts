import { fetchOpenAICompatibleModelIds } from "~/services/aiApi/openaiCompatible"
import type { ModelCatalogCapability } from "~/services/apiAdapters/contracts/modelCatalog"
import type { ModelPricingCapability } from "~/services/apiAdapters/contracts/modelPricing"
import { fetchIdentity } from "~/services/apiService/xiaoen"
import { XIAOEN_ENDPOINTS } from "~/services/apiService/xiaoen/constants"
import { fetchPublicEnvelope } from "~/services/apiService/xiaoen/public"
import {
  invalidXiaoenResponse,
  withXiaoenSession,
} from "~/services/apiService/xiaoen/transport"
import type { ModelCatalogSnapshot } from "~/services/modelCatalog/snapshot"
import type { ModelDescriptor } from "~/services/models/modelDescriptor"
import { normalizeModelDescriptors } from "~/services/models/modelDescriptor"
import { isRecord } from "~/utils/core/object"

/** Public native credit prices are descriptive, not USD estimates or proof of account unlocks. */
const publicPricing: ModelPricingCapability = {
  async fetchPricing(request) {
    const body = await fetchPublicEnvelope(request, XIAOEN_ENDPOINTS.Models)
    if (!isRecord(body.data) || !Array.isArray(body.data.models))
      throw invalidXiaoenResponse(XIAOEN_ENDPOINTS.Models)
    return {
      success: true,
      groupAccess: { kind: "not-applicable" },
      groupRatios: {},
      data: body.data.models.map((value) => {
        if (
          !isRecord(value) ||
          typeof value.name !== "string" ||
          !value.name.trim() ||
          typeof value.priceLabel !== "string"
        )
          throw invalidXiaoenResponse(XIAOEN_ENDPOINTS.Models)
        return {
          model_name: value.name,
          model_description: [
            typeof value.description === "string" ? value.description : "",
            value.priceLabel,
          ]
            .filter(Boolean)
            .join(" · "),
          quota_type: value.priceType === "call" ? 1 : 0,
          model_ratio: 0,
          model_price: 0,
          completion_ratio: 1,
          enable_groups: [],
          supported_endpoint_types: ["openai"],
          price_metadata: {
            source: "provider-catalog" as const,
            precision: "unavailable" as const,
            unavailable_reason: "official-price-missing" as const,
            source_url: `${request.baseUrl}/dashboard/models`,
          },
        }
      }),
    }
  },
}

/** Public prices enrich runtime-visible IDs; absent prices never remove a usable model. */
function retainRuntimeModels(
  snapshot: ModelCatalogSnapshot,
  models: readonly ModelDescriptor[],
): ModelCatalogSnapshot {
  const prices = new Map(
    snapshot.data.map((model) => [model.model_name, model]),
  )
  return {
    ...snapshot,
    data: models.map(
      (model) =>
        prices.get(model.id) ?? {
          model_name: model.id,
          quota_type: 0,
          model_ratio: 0,
          model_price: 0,
          completion_ratio: 1,
          enable_groups: [],
          supported_endpoint_types: ["openai"],
          price_metadata: {
            source: "provider-catalog",
            precision: "unavailable",
            unavailable_reason: "official-price-missing",
          },
        },
    ),
  }
}

/** Account Model List loads pricing directly, so visibility must be bounded here too. */
export const xiaoenModelPricing: ModelPricingCapability = {
  fetchPricing: (request) =>
    withXiaoenSession(request, async (scoped) => {
      const { data } = await fetchIdentity(scoped)
      if (
        typeof data.apiKey !== "string" ||
        !/^sk-[A-Za-z0-9_-]+$/.test(data.apiKey)
      )
        throw invalidXiaoenResponse(XIAOEN_ENDPOINTS.Identity)
      const models = await xiaoenModelCatalog.fetchModels(
        { ...scoped, auth: { ...scoped.auth, apiKey: data.apiKey } },
        { accountRequest: scoped },
      )
      return retainRuntimeModels(
        await publicPricing.fetchPricing(scoped),
        Array.isArray(models) ? models : models.models,
      )
    }),
}

export const xiaoenModelCatalog: ModelCatalogCapability = {
  async fetchModels(request, context) {
    // The native user determines the inference route; saved console URLs never become inference bases.
    if (!context) throw invalidXiaoenResponse(XIAOEN_ENDPOINTS.Identity)
    const { data } = await fetchIdentity(context.accountRequest)
    if (
      typeof data.apiBaseUrl !== "string" ||
      data.apiKey !== request.auth.apiKey
    )
      throw invalidXiaoenResponse(XIAOEN_ENDPOINTS.Identity)
    const url = new URL(data.apiBaseUrl)
    if (url.protocol !== "https:" || url.username || url.password)
      throw invalidXiaoenResponse(XIAOEN_ENDPOINTS.Identity)
    return normalizeModelDescriptors(
      (
        await fetchOpenAICompatibleModelIds({
          baseUrl: data.apiBaseUrl,
          apiKey: request.auth.apiKey,
          abortSignal: request.abortSignal,
        })
      ).map((id) => ({ id })),
    )
  },
  async enrichPricing({ accountRequest, models }) {
    return retainRuntimeModels(
      await publicPricing.fetchPricing(accountRequest),
      models,
    )
  },
}
