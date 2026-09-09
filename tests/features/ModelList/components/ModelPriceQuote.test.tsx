import { expect, it, vi } from "vitest"

import { ModelPriceQuote } from "~/features/ModelList/components/ModelItem/ModelPriceQuote"
import { PricingScenarioNavigation } from "~/features/ModelList/pricingScenarioNavigation"
import { normalizeOpenRouterPricingPlan } from "~/services/apiAdapters/openrouter/pricingPlan"
import { buildAIHubMixWebsitePricingPlan } from "~/services/apiService/aihubmix/websitePricing"
import {
  PRICE_RATE_UNITS,
  PRICING_CONDITION_KINDS,
  PRICING_GROUP_MULTIPLIERS,
  PRICING_IMAGE_SIZES,
  PRICING_ISSUE_CODES,
  PRICING_METERS,
  PRICING_PURPOSES,
  PRICING_RANGE_AXES,
  PRICING_SELECTION_AXES,
  PRICING_SOURCE_KINDS,
  PRICING_USAGE_MODES,
  TOKENS_PER_MILLION,
} from "~/services/modelPricing/pricingConstants"
import type { PricingPlan } from "~/services/modelPricing/pricingPlan"
import { quoteModelPrice } from "~/services/modelPricing/quoteModelPrice"
import { fireEvent, render, screen } from "~~/tests/test-utils/render"

const plan: PricingPlan = {
  rates: {
    input: {
      amount: 1,
      currency: "USD",
      unit: PRICE_RATE_UNITS.TOKEN,
      per: TOKENS_PER_MILLION,
    },
    output: {
      amount: 2,
      currency: "USD",
      unit: PRICE_RATE_UNITS.TOKEN,
      per: TOKENS_PER_MILLION,
    },
  },
  rules: [
    {
      id: "long",
      conditions: [
        {
          kind: PRICING_CONDITION_KINDS.RANGE,
          axis: PRICING_RANGE_AXES.INPUT_TOKENS,
          min: 100001,
        },
      ],
      rates: {
        input: {
          amount: 3,
          currency: "USD",
          unit: PRICE_RATE_UNITS.TOKEN,
          per: TOKENS_PER_MILLION,
        },
      },
    },
  ],
  groupMultiplier: PRICING_GROUP_MULTIPLIERS.INCLUDED,
  source: { kind: PRICING_SOURCE_KINDS.ACCOUNT },
  issues: [],
}
it("keeps one recovery action and moves source evidence into expanded details", async () => {
  const quote = quoteModelPrice(
    {
      usageMode: PRICING_USAGE_MODES.IMAGE,
      rates: {},
      groupMultiplier: PRICING_GROUP_MULTIPLIERS.INCLUDED,
      issues: [],
      requiresRuleMatch: true,
      source: {
        kind: PRICING_SOURCE_KINDS.CATALOG,
        url: "https://example.com/pricing",
        hasUnpricedCharges: true,
      },
      rules: [
        {
          id: PRICING_IMAGE_SIZES.K2,
          conditions: [
            {
              kind: PRICING_CONDITION_KINDS.SELECTION,
              axis: PRICING_SELECTION_AXES.IMAGE_SIZE,
              value: PRICING_IMAGE_SIZES.K2,
            },
          ],
          rates: {
            image: {
              amount: 0.2,
              currency: "USD",
              unit: PRICE_RATE_UNITS.IMAGE,
              per: 1,
            },
          },
        },
      ],
    },
    { purpose: PRICING_PURPOSES.TOKEN_INDEX, usage: { input: 1 } },
  )
  render(
    <PricingScenarioNavigation onConfigure={() => {}}>
      <ModelPriceQuote quote={quote} />
      <ModelPriceQuote quote={quote} details showSummary={false} />
    </PricingScenarioNavigation>,
  )
  expect(
    await screen.findAllByRole("button", {
      name: /modelList:scenario.configure/,
    }),
  ).toHaveLength(1)
  expect(
    screen.getAllByText("modelList:scenario.noComparisonPrice"),
  ).toHaveLength(1)
  expect(
    screen.queryByText("modelList:scenario.needsConditions"),
  ).not.toBeInTheDocument()
  expect(
    screen.getAllByText("modelList:scenario.additionalChargesExcluded"),
  ).toHaveLength(1)
  expect(screen.getAllByRole("link")).toHaveLength(1)
})
it("labels output-based tiers as billable output length", async () => {
  const quote = quoteModelPrice(
    {
      ...plan,
      rules: [
        {
          id: "output",
          conditions: [
            {
              kind: PRICING_CONDITION_KINDS.RANGE,
              axis: PRICING_RANGE_AXES.OUTPUT_TOKENS,
              min: 1000,
              outputTokenDeductions: { openai: [], anthropic: [] },
            },
          ],
          rates: plan.rates,
        },
      ],
    },
    {
      purpose: PRICING_PURPOSES.TOKEN_INDEX,
      outputTokens: 2000,
      usage: { output: 1 },
    },
  )
  render(<ModelPriceQuote quote={quote} />)
  expect(await screen.findByText(/modelList:scenario.netOutput/)).toBeVisible()
})
it("keeps excluded billing items in the calculation details", async () => {
  const quote = quoteModelPrice(
    {
      ...plan,
      rules: [],
      source: { kind: PRICING_SOURCE_KINDS.CATALOG, hasUnpricedCharges: true },
    },
    { purpose: PRICING_PURPOSES.TOKEN_INDEX, usage: { input: 1 } },
  )
  render(<ModelPriceQuote quote={quote} />)
  fireEvent.click(
    await screen.findByRole("button", {
      name: "modelList:scenario.calculationDetails",
    }),
  )
  expect(
    await screen.findByText("modelList:scenario.additionalChargesExcluded"),
  ).toBeVisible()
})
it("links public pricing from the calculation details", async () => {
  const quote = quoteModelPrice(
    {
      ...plan,
      source: {
        kind: PRICING_SOURCE_KINDS.CATALOG,
        label: "Aihubmix",
        url: "https://aihubmix.com/model/qwen-flash#pricing",
      },
    },
    {
      purpose: PRICING_PURPOSES.TOKEN_INDEX,
      inputTokens: 32000,
      usage: { input: 4, output: 1 },
    },
  )
  render(<ModelPriceQuote quote={quote} />)
  fireEvent.click(
    await screen.findByRole("button", {
      name: "modelList:scenario.calculationDetails",
    }),
  )
  const link = await screen.findByRole("link", {
    name: "modelList:scenario.source",
  })
  expect(link).toHaveAttribute(
    "href",
    "https://aihubmix.com/model/qwen-flash#pricing",
  )
  expect(link).toHaveAttribute("target", "_blank")
  expect(link).toHaveAttribute("rel", "noopener noreferrer")
})

