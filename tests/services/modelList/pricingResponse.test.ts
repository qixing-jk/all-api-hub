import { describe, expect, it } from "vitest"

import { SITE_TYPES } from "~/constants/siteType"
import {
  MODEL_LIST_SOURCE_KINDS,
  MODEL_PRICE_PRECISION_KINDS,
  MODEL_PRICE_SOURCE_KINDS,
  MODEL_UNAVAILABLE_PRICE_REASONS,
} from "~/services/modelList/pricingModel"
import {
  buildModelListCatalogPricingResponse,
  normalizeModelListModelIds,
} from "~/services/modelList/pricingResponse"
import { MODEL_VENDOR_EVIDENCE_KINDS } from "~/services/models/modelDescriptor"

describe("modelList pricingResponse", () => {
  it("normalizes, filters, and de-duplicates raw model ids", () => {
    expect(
      normalizeModelListModelIds([
        " gpt-4o ",
        "",
        "gpt-4o",
        "claude-3-haiku",
        123,
        null,
      ]),
    ).toEqual(["gpt-4o", "claude-3-haiku"])
  })

  it("builds a profile catalog response by default", () => {
    const response = buildModelListCatalogPricingResponse({
      models: [
        {
          id: " gpt-4o ",
          vendorEvidence: {
            kind: MODEL_VENDOR_EVIDENCE_KINDS.Publisher,
            name: " Example Publisher ",
          },
        },
        { id: "gpt-4o" },
        { id: "claude-3-haiku" },
      ],
    })

    expect(response).toMatchObject({
      success: true,
      group_ratio: {},
      usable_group: {},
      model_list_source: {
        kind: MODEL_LIST_SOURCE_KINDS.CATALOG_FALLBACK,
        supportsPricing: false,
      },
    })
    expect(response.data).toEqual([
      expect.objectContaining({
        model_name: "gpt-4o",
        vendorEvidence: {
          kind: MODEL_VENDOR_EVIDENCE_KINDS.Publisher,
          name: "Example Publisher",
        },
        price_metadata: {
          source: MODEL_PRICE_SOURCE_KINDS.NONE,
          precision: MODEL_PRICE_PRECISION_KINDS.UNAVAILABLE,
          unavailable_reason: MODEL_UNAVAILABLE_PRICE_REASONS.MODEL_LIST_ONLY,
        },
      }),
      expect.objectContaining({ model_name: "claude-3-haiku" }),
    ])
  })

  it("allows runtime catalog source metadata and unavailable reason overrides", () => {
    const response = buildModelListCatalogPricingResponse({
      models: [{ id: "runtime-model" }],
      unavailableReason:
        MODEL_UNAVAILABLE_PRICE_REASONS.PRICING_SOURCE_UNAVAILABLE,
      source: {
        kind: MODEL_LIST_SOURCE_KINDS.SUB2API_RUNTIME_KEY,
        provider: SITE_TYPES.SUB2API,
        supportsRuntimeModelList: true,
        supportsPricing: false,
      },
    })

    expect(response.model_list_source).toEqual({
      kind: MODEL_LIST_SOURCE_KINDS.SUB2API_RUNTIME_KEY,
      provider: SITE_TYPES.SUB2API,
      supportsRuntimeModelList: true,
      supportsPricing: false,
    })
    expect(response.data[0]).toMatchObject({
      model_name: "runtime-model",
      price_metadata: {
        source: MODEL_PRICE_SOURCE_KINDS.NONE,
        precision: MODEL_PRICE_PRECISION_KINDS.UNAVAILABLE,
        unavailable_reason:
          MODEL_UNAVAILABLE_PRICE_REASONS.PRICING_SOURCE_UNAVAILABLE,
      },
    })
  })
})
