import { SITE_TYPES } from "~/constants/siteType"
import type { ModelPricingCapability } from "~/services/apiAdapters/contracts/modelPricing"
import { fetchModels } from "~/services/apiService/dahl"
import { DAHL_TOKEN_ASSET } from "~/services/apiService/dahl/constants"
import { MODEL_LIST_PRICING_KINDS } from "~/services/modelList/pricingModel"
import {
  QUOTA_COMPARISON_SCOPES,
  QUOTA_ROUNDING_MODES,
} from "~/services/modelPricing/quotaPricing"

export const dahlModelPricing: ModelPricingCapability = {
  runtimeKeyFallback: "account-pricing",
  async fetchPricing(request) {
    const models = await fetchModels(request)
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
        quotaPricing: {
          unit: DAHL_TOKEN_ASSET,
          // Successful requests deduct upstream input plus output Token usage.
          // Package purchase prices do not establish a USD billing rate.
          rates: {
            input: { amount: 1, per: 1 },
            output: { amount: 1, per: 1 },
          },
          adjustments: [],
          comparisonScope: QUOTA_COMPARISON_SCOPES.Unit,
          rounding: QUOTA_ROUNDING_MODES.None,
          sourceUrl: "https://inference.dahl.global/docs/tokens/",
        },
        price_metadata: {
          source: "provider-catalog",
          precision: "exact",
          source_url: "https://inference.dahl.global/docs/tokens/",
        },
      })),
      model_list_source: {
        kind: "provider-catalog",
        provider: SITE_TYPES.DAHL,
        supportsPricing: true,
        pricingKind: MODEL_LIST_PRICING_KINDS.Quota,
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