it("explains incomplete website rules without presenting a complete price or lowest badge", async () => {
  const quote = quoteModelPrice(
    {
      ...plan,
      source: { kind: PRICING_SOURCE_KINDS.CATALOG, rulesUnavailable: true },
      issues: [{ code: PRICING_ISSUE_CODES.UNSUPPORTED_RULE }],
    },
    {
      purpose: PRICING_PURPOSES.TOKEN_INDEX,
      inputTokens: 32000,
      usage: { input: 1 },
    },
  )
  render(<ModelPriceQuote quote={quote} isLowestPrice />)
  expect(
    await screen.findByText("modelList:scenario.websiteRulesUnavailable"),
  ).toBeVisible()
  expect(
    screen.queryByText("modelList:scenario.lowest"),
  ).not.toBeInTheDocument()
})

it.each([
  { inputTokens: 32000, reason: "unverifiedCacheBasis" },
  { inputTokens: undefined, reason: "numericRequirement" },
])(
  "keeps website tiers visible and explains $reason from the quote",
  async ({ inputTokens, reason }) => {
    const websitePlan = buildAIHubMixWebsitePricingPlan(
      "qwen-flash",
      JSON.stringify({
        model_name: "qwen-flash",
        default_tier: "tier1",
        token_based_tier_configs: {
          tier1: {
            model_ratio: 0.010273,
            completion_tokens_ratio: 10,
            tier_condition: { min_tokens: 0, max_tokens: 128000 },
          },
        },
      }),
    )
    render(
      <ModelPriceQuote
        quote={quoteModelPrice(websitePlan, {
          purpose: PRICING_PURPOSES.TOKEN_INDEX,
          inputTokens,
          usage: { input: 1, cacheRead: 1 },
        })}
        details
      />,
    )
    expect(
      await screen.findByText(new RegExp(`^modelList:scenario.${reason}`)),
    ).toBeVisible()
    expect(screen.getByText(/128000/)).toBeVisible()
    expect(
      screen.queryByText("modelList:scenario.currentBaseTier"),
    ).not.toBeInTheDocument()
  },
)
it("shows source pricing notes for unsupported billing without text weights or an empty calculation table", async () => {
  const quote = quoteModelPrice(
    {
      rates: {},
      rules: [],
      usageMode: PRICING_USAGE_MODES.CUSTOM,
      groupMultiplier: PRICING_GROUP_MULTIPLIERS.INCLUDED,
      issues: [{ code: PRICING_ISSUE_CODES.UNSUPPORTED_RULE }],
      source: {
        kind: PRICING_SOURCE_KINDS.CATALOG,
        rulesUnavailable: true,
        pricingDescription: {
          en: "Published video pricing depends on the generated result.",
        },
      },
    },
    { purpose: PRICING_PURPOSES.TOKEN_INDEX, usage: { input: 80, output: 20 } },
  )
  render(<ModelPriceQuote quote={quote} details />)
  expect(
    await screen.findByText(
      /Published video pricing depends on the generated result/,
    ),
  ).toBeVisible()
  expect(
    screen.queryByText("modelList:scenario.blendedPrice"),
  ).not.toBeInTheDocument()
  expect(
    screen.queryByText("modelList:scenario.calculationHint"),
  ).not.toBeInTheDocument()
  expect(screen.queryByRole("table")).not.toBeInTheDocument()
})

