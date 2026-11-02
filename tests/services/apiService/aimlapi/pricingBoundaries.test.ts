import { expect, it } from "vitest"

import { readAimlApiCatalogPrice } from "~/services/apiService/aimlapi/catalogPrice"
import type { AimlApiPublicModel } from "~/services/apiService/aimlapi/models"

const unit = {
  type: "charge",
  name: "token",
  content: "text",
  origin: "provided",
  variable: false,
  price: 1,
  per: 1000000,
}
const fixed = {
  kind: "fixed",
  currency: "USD",
  thresholds: [],
  dimensions: [],
  variants: [],
  units: [unit],
}
const model = (pricing: unknown): AimlApiPublicModel => ({
  id: "model",
  info: { name: "Model", developer: "Vendor" },
  type: "openai/chat-completions",
  aliases: [],
  tags: [],
  pricing,
})

it.each([
  ["image", "unknown"],
  ["audio", "cached"],
  ["text", undefined],
])(
  "retains the known subtotal and flags an unmapped %s token origin",
  (content, origin) => {
    const result = readAimlApiCatalogPrice(
      model({
        ...fixed,
        units: [unit, { ...unit, content, origin, price: 2 }],
      }),
    )
    expect(result.rates.input).toMatchObject({ amount: 1, per: 1000000 })
    expect(result.hasUnpricedCharges).toBe(true)
    expect(result.estimated).toBe(true)
  },
)

it.each([undefined, [], [null], [{ ...unit, price: "unknown" }]])(
  "keeps variable schedules unavailable without numeric reference rates %#",
  (units) => {
    expect(
      readAimlApiCatalogPrice(model({ ...fixed, kind: "variable", units })),
    ).toMatchObject({ rates: {}, rulesUnavailable: true })
  },
)

it.each([
  { ...fixed, thresholds: [{ from: 0, units: [null] }] },
  { ...fixed, thresholds: [{ from: 0, units: [{ ...unit, price: 2 }] }] },
  { ...fixed, thresholds: [{ from: 0, units: [unit] }], units: undefined },
])(
  "retains source uncertainty for conflicting or malformed threshold references %#",
  (pricing) => {
    const price = readAimlApiCatalogPrice(model(pricing))
    expect(price.rulesUnavailable).toBe(true)
    expect(price.rates).toEqual({})
    expect(price.issues).toContainEqual({
      code: "unverified-axis",
      reason: "source-conflict",
    })
  },
)

it("maps an explicit per-call charge as request pricing", () => {
  expect(
    readAimlApiCatalogPrice(
      model({
        ...fixed,
        units: [
          {
            ...unit,
            name: "call",
            content: undefined,
            origin: undefined,
            price: 0.1,
            per: 1,
          },
        ],
      }),
    ),
  ).toMatchObject({
    rates: { request: { amount: 0.1, per: 1, unit: "request" } },
  })
})

it("keeps hold-only schedules unavailable rather than publishing free inference", () => {
  expect(
    readAimlApiCatalogPrice(
      model({ ...fixed, units: [{ ...unit, type: "hold" }] }),
    ),
  ).toMatchObject({ rates: {}, rulesUnavailable: true })
})

it("refuses to combine an independent image charge with a video-token variant quote", () => {
  const pricing = {
    ...fixed,
    kind: "variants",
    units: [
      { ...unit, variable: true, content: "video", origin: "generated" },
      {
        ...unit,
        name: "generation",
        content: "image",
        origin: "generated",
        per: 1,
      },
    ],
    variants: [{ when: {}, unit: "token", price: 1, per: 1000000 }],
  }
  expect(
    readAimlApiCatalogPrice({
      ...model(pricing),
      type: "internal/video-generations/submit",
    }),
  ).toMatchObject({ rates: {}, rulesUnavailable: true })
})

it.each([
  { ...fixed, kind: "variants", variants: [], units: [] },
  {
    ...fixed,
    kind: "variants",
    variants: [{ when: {}, price: 1, per: 1, unit: "unknown" }],
    units: [{ ...unit, variable: true }],
  },
  {
    ...fixed,
    kind: "variants",
    variants: [{ when: {}, price: -1, per: 1, unit: "generation" }],
    units: [{ ...unit, variable: true }],
  },
  {
    ...fixed,
    kind: "variants",
    variants: [
      { when: { quality: "hd" }, price: 1, per: 1, unit: "generation" },
    ],
    units: [
      { ...unit, variable: true },
      { ...unit, price: 2 },
    ],
  },
])("refuses incomplete or ambiguous request variant charges %#", (pricing) => {
  expect(readAimlApiCatalogPrice(model(pricing))).toMatchObject({
    rates: {},
    rulesUnavailable: true,
  })
})

it.each([true, -1, "invalid"])(
  "refuses an invalid web-search context charge: %s",
  (price) => {
    const context = {
      ...unit,
      name: "call",
      price,
      per: 1,
      tag: { type: "tool", name: "websearch_context_low" },
    }
    expect(
      readAimlApiCatalogPrice(model({ ...fixed, units: [unit, context] })),
    ).toMatchObject({ rates: {}, rulesUnavailable: true })
  },
)
