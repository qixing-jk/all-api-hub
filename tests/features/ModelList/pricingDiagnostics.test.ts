import { describe, expect, it } from "vitest"

import { createProfileSource } from "~/features/ModelList/modelManagementSources"
import { buildPricingDiagnostics } from "~/features/ModelList/pricingDiagnostics"
import {
  CALCULATED_PRICE_KINDS,
  PRICE_RATE_UNITS,
  PRICING_GROUP_MULTIPLIERS,
  PRICING_IMAGE_SIZES,
  PRICING_ISSUE_CODES,
  PRICING_ISSUE_REASONS,
  PRICING_METERS,
  PRICING_PURPOSES,
  PRICING_SELECTION_AXES,
  PRICING_SOURCE_KINDS,
  TOKENS_PER_MILLION,
} from "~/services/modelPricing/pricingConstants"
import type { PricingPlan } from "~/services/modelPricing/pricingPlan"
import { quoteModelPrice } from "~/services/modelPricing/quoteModelPrice"

const plan: PricingPlan = {
  rates: {
    input: {
      amount: 1,
      currency: "USD",
      unit: PRICE_RATE_UNITS.TOKEN,
      per: TOKENS_PER_MILLION,
    },
  },
  rules: [],
  source: {
    kind: PRICING_SOURCE_KINDS.CATALOG,
    url: "https://api.example/prices?secret=PRIVATE",
  },
  groupMultiplier: PRICING_GROUP_MULTIPLIERS.INCLUDED,
  issues: [],
}
const source = createProfileSource({
  id: "profile",
  name: "Example",
  apiType: "openai-compatible",
  baseUrl: "https://user:PRIVATE@api.example/v1?key=PRIVATE",
  apiKey: "PRIVATE",
  notes: "PRIVATE",
  tagIds: [],
  createdAt: 0,
  updatedAt: 0,
})
const row = (name: string, usage: { input: number; output?: number }) => ({
  model: {
    model_name: name,
    model_ratio: 1,
    model_price: 0,
    quota_type: 0,
    completion_ratio: 1,
    enable_groups: [],
    supported_endpoint_types: [],
    pricingPlan: plan,
  },
  source,
  calculatedPrice: {
    kind: "token" as const,
    usdPerMillionTokens: { input: 1, output: 0 },
    quote: quoteModelPrice(plan, {
      purpose: PRICING_PURPOSES.TOKEN_INDEX,
      usage,
    }),
  },
})