it("opens a calculation with source rates, normalized shares and contributions", async () => {
  const quote = quoteModelPrice(plan, {
    purpose: PRICING_PURPOSES.TOKEN_INDEX,
    inputTokens: 32000,
    usage: { input: 4, output: 1 },
  })
  render(<ModelPriceQuote quote={quote} sourceLabel="Example source" />)
  fireEvent.click(
    await screen.findByRole("button", {
      name: "modelList:scenario.calculationDetails",
    }),
  )
  expect(screen.getByText("Example source")).toBeVisible()
  expect(screen.getByText("80%")).toBeVisible()
  expect(screen.getByText("20%")).toBeVisible()
  expect(screen.getByText("$0.800000")).toBeVisible()
  expect(screen.getByText("$0.400000")).toBeVisible()
  expect(
    screen.getByRole("columnheader", {
      name: "modelList:scenario.effectiveRate",
    }),
  ).toBeVisible()
})
it("explains the active tier and rate change beside the updated request amount", async () => {
  const quote = (input: number) =>
    quoteModelPrice(plan, {
      purpose: PRICING_PURPOSES.REQUEST,
      inputTokens: input,
      usage: { input, output: 1000 },
    })
  const { rerender } = render(<ModelPriceQuote quote={quote(100000)} />)
  expect(await screen.findByText("$0.102000")).toBeVisible()
  expect(screen.getByText("modelList:scenario.currentBaseTier")).toBeVisible()
  rerender(<ModelPriceQuote quote={quote(100001)} />)
  expect(await screen.findByText("$0.302003")).toBeVisible()
  expect(screen.getByText(/modelList:scenario.currentTier/)).toBeVisible()
  expect(screen.getByText(/modelList:scenario.rateChange/)).toBeVisible()
})
it("labels a subtotal with its omitted meter and never awards it a lowest badge", async () => {
  const quote = quoteModelPrice(
    {
      ...plan,
      rules: [],
      issues: [
        {
          code: PRICING_ISSUE_CODES.UNSUPPORTED_RULE,
          meters: [PRICING_METERS.OUTPUT],
        },
      ],
    },
    { purpose: PRICING_PURPOSES.TOKEN_INDEX, usage: { input: 1, output: 1 } },
  )
  render(<ModelPriceQuote quote={quote} isLowestPrice />)
  expect(await screen.findByText("modelList:scenario.knownPrice")).toBeVisible()
  expect(screen.getByText(/modelList:scenario.excludedCosts/)).toBeVisible()
  expect(
    screen.queryByText("modelList:scenario.partial"),
  ).not.toBeInTheDocument()
  expect(
    screen.queryByText("modelList:scenario.lowest"),
  ).not.toBeInTheDocument()
  expect(
    screen.queryByText("modelList:scenario.indexScope"),
  ).not.toBeInTheDocument()
  expect(
    screen.queryByText(/modelList:scenario.unsupportedRule/),
  ).not.toBeInTheDocument()
})

