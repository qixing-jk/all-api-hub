import { expect, it } from "vitest"

import { CURRENCIES } from "~/constants/money"
import type { PricingPlan } from "~/services/modelPricing/pricingPlan"
import {
  quoteQuotaUsage,
  type QuotaPricingPlan,
} from "~/services/modelPricing/quotaPricing"
import {
  projectMonetaryQuoteAmount,
  projectQuotaQuoteAmount,
} from "~/services/modelPricing/quoteAmount"
import { quoteCanonicalModelPrice } from "~/services/modelPricing/quoteCanonicalModelPrice"
import { quoteModelPrice } from "~/services/modelPricing/quoteModelPrice"

it("retains comparison intent when a per-call price uses a one-request quantity", () => {
  const quote = quoteCanonicalModelPrice(
    {
      model_name: "fixed-call",
      quota_type: 1,
      model_price: 0.5,
      model_ratio: 0,
      completion_ratio: 1,
      enable_groups: [],
      supported_endpoint_types: [],
    },
    { purpose: "token-index", usage: { input: 1 } },
    { groupMultiplier: 1 },
  )
  expect(projectMonetaryQuoteAmount(quote)).toMatchObject({
    kind: "unit-comparison",
    amount: { value: "0.5" },
  })
})

it("projects scenario estimates in their quoted currency while retaining the published source currency and time", () => {
  const plan: PricingPlan = {
    rates: {
      input: {
        amount: 7,
        per: 1_000_000,
        currency: CURRENCIES.CNY,
        unit: "token",
      },
    },
    rules: [],
    issues: [],
    groupMultiplier: "included",
    source: {
      kind: "catalog",
      capturedAt: "2026-11-11",
      url: "https://example.test/pricing",
    },
  }
  const quote = quoteModelPrice(
    plan,
    { purpose: "request", usage: { input: 1_000_000 } },
    { currency: CURRENCIES.USD, cnyPerUsd: 7 },
  )
  expect(projectMonetaryQuoteAmount(quote)).toEqual({
    kind: "scenario-estimate",
    precision: "approximate",
    status: "complete",
    amount: { value: "1", asset: { kind: "currency", code: "USD" } },
    source: plan.source,
  })
  expect(quote.publishedSchedule![0]!.rates.input!.currency).toBe("CNY")
  expect(
    projectMonetaryQuoteAmount({ ...quote, purpose: undefined }),
  ).toMatchObject({
    kind: "unclassified-quote",
    amount: { value: "1" },
  })
  for (const amount of [null, NaN, -1])
    expect(projectMonetaryQuoteAmount({ ...quote, amount })).not.toHaveProperty(
      "amount",
    )
  expect(
    projectMonetaryQuoteAmount(
      quoteModelPrice(
        plan,
        { purpose: "request", usage: { input: 1 } },
        { currency: "USD" },
      ),
    ),
  ).toMatchObject({ status: "unavailable" })
  expect(
    projectMonetaryQuoteAmount(
      quoteModelPrice(
        plan,
        { purpose: "request", usage: { input: 1 } },
        { currency: "USD" },
      ),
    ),
  ).not.toHaveProperty("amount")
})

it("keeps native Token quotation distinct from measured input Tokens and unresolved account factors", () => {
  const plan: QuotaPricingPlan = {
    unit: {
      id: "emrank:tokens",
      label: "Token",
      displayLabel: "M Token",
      displayScale: 1_000_000,
    },
    rates: { input: { amount: 3, per: 1 } },
    adjustments: [{ id: "level", label: { en: "Level" } }],
    comparisonScope: "source",
    rounding: "floor",
    sourceUrl: "https://docs.emrank.tech/guide/billing.html",
  }
  const unavailable = projectQuotaQuoteAmount(
    plan,
    quoteQuotaUsage(plan, { output: 1 }),
    "scenario-estimate",
  )
  expect(unavailable.status).toBe("unavailable")
  expect(unavailable).not.toHaveProperty("amount")

  expect(
    projectQuotaQuoteAmount(
      plan,
      quoteQuotaUsage(plan, { input: 1_000 }),
      "scenario-estimate",
    ),
  ).toEqual({
    kind: "published-reference",
    precision: "approximate",
    status: "reference",
    amount: { value: "3000", asset: { kind: "quota", ...plan.unit } },
    source: { kind: "catalog", url: plan.sourceUrl },
  })
  expect(
    projectQuotaQuoteAmount(
      plan,
      quoteQuotaUsage(plan, { input: 1_000 }, { adjustments: { level: 1.5 } }),
      "scenario-estimate",
    ),
  ).toMatchObject({
    kind: "scenario-estimate",
    amount: { value: "4500", asset: { kind: "quota", id: "emrank:tokens" } },
  })
})
