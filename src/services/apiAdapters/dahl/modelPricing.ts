import { SITE_TYPES } from "~/constants/siteType"
import type { ModelPricingCapability } from "~/services/apiAdapters/contracts/modelPricing"
import { fetchModels } from "~/services/apiService/dahl"
import { DAHL_USD_PER_TOKEN } from "~/services/apiService/dahl/constants"

export const dahlModelPricing: ModelPricingCapability = {
  runtimeKeyFallback: "account-pricing",
  async fetchPricing(request) {
    const models = await fetchModels(request)
    const price = DAHL_USD_PER_TOKEN * 1000000
    return {
      success: true,
      groupAccess: { kind: "not-applicable" },
      groupRatios: {},
      data: models.map((id) => ({
        model_name: id,
        quota_type: 0,
        model_ratio: 0,
        model_price: 0,
        completion_ratio: 1,
        enable_groups: [],
        supported_endpoint_types: ["openai"],
        token_price_usd_per_million: {
          input: price,
          output: price,
          cache_read: price,
        },
        price_metadata: {
          source: "official-rate-estimate",
          precision: "estimated",
          source_date: "2026-10-11",
          source_url: "https://inference.dahl.global/pricing/",
        },
      })),
      model_list_source: {
        kind: "provider-catalog",
        provider: SITE_TYPES.DAHL,
        supportsPricing: true,
        actionPolicy: {
          supportsGroupFiltering: false,
          supportsAccountSummary: true,
          supportsTokenCompatibility: false,
          supportsCredentialVerification: true,
          supportsBatchCredentialVerification: true,
          supportsCliVerification: true,
        },
      },
    }
  },
}
