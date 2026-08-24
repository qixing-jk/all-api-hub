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
  it("accepts the extended provider-neutral presentation fact vocabulary", () => {
    const label = { fallback: "Example fact" }
    const price = {
      label,
      amount: 1.25,
      currency: "USD",
      unit: "million-input-tokens",
    }

    expect(
      isValidProviderModelCatalogPricing(
        createProviderResponse({
          presentation: {
            summaryFacts: [
              { type: "boolean", label, value: true },
              { type: "number", label, value: 42 },
              { type: "date", label, value: "2026-08-08" },
              {
                type: "link",
                label,
                href: "https://provider.example.invalid/models/example",
                text: { fallback: "Open details" },
              },
            ],
            sections: [
              {
                id: "pricing",
                label,
                facts: [
                  { type: "currency-price", ...price },
                  {
                    type: "price-overrides",
                    label,
                    overrides: [
                      {
                        conditions: [
                          { type: "minimum-prompt-tokens", value: 200_000 },
                        ],
                        prices: [price],
                      },
                    ],
                  },
                  {
                    type: "benchmark-list",
                    label,
                    entries: [
                      {
                        arena: "models",
                        category: "example",
                        score: 1200,
                        rank: 3,
                        winRatePercent: 62.5,
                      },
                    ],
                  },
                ],
              },
            ],
          },
        }),
        SITE_TYPES.OPENROUTER,
      ),
    ).toBe(true)
  })

  it.each([
    {
      name: "an unsafe link scheme",
      fact: {
        type: "link",
        label: { fallback: "Provider details" },
        href: "http://provider.example.invalid/models/example",
        text: { fallback: "Open details" },
      },
    },
    {
      name: "an impossible calendar date",
      fact: {
        type: "date",
        label: { fallback: "Expiration date" },
        value: "2026-02-30",
      },
    },
    {
      name: "an invalid UTC clock",
      fact: {
        type: "price-overrides",
        label: { fallback: "Conditional prices" },
        overrides: [
          {
            conditions: [{ type: "utc-window", start: 1260, end: 30 }],
            prices: [
              {
                label: { fallback: "Input price" },
                amount: 1,
                currency: "USD",
                unit: "million-input-tokens",
              },
            ],
          },
        ],
      },
    },
  ])("rejects $name in extended presentation facts", ({ fact }) => {
    expect(
      isValidProviderModelCatalogPricing(
        createProviderResponse({
          presentation: {
            sections: [
              {
                id: "links",
                label: { fallback: "Links" },
                facts: [fact],
              },
            ],
          },
        }),
        SITE_TYPES.OPENROUTER,
      ),
    ).toBe(false)
  })

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