describe("pricing diagnostics", () => {
  it("exports actionable selections alongside the original issue codes", () => {
    const item = row("video", { input: 1 })
    item.calculatedPrice.quote.conditionDetails = [
      {
        axis: PRICING_SELECTION_AXES.VIDEO_QUALITY,
        selected: PRICING_IMAGE_SIZES.K4,
        available: ["720p", "1080p"],
      },
    ]
    item.calculatedPrice.quote.issues = [
      { code: PRICING_ISSUE_CODES.PRICE_RANGE_UNAVAILABLE },
    ]
    const report = buildPricingDiagnostics([item])
    expect(report.rows[0]).toMatchObject({
      conditionDetails: item.calculatedPrice.quote.conditionDetails,
      issues: [{ code: "price-range-unavailable" }],
    })
  })
  it.each([0, 1, 2, 5, 10])(
    "recognizes an existing fixed-call calculation of %s without a canonical quote",
    (amount) => {
      const item = row("fixed-call", { input: 1 })
      const report = buildPricingDiagnostics([
        {
          ...item,
          model: { ...item.model, quota_type: 1, pricingPlan: undefined },
          calculatedPrice: {
            kind: CALCULATED_PRICE_KINDS.PER_CALL,
            usdPerCall: amount,
          },
        },
      ])
      expect(report.rows[0]).toMatchObject({
        status: "complete",
        unit: "request",
        issues: [],
        legacyPrice: { amount, currency: "USD", unit: "request" },
      })
      expect(report.summary).toMatchObject({
        complete: 1,
        notQuoted: 0,
        attention: 0,
      })
    },
  )
  it.each([{ input: NaN, output: NaN }, -1, NaN, Infinity])(
    "keeps missing or invalid fixed-call prices inspectable: %s",
    (amount) => {
      const item = row("unpriced-call", { input: 1 })
      const report = buildPricingDiagnostics([
        {
          ...item,
          model: { ...item.model, quota_type: 1, pricingPlan: undefined },
          calculatedPrice: {
            kind: CALCULATED_PRICE_KINDS.PER_CALL,
            usdPerCall: amount,
          },
        },
      ])
      expect(report.rows[0]).toMatchObject({
        status: "not-quoted",
        issues: [{ code: "diagnostic:not-quoted" }],
      })
    },
  )
  it("explains an unavailable group instead of reporting a missing quote", () => {
    const item = row("embedding", { input: 1 })
    const report = buildPricingDiagnostics([
      {
        ...item,
        calculatedPrice: {
          kind: CALCULATED_PRICE_KINDS.UNAVAILABLE,
          billingMode: "per-call",
          reason: "no-usable-group",
        },
      },
    ])
    expect(report.rows[0]).toMatchObject({
      status: "unavailable",
      unit: "request",
      issues: [{ code: "availability:no-usable-group" }],
    })
    expect(report.summary.notQuoted).toBe(0)
  })
  it("exposes normalized unsupported reasons without copying expressions", () => {
    const item = row("unsupported", { input: 1 })
    item.model.pricingPlan = {
      ...plan,
      issues: [
        {
          code: PRICING_ISSUE_CODES.UNSUPPORTED_RULE,
          reason: PRICING_ISSUE_REASONS.TASK_USAGE,
        },
      ],
    }
    expect(buildPricingDiagnostics([item]).rows[0].issues).toContainEqual({
      code: "unsupported:task-usage",
    })
  })
  it.each([false, true])(
    "only flags a scoped cache rule when cache is selected: %s",
    (useCache) => {
      const item = row("scoped-cache", { input: 1 })
      item.model.pricingPlan = {
        ...plan,
        issues: [
          {
            code: PRICING_ISSUE_CODES.UNSUPPORTED_RULE,
            reason: PRICING_ISSUE_REASONS.REQUEST_CONDITION,
            meters: [PRICING_METERS.CACHE_READ],
          },
        ],
      }
      item.calculatedPrice.quote = quoteModelPrice(item.model.pricingPlan, {
        purpose: PRICING_PURPOSES.TOKEN_INDEX,
        usage: { input: 1, cacheRead: useCache ? 1 : 0 },
      })
      const report = buildPricingDiagnostics([item])
      expect(
        report.rows[0].issues.some(
          (issue) => issue.code === "unsupported:request-condition",
        ),
      ).toBe(useCache)
      expect(report.summary.attention).toBe(useCache ? 1 : 0)
      expect(report.rows[0].plan?.issues).toEqual(item.model.pricingPlan.issues)
    },
  )
  it("flags a complete quote with an invalid amount without treating zero prices as missing", () => {
    const invalid = row("inconsistent", { input: 1 })
    invalid.calculatedPrice.quote.amount = null
    const free = row("free", { input: 1 })
    free.calculatedPrice.quote.amount = 0
    const report = buildPricingDiagnostics([invalid, free])
    expect(report.rows[0].issues).toEqual([
      { code: "diagnostic:inconsistent-quote" },
    ])
    expect(report.rows[1].issues).toEqual([])
  })
  it("keeps missing quotes and malformed canonical plans inspectable", () => {
    const invalid = row("invalid-plan", { input: 1 })
    invalid.model.pricingPlan = {
      ...plan,
      source: {
        kind: PRICING_SOURCE_KINDS.CATALOG,
        url: "PRIVATE invalid URL",
      },
    }
    const absent = row("not-calculated", { input: 1 })
    const report = buildPricingDiagnostics([
      invalid,
      {
        ...absent,
        calculatedPrice: { ...absent.calculatedPrice, quote: undefined },
      },
    ])
    expect(report.rows[0].issues).toContainEqual({
      code: "diagnostic:invalid-plan",
    })
    expect(report.rows[1].issues).toEqual([{ code: "diagnostic:not-quoted" }])
    expect(report.summary.notQuoted).toBe(1)
    expect(JSON.stringify(report)).not.toContain("PRIVATE")
  })
  it("summarizes existing quote issues once per offer and retains complete coverage", () => {
    const missing = row("missing-output", { input: 1, output: 1 })
    missing.calculatedPrice.quote.issues.push({
      code: PRICING_ISSUE_CODES.PRICE_MISSING,
      meter: PRICING_METERS.OUTPUT,
    })
    const report = buildPricingDiagnostics([
      row("complete", { input: 1 }),
      missing,
    ])
    expect(report.summary).toMatchObject({
      total: 2,
      complete: 1,
      partial: 1,
      attention: 1,
    })
    expect(report.issueCounts).toEqual([{ code: "price-missing", count: 1 }])
    expect(report.rows[1].issues).toEqual([
      { code: "price-missing", meter: "output" },
    ])
    expect(report.units).toEqual([
      { unit: "million-selected-tokens", count: 2 },
    ])
  })

  it("exports only diagnostic fields and removes URL credentials, paths and queries", () => {
    const report = buildPricingDiagnostics([row("example-model", { input: 1 })])
    expect(report.rows[0].source).toEqual({
      name: "Example",
      origin: "https://api.example",
    })
    expect(report.rows[0].plan?.rates.input?.amount).toBe(1)
    expect(JSON.stringify(report)).not.toContain("PRIVATE")
    expect(JSON.stringify(report)).not.toContain("apiKey")
  })
})

it("exports safe source availability flags without source URLs or descriptions", () => {
  const item = row("unavailable", { input: 1 })
  item.model.pricingPlan = {
    ...plan,
    source: {
      ...plan.source,
      rulesUnavailable: true,
      hasUnpricedCharges: true,
      pricingDescription: { en: "PRIVATE" },
    },
  }
  const report = buildPricingDiagnostics([item])
  expect(report.rows[0].plan?.source).toEqual({
    kind: "catalog",
    rulesUnavailable: true,
    hasUnpricedCharges: true,
  })
  expect(JSON.stringify(report)).not.toContain("PRIVATE")
})
