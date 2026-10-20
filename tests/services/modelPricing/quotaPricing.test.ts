import { describe, expect, it } from "vitest"

import {
  QUOTA_COMPARISON_SCOPES,
  QUOTA_QUOTE_STATUSES,
  QUOTA_ROUNDING_MODES,
  quoteQuotaUsage,
  type QuotaPricingPlan,
} from "~/services/modelPricing/quotaPricing"

const plan: QuotaPricingPlan = {
  unit: {
    id: "points",
    label: "Points",
    displayScale: 1000,
    displayLabel: "K Points",
  },
  rates: { input: { amount: 0.25, per: 1 }, output: { amount: 0, per: 1 } },
  adjustments: [{ id: "tier", label: { en: "Tier" } }],
  comparisonScope: QUOTA_COMPARISON_SCOPES.Source,
  rounding: QUOTA_ROUNDING_MODES.Floor,
  sourceUrl: "https://example.test/pricing",
}

describe("quota consumption", () => {
  it.each([
    {},
    { input: 0 },
    { input: Number.MAX_VALUE, output: Number.MAX_VALUE },
  ])("rejects an empty or overflowing comparison quantity %j", (usage) => {
    expect(quoteQuotaUsage(plan, usage, { comparison: true })).toMatchObject({
      status: "unavailable",
      reason: "invalid-usage",
    })
  })
  it("rejects overflowing native rates before settlement", () => {
    expect(
      quoteQuotaUsage(
        { ...plan, rates: { input: { amount: Number.MAX_VALUE, per: 1 } } },
        { input: 2 },
      ),
    ).toMatchObject({ status: "unavailable", reason: "invalid-usage" })
  })
  it.each([-1, Infinity, NaN, Number.MAX_VALUE])(
    "rejects an invalid or overflowing adjustment %s",
    (tier) => {
      expect(
        quoteQuotaUsage(plan, { input: 4 }, { adjustments: { tier } }),
      ).toMatchObject({ status: "unavailable", reason: "invalid-usage" })
    },
  )
  it("settles only after all adjustments, with one final floor", () => {
    expect(
      quoteQuotaUsage(plan, { input: 3 }, { adjustments: { tier: 2 } }),
    ).toMatchObject({ status: "complete", baseAmount: 0.75, amount: 1 })
  })
  it("keeps unknown factors unresolved and accepts an explicit zero factor", () => {
    expect(quoteQuotaUsage(plan, { input: 3 })).toMatchObject({
      status: QUOTA_QUOTE_STATUSES.Reference,
      amount: null,
      missingAdjustments: ["tier"],
    })
    expect(
      quoteQuotaUsage(plan, { input: 3 }, { adjustments: { tier: 0 } }),
    ).toMatchObject({ status: "complete", amount: 0 })
  })
  it("compares weighted usage without applying request rounding", () => {
    expect(
      quoteQuotaUsage(
        plan,
        { input: 1, output: 2, cacheRead: null },
        { comparison: true },
      ),
    ).toMatchObject({
      status: QUOTA_QUOTE_STATUSES.Reference,
      baseAmount: 1_000_000 / 12,
    })
  })
  it("requires an explicit rate for positive usage of another meter", () => {
    expect(quoteQuotaUsage(plan, { input: 1, cacheRead: 1 })).toMatchObject({
      status: "unavailable",
      reason: "missing-rate",
    })
  })
  it.each([null, -1, 0.5, Infinity, Number.MAX_SAFE_INTEGER + 1])(
    "rejects invalid request quantities: %s",
    (input) => {
      expect(quoteQuotaUsage(plan, { input })).toMatchObject({
        status: "unavailable",
        reason: "invalid-usage",
      })
    },
  )
  it.each([
    { ...plan, rates: {} },
    { ...plan, sourceUrl: "javascript:alert(1)" },
  ])("rejects incomplete or unsafe plans", (invalid) => {
    expect(quoteQuotaUsage(invalid, { input: 1 })).toMatchObject({
      status: "unavailable",
      reason: "invalid-plan",
    })
  })
})
