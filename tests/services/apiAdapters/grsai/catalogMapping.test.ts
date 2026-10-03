import { describe, expect, it } from "vitest"

import { buildGrsaiPricingResponse } from "~/services/apiAdapters/grsai/catalogMapping"
import type { GrsaiModel } from "~/services/apiService/grsai/type"
import {
  MODEL_LIST_SOURCE_KINDS,
  MODEL_PRICE_PRECISION_KINDS,
  MODEL_PRICE_SOURCE_KINDS,
  MODEL_UNAVAILABLE_PRICE_REASONS,
} from "~/services/modelList/pricingModel"
import { atIndex } from "~~/tests/test-utils/indexedAccess"

const model = (overrides: Partial<GrsaiModel> = {}): GrsaiModel => ({
  id: "6aa0d5340ecdd59e65024252",
  model: "gpt-image-2.5",
  name: "gpt-image-2.5",
  credits: 600,
  desc: "gpt-image-2.5, supports 1K",
  ...overrides,
})

describe("grsai model catalog mapping", () => {
  it("prices a model per call in USD at the deployment's own base rate", () => {
    const snapshot = buildGrsaiPricingResponse([model()])

    const row = atIndex(snapshot.data, 0)
    expect(row.quota_type).toBe(1)
    expect(row.model_ratio).toBe(0)
    // 600 credits at the console's own 66,600 credits-per-dollar base rate.
    expect(row.model_price).toBeCloseTo(600 / 66_600, 10)
    expect(row.price_metadata).toEqual({
      source: MODEL_PRICE_SOURCE_KINDS.PROVIDER_CATALOG,
      // Bulk credit purchases carry a bonus, so the effective rate is lower.
      precision: MODEL_PRICE_PRECISION_KINDS.ESTIMATED,
    })
  })

  it("reports an unpriceable model instead of inventing a price", () => {
    // Video models are priced per resolution on the console and carry no
    // per-call credit figure.
    const snapshot = buildGrsaiPricingResponse([
      model({ name: "minimax-h3", model: "minimax-h3", credits: 0 }),
    ])

    expect(atIndex(snapshot.data, 0).price_metadata).toEqual({
      source: MODEL_PRICE_SOURCE_KINDS.NONE,
      precision: MODEL_PRICE_PRECISION_KINDS.UNAVAILABLE,
      unavailable_reason:
        MODEL_UNAVAILABLE_PRICE_REASONS.PRICING_SOURCE_UNAVAILABLE,
    })
  })

  it("keeps the cheapest listing when the console repeats a model", () => {
    const snapshot = buildGrsaiPricingResponse([
      model({ id: "expensive", credits: 2400 }),
      model({ id: "cheap", credits: 600 }),
      model({ id: "priceless", credits: 0 }),
    ])

    expect(snapshot.data).toHaveLength(1)
    expect(atIndex(snapshot.data, 0).model_price).toBeCloseTo(600 / 66_600, 10)
  })

  it("carries the console's description and names a model-only entry", () => {
    const snapshot = buildGrsaiPricingResponse([
      model({ name: "nano-banana-pro", model: "", desc: "Gemini image model" }),
    ])

    const row = atIndex(snapshot.data, 0)
    expect(row.model_name).toBe("nano-banana-pro")
    expect(row.model_description).toBe("Gemini image model")
  })

  it("drops entries that name no model at all", () => {
    const snapshot = buildGrsaiPricingResponse([
      model({ name: "", model: "   " }),
    ])

    expect(snapshot.data).toHaveLength(0)
  })

  it("declares the account-scoped console catalog as its source", () => {
    const snapshot = buildGrsaiPricingResponse([model()])

    expect(snapshot.success).toBe(true)
    expect(snapshot.groupAccess).toEqual({ kind: "not-applicable" })
    expect(snapshot.groupRatios).toEqual({})
    expect(snapshot.model_list_source).toMatchObject({
      kind: MODEL_LIST_SOURCE_KINDS.USER_SCOPED,
      provider: "grsai",
      supportsPricing: true,
    })
  })
})
