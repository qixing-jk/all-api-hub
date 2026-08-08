import { describe, expect, it } from "vitest"

import { SITE_TYPES } from "~/constants/siteType"
import {
  MODEL_LIST_SOURCE_KINDS,
  MODEL_PRICE_PRECISION_KINDS,
  MODEL_PRICE_SOURCE_KINDS,
  MODEL_UNAVAILABLE_PRICE_REASONS,
} from "~/services/modelList/pricingModel"
import { isValidProviderModelCatalogPricing } from "~/services/modelList/providerCatalogAdmission"

const completeActionPolicy = {
  supportsRatioDisplay: false,
  supportsGroupFiltering: false,
  supportsAccountSummary: false,
  supportsTokenCompatibility: false,
  supportsCredentialVerification: false,
  supportsBatchCredentialVerification: false,
  supportsCliVerification: false,
}

function createProviderResponse(modelOverrides: Record<string, unknown> = {}) {
  return {
    data: [
      {
        model_name: "example/model-alpha",
        quota_type: 0,
        model_ratio: 0,
        model_price: 0,
        token_price_usd_per_million: { input: 1, output: 2 },
        price_metadata: {
          source: MODEL_PRICE_SOURCE_KINDS.PROVIDER_CATALOG,
          precision: MODEL_PRICE_PRECISION_KINDS.EXACT,
        },
        completion_ratio: 1,
        enable_groups: [],
        supported_endpoint_types: [],
        ...modelOverrides,
      },
    ],
    group_ratio: {},
    success: true,
    usable_group: {},
    model_list_source: {
      kind: MODEL_LIST_SOURCE_KINDS.PROVIDER_CATALOG,
      provider: SITE_TYPES.OPENROUTER,
      supportsRuntimeModelList: false,
      supportsPricing: true,
      actionPolicy: completeActionPolicy,
    },
  }
}

describe("provider model-catalog admission", () => {
  it("accepts cache-only prices when comparable primary pricing is unavailable", () => {
    expect(
      isValidProviderModelCatalogPricing(
        createProviderResponse({
          token_price_usd_per_million: { cache_read: 0.25 },
          price_metadata: {
            source: MODEL_PRICE_SOURCE_KINDS.PROVIDER_CATALOG,
            precision: MODEL_PRICE_PRECISION_KINDS.UNAVAILABLE,
            unavailable_reason:
              MODEL_UNAVAILABLE_PRICE_REASONS.OFFICIAL_PRICE_MISSING,
          },
        }),
        SITE_TYPES.OPENROUTER,
      ),
    ).toBe(true)
  })

  it.each([
    {
      name: "an empty presentation",
      overrides: { presentation: {} },
    },
    {
      name: "unavailable pricing without a reason",
      overrides: {
        token_price_usd_per_million: undefined,
        price_metadata: {
          source: MODEL_PRICE_SOURCE_KINDS.PROVIDER_CATALOG,
          precision: MODEL_PRICE_PRECISION_KINDS.UNAVAILABLE,
        },
      },
    },
    {
      name: "exact pricing with an unavailable reason",
      overrides: {
        price_metadata: {
          source: MODEL_PRICE_SOURCE_KINDS.PROVIDER_CATALOG,
          precision: MODEL_PRICE_PRECISION_KINDS.EXACT,
          unavailable_reason:
            MODEL_UNAVAILABLE_PRICE_REASONS.OFFICIAL_PRICE_MISSING,
        },
      },
    },
    {
      name: "exact pricing without both comparable token prices",
      overrides: {
        token_price_usd_per_million: { cache_read: 0.25 },
      },
    },
  ])("rejects $name", ({ overrides }) => {
    expect(
      isValidProviderModelCatalogPricing(
        createProviderResponse(overrides),
        SITE_TYPES.OPENROUTER,
      ),
    ).toBe(false)
  })
})