vi.mock("react-i18next", async (importOriginal) => ({
  ...(await importOriginal<typeof import("react-i18next")>()),
  useTranslation: () => ({
    t: (key: string, options?: unknown) =>
      `modelList:${key}${options ? JSON.stringify(options) : ""}`,
    i18n: { language: "en" },
  }),
}))
it("shows both tier rates using the same group multiplier and currency", async () => {
  const quote = quoteModelPrice(
    { ...plan, groupMultiplier: PRICING_GROUP_MULTIPLIERS.PENDING },
    {
      purpose: PRICING_PURPOSES.REQUEST,
      inputTokens: 100001,
      usage: { input: 100001, output: 1000 },
    },
    { groupMultiplier: 2, currency: "CNY", cnyPerUsd: 7 },
  )
  render(<ModelPriceQuote quote={quote} />)
  const change = await screen.findByText(/modelList:scenario.rateChange/)
  expect(change).toHaveTextContent("14.00")
  expect(change).toHaveTextContent("42.00")
})

it("identifies a missing conversion instead of blaming unspecified inputs", async () => {
  const quote = quoteModelPrice(
    plan,
    {
      purpose: PRICING_PURPOSES.TOKEN_INDEX,
      inputTokens: 32000,
      usage: { input: 1, output: 1 },
    },
    { currency: "CNY" },
  )
  render(<ModelPriceQuote quote={quote} />)
  expect(
    await screen.findByText("modelList:scenario.missingConversion"),
  ).toBeVisible()
  expect(
    screen.queryByText("modelList:scenario.missingPrice"),
  ).not.toBeInTheDocument()
})

it("shows source prices instead of claiming there are no prices when comparison is blocked", async () => {
  const quote = quoteModelPrice(
    { ...plan, groupMultiplier: PRICING_GROUP_MULTIPLIERS.PENDING },
    { purpose: PRICING_PURPOSES.TOKEN_INDEX, usage: { input: 1, output: 1 } },
  )
  render(<ModelPriceQuote quote={quote} details isLowestPrice />)
  expect(
    await screen.findByText("modelList:scenario.noComparisonPrice"),
  ).toBeVisible()
  expect(
    screen.queryByText("modelList:scenario.unavailable"),
  ).not.toBeInTheDocument()
  expect(
    screen.getAllByText("modelList:scenario.publishedPrices").length,
  ).toBeGreaterThan(0)
  expect(screen.getByText(/modelList:scenario.missingGroupRate/)).toBeVisible()
  expect(screen.getByText(/100001/)).toBeVisible()
  expect(
    screen.queryByText("modelList:scenario.lowest"),
  ).not.toBeInTheDocument()
})

it("explains a catalog placeholder without generic missing-price or settings advice", async () => {
  render(
    <ModelPriceQuote
      quote={quoteModelPrice(
        normalizeOpenRouterPricingPlan({ prompt: "-1", completion: "-1" }),
        {
          purpose: PRICING_PURPOSES.TOKEN_INDEX,
          usage: { input: 80, output: 20 },
        },
      )}
    />,
  )
  expect(
    await screen.findByText("modelList:scenario.fixedPriceUnavailable"),
  ).toBeVisible()
  expect(
    screen.queryByText("modelList:scenario.unsupportedRule"),
  ).not.toBeInTheDocument()
  expect(
    screen.queryByText("modelList:scenario.missingMeterRate"),
  ).not.toBeInTheDocument()
  expect(
    screen.queryByRole("button", { name: /scenario.configure/ }),
  ).not.toBeInTheDocument()
})
