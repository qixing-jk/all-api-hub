import userEvent from "@testing-library/user-event"
import { useState } from "react"
import { expect, it, vi } from "vitest"

import { ModelPriceQuote } from "~/features/ModelList/components/ModelItem/ModelPriceQuote"
import { PriceComparisonControls } from "~/features/ModelList/components/PriceComparisonControls"
import { PricingScenarioControls } from "~/features/ModelList/components/PricingScenarioControls"
import type { ModelPriceComparisonWeights } from "~/features/ModelList/priceComparison"
import {
  createDefaultPricingScenario,
  resolvePricingScenario,
} from "~/features/ModelList/pricingScenario"
import { PricingScenarioNavigation } from "~/features/ModelList/pricingScenarioNavigation"
import {
  PRICE_RATE_UNITS,
  PRICING_CONDITION_KINDS,
  PRICING_GROUP_MULTIPLIERS,
  PRICING_IMAGE_SIZES,
  PRICING_MEASUREMENT_AXES,
  PRICING_METERS,
  PRICING_PURPOSES,
  PRICING_RANGE_AXES,
  PRICING_SELECTION_AXES,
  PRICING_SERVICE_TIERS,
  PRICING_SOURCE_KINDS,
  PRICING_USAGE_MODES,
  PRICING_VIDEO_INPUTS,
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
  serviceTiers: [PRICING_SERVICE_TIERS.STANDARD, PRICING_SERVICE_TIERS.BATCH],
}
it("clears a rejected quantity draft even when the committed value is already empty", async () => {
  const user = userEvent.setup()
  function EmptyQuantity() {
    const [settings, onChange] = useState({
      ...createDefaultPricingScenario(),
      inputTokens: undefined as number | undefined,
    })
    return (
      <PricingScenarioControls
        settings={settings}
        onChange={onChange}
        plans={[plan]}
      />
    )
  }
  render(<EmptyQuantity />)
  await user.click(
    await screen.findByText("modelList:priceComparison.customize"),
  )
  await user.click(screen.getByText("modelList:scenario.groups.tiers"))
  const input = screen.getByRole("spinbutton", {
    name: "modelList:scenario.input",
  })
  await user.type(input, "-10")
  await user.tab()
  expect(input).toHaveValue(null)
  await user.type(input, "12")
  await user.tab()
  expect(input).toHaveValue(12)
})
it("recovers a protocol-dependent cache quote by focusing and selecting its response format", async () => {
  const user = userEvent.setup()
  const protocolPlan: PricingPlan = {
    ...plan,
    serviceTiers: undefined,
    requiresRuleMatch: true,
    rates: {},
    rules: [
      {
        id: "protocol",
        conditions: [
          {
            kind: PRICING_CONDITION_KINDS.RANGE,
            axis: PRICING_RANGE_AXES.INPUT_TOKENS,
            min: 0,
            inputTokenDeductions: {
              openai: [],
              anthropic: [PRICING_METERS.CACHE_READ],
            },
          },
        ],
        rates: { input: plan.rates.input!, cacheRead: plan.rates.input! },
      },
    ],
  }
  function ProtocolComparison() {
    const [settings, onChange] = useState(createDefaultPricingScenario)
    return (
      <PricingScenarioNavigation onConfigure={() => {}}>
        <PricingScenarioControls
          settings={settings}
          onChange={onChange}
          plans={[protocolPlan]}
        />
        <ModelPriceQuote
          quote={quoteModelPrice(
            protocolPlan,
            resolvePricingScenario(settings, {
              input: 1,
              output: null,
              cacheRead: 1,
              cacheWrite: null,
            }),
          )}
        />
      </PricingScenarioNavigation>
    )
  }
  render(<ProtocolComparison />)
  await user.click(
    await screen.findByRole("button", { name: /modelList:scenario.configure/ }),
  )
  const format = screen.getByRole("combobox", {
    name: "modelList:scenario.responseFormat",
  })
  expect(format).toHaveFocus()
  await user.click(format)
  await user.click(await screen.findByRole("option", { name: "OpenAI" }))
  expect(screen.getByText("$1.000000")).toBeVisible()
  expect(
    screen.queryByRole("button", { name: /modelList:scenario.configure/ }),
  ).not.toBeInTheDocument()
})
it("can refill image quantity after filtering from metered images to a fixed image plan", async () => {
  const user = userEvent.setup()
  const imagePlan: PricingPlan = {
    ...plan,
    serviceTiers: undefined,
    usageMode: PRICING_USAGE_MODES.IMAGE,
    rules: [],
    rates: {
      image: {
        amount: 0.2,
        currency: "USD",
        unit: PRICE_RATE_UNITS.IMAGE,
        per: 1,
      },
    },
  }
  function ImageComparison() {
    const [settings, onChange] = useState(createDefaultPricingScenario)
    const [fixed, setFixed] = useState(false)
    const current = fixed
      ? imagePlan
      : { ...imagePlan, comparison: { meter: PRICING_METERS.IMAGE } }
    return (
      <PricingScenarioNavigation onConfigure={() => {}}>
        <button onClick={() => setFixed(true)}>Only fixed images</button>
        <PricingScenarioControls
          settings={settings}
          onChange={onChange}
          plans={[current]}
        />
        <ModelPriceQuote
          quote={quoteModelPrice(
            current,
            resolvePricingScenario(settings, {
              input: 1,
              output: null,
              cacheRead: null,
              cacheWrite: null,
            }),
          )}
        />
      </PricingScenarioNavigation>
    )
  }
  render(<ImageComparison />)
  await user.click(await screen.findByText("modelList:scenario.groups.image"))
  await user.clear(
    screen.getByRole("spinbutton", { name: "modelList:scenario.outputImages" }),
  )
  await user.tab()
  await user.click(screen.getByRole("button", { name: "Only fixed images" }))
  await user.click(
    screen.getByRole("button", { name: /modelList:scenario.configure/ }),
  )
  const quantity = screen.getByRole("spinbutton", {
    name: "modelList:scenario.outputImages",
  })
  expect(quantity).toHaveFocus()
  await user.type(quantity, "2")
  await user.tab()
  expect(screen.getByText("$0.200000")).toBeVisible()
})
it("keeps effective task quantities and pricing time visible when conditions are folded", async () => {
  render(
    <PricingScenarioControls
      settings={{
        ...createDefaultPricingScenario(),
        taskUsage: { videoSeconds: 12 },
        at: "2026-09-09T04:00:00Z",
      }}
      onChange={() => {}}
      plans={[
        {
          ...plan,
          usageMode: PRICING_USAGE_MODES.METERED,
          comparison: { meter: PRICING_METERS.VIDEO_SECONDS },
          rates: {
            videoSeconds: {
              amount: 0.1,
              currency: "USD",
              unit: PRICE_RATE_UNITS.SECOND,
              per: 1,
            },
          },
          rules: [
            {
              id: "time",
              rates: {},
              conditions: [
                {
                  kind: PRICING_CONDITION_KINDS.UTC_WINDOW,
                  startMinute: 0,
                  endMinute: 1440,
                },
              ],
            },
          ],
        },
      ]}
    />,
  )
  expect(
    await screen.findByText("modelList:scenario.videoSeconds: 12"),
  ).toBeVisible()
  expect(
    screen.getByLabelText("modelList:scenario.videoSeconds"),
  ).not.toBeVisible()
  expect(screen.getByText(/modelList:scenario.pricingTime:/)).toBeVisible()
  expect(
    screen.getByLabelText("modelList:scenario.pricingTime"),
  ).not.toBeVisible()
})
it("focuses cache weights without changing the workload when the tier cache basis is unknown", async () => {
  const user = userEvent.setup()
  const cachePlan: PricingPlan = {
    ...plan,
    rules: [
      {
        ...plan.rules[0],
        conditions: [
          {
            kind: PRICING_CONDITION_KINDS.RANGE,
            axis: PRICING_RANGE_AXES.INPUT_TOKENS_CACHE_BASIS_UNKNOWN,
            min: 0,
          },
        ],
      },
    ],
  }
  function CacheComparison() {
    const [settings, onChange] = useState(createDefaultPricingScenario)
    const [weights, setWeights] = useState<ModelPriceComparisonWeights>({
      input: 1,
      output: 1,
      cacheRead: 2,
      cacheWrite: 3,
    })
    return (
      <PricingScenarioNavigation onConfigure={() => {}}>
        <PricingScenarioControls
          settings={settings}
          onChange={onChange}
          plans={[cachePlan]}
        >
          {(conditions, summary) => (
            <PriceComparisonControls
              embedded
              conditionFields={conditions}
              conditionSummary={summary}
              presetId="custom"
              onPresetIdChange={() => {}}
              weights={weights}
              onWeightsChange={setWeights}
            />
          )}
        </PricingScenarioControls>
        <ModelPriceQuote
          quote={quoteModelPrice(
            cachePlan,
            resolvePricingScenario(settings, weights),
          )}
        />
      </PricingScenarioNavigation>
    )
  }
  render(<CacheComparison />)
  await user.click(
    await screen.findByRole("button", { name: /modelList:scenario.configure/ }),
  )
  const cacheRead = screen.getByRole("spinbutton", {
    name: "modelList:priceComparison.weights.cacheRead",
  })
  expect(cacheRead).toHaveFocus()
  expect(cacheRead).toHaveValue(2)
  expect(
    screen.getByRole("spinbutton", {
      name: "modelList:priceComparison.weights.cacheWrite",
    }),
  ).toHaveValue(3)
})
it("hides reference lengths for flat pricing even when a model has capacity limits", async () => {
  render(
    <PricingScenarioControls
      settings={createDefaultPricingScenario()}
      onChange={vi.fn()}
      plans={[
        {
          ...plan,
          rules: [],
          limits: { totalTokens: 8192, outputTokens: 4096 },
          serviceTiers: undefined,
        },
      ]}
    />,
  )
  await screen.findByText("modelList:scenario.tokenIndex")
  expect(
    screen.queryByLabelText("modelList:scenario.input"),
  ).not.toBeInTheDocument()
  expect(
    screen.queryByLabelText("modelList:scenario.output"),
  ).not.toBeInTheDocument()
})

it("shows only the length axis used by a pricing tier", async () => {
  render(
    <PricingScenarioControls
      settings={createDefaultPricingScenario()}
      onChange={vi.fn()}
      plans={[plan]}
    />,
  )
  await screen.findByLabelText("modelList:scenario.input")
  expect(
    screen.queryByLabelText("modelList:scenario.output"),
  ).not.toBeInTheDocument()
})
it("shares one resolution option and quote across provider notation variants", async () => {
  const user = userEvent.setup()
  const plans: PricingPlan[] = ["720P", "720p"].map((value) => ({
    rates: {},
    rules: [
      {
        id: "video",
        conditions: [
          {
            kind: PRICING_CONDITION_KINDS.SELECTION,
            axis: PRICING_SELECTION_AXES.VIDEO_QUALITY,
            value,
          },
        ],
        rates: {
          videoSeconds: {
            amount: 0.1,
            currency: "USD",
            unit: PRICE_RATE_UNITS.SECOND,
            per: 1,
          },
        },
      },
    ],
    comparison: { meter: PRICING_METERS.VIDEO_SECONDS },
    usageMode: PRICING_USAGE_MODES.METERED,
    requiresRuleMatch: true,
    source: { kind: "account" },
    groupMultiplier: PRICING_GROUP_MULTIPLIERS.INCLUDED,
    issues: [],
  }))
  function Comparison() {
    const [settings, onChange] = useState({
      ...createDefaultPricingScenario(),
      videoQuality: "720P",
    })
    return (
      <>
        <PricingScenarioControls
          plans={plans}
          settings={settings}
          onChange={(next) =>
            onChange({ ...next, videoQuality: next.videoQuality ?? "" })
          }
        />
        {plans.map((plan, index) => (
          <output key={index}>
            {
              quoteModelPrice(plan, {
                ...settings,
                usage: { input: 80, output: 20 },
              }).status
            }
          </output>
        ))}
      </>
    )
  }
  render(<Comparison />)
  expect(await screen.findAllByText("complete")).toHaveLength(2)
  await user.click(screen.getByText("modelList:scenario.groups.video"))
  const selector = screen.getByRole("combobox", {
    name: "modelList:scenario.videoQuality",
  })
  expect(selector).toHaveTextContent("720p")
  await user.click(selector)
  expect(screen.getAllByRole("option", { name: /^720p$/i })).toHaveLength(1)
  await user.click(
    screen.getByRole("option", { name: "modelList:scenario.unspecified" }),
  )
  expect(screen.getAllByText("unavailable")).toHaveLength(2)
  await user.click(selector)
  await user.click(screen.getByRole("option", { name: "720p" }))
  expect(screen.getAllByText("complete")).toHaveLength(2)
})
it("recovers missing image area with a dimension preset and recalculates task allowances", async () => {
  const imagePlan: PricingPlan = {
    usageMode: PRICING_USAGE_MODES.IMAGE,
    comparison: { meter: PRICING_METERS.IMAGE },
    rates: {
      referenceImage: {
        amount: 0.01,
        currency: "USD",
        unit: PRICE_RATE_UNITS.IMAGE,
        per: 1,
        freeQuantity: 3,
      },
    },
    rules: [
      {
        id: "small",
        conditions: [
          {
            kind: PRICING_CONDITION_KINDS.MEASUREMENT,
            axis: PRICING_MEASUREMENT_AXES.IMAGE_MEGAPIXELS,
            lte: 2.36,
          },
        ],
        rates: {
          image: {
            amount: 0.05,
            currency: "USD",
            unit: PRICE_RATE_UNITS.IMAGE,
            per: 1,
          },
        },
      },
    ],
    source: { kind: PRICING_SOURCE_KINDS.CATALOG },
    groupMultiplier: PRICING_GROUP_MULTIPLIERS.INCLUDED,
    issues: [],
    requiresRuleMatch: true,
  }
  function TaskComparison() {
    const [settings, onChange] = useState(createDefaultPricingScenario)
    const [visible, setVisible] = useState(false)
    return (
      <PricingScenarioNavigation onConfigure={() => setVisible(true)}>
        {visible && (
          <PricingScenarioControls
            settings={settings}
            onChange={onChange}
            plans={[imagePlan]}
          />
        )}
        <ModelPriceQuote
          quote={quoteModelPrice(
            imagePlan,
            resolvePricingScenario(settings, {
              input: 1,
              output: 1,
              cacheRead: 0,
              cacheWrite: 0,
            }),
          )}
        />
      </PricingScenarioNavigation>
    )
  }
  const user = userEvent.setup()
  render(<TaskComparison />)
  await user.click(
    await screen.findByRole("button", {
      name: "modelList:scenario.configure · modelList:scenario.imageMegapixels",
    }),
  )
  expect(
    await screen.findByRole("spinbutton", {
      name: "modelList:scenario.imageMegapixels",
    }),
  ).toHaveFocus()
  await user.click(screen.getByRole("button", { name: "1536 × 1536" }))
  expect(await screen.findByText("$0.050000")).toBeVisible()
  const references = screen.getByRole("spinbutton", {
    name: "modelList:scenario.referenceImages",
  })
  await user.clear(references)
  await user.type(references, "5")
  await user.tab()
  expect(await screen.findByText("$0.070000")).toBeVisible()
  const outputs = screen.getByRole("spinbutton", {
    name: "modelList:scenario.outputImages",
  })
  await user.clear(outputs)
  await user.type(outputs, "2")
  await user.tab()
  expect(await screen.findByText("$0.060000")).toBeVisible()
  expect(
    screen.queryByRole("spinbutton", { name: "modelList:scenario.input" }),
  ).not.toBeInTheDocument()
})
it("derives video reference controls from the pricing rules and shows video output prices", async () => {
  const videoPlan: PricingPlan = {
    rates: {},
    usageMode: PRICING_USAGE_MODES.VIDEO,
    groupMultiplier: PRICING_GROUP_MULTIPLIERS.INCLUDED,
    source: { kind: PRICING_SOURCE_KINDS.ACCOUNT },
    issues: [],
    requiresRuleMatch: true,
    rules: [
      {
        id: "reference",
        conditions: [
          {
            kind: PRICING_CONDITION_KINDS.SELECTION,
            axis: PRICING_SELECTION_AXES.VIDEO_INPUT,
            value: PRICING_VIDEO_INPUTS.WITH_VIDEO,
          },
        ],
        rates: {
          videoOutput: {
            amount: 6,
            currency: "USD",
            unit: PRICE_RATE_UNITS.TOKEN,
            per: TOKENS_PER_MILLION,
          },
        },
      },
    ],
  }
  function VideoComparison() {
    const [settings, onChange] = useState(createDefaultPricingScenario)
    return (
      <>
        <PricingScenarioControls
          settings={settings}
          onChange={onChange}
          plans={[videoPlan]}
        />
        <ModelPriceQuote
          quote={quoteModelPrice(
            videoPlan,
            resolvePricingScenario(settings, {
              input: 80,
              output: 20,
              cacheRead: 0,
              cacheWrite: 0,
            }),
          )}
        />
      </>
    )
  }
  render(<VideoComparison />)
  const user = userEvent.setup()
  await user.click(await screen.findByText("modelList:scenario.groups.video"))
  await user.click(
    await screen.findByRole("combobox", {
      name: "modelList:scenario.videoInput",
    }),
  )
  await user.click(
    await screen.findByRole("option", { name: "modelList:scenario.withVideo" }),
  )
  expect(await screen.findByText("$6.000000")).toBeVisible()
  expect(
    screen.queryByText("modelList:scenario.calculationHint"),
  ).not.toBeInTheDocument()
  expect(
    screen.getByText(/modelList:scenario.perMillionVideoTokens/),
  ).toBeVisible()
})
it("selects image size and displays a per-image quote without token weights", async () => {
  const imagePlan: PricingPlan = {
    usageMode: PRICING_USAGE_MODES.IMAGE,
    rates: {},
    groupMultiplier: PRICING_GROUP_MULTIPLIERS.INCLUDED,
    source: { kind: PRICING_SOURCE_KINDS.ACCOUNT },
    issues: [],
    requiresRuleMatch: true,
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
  }
  function ImageComparison() {
    const [settings, onChange] = useState(createDefaultPricingScenario)
    return (
      <>
        <PricingScenarioControls
          settings={settings}
          onChange={onChange}
          plans={[imagePlan]}
        />
        <ModelPriceQuote
          quote={quoteModelPrice(
            imagePlan,
            resolvePricingScenario(settings, {
              input: 80,
              output: 20,
              cacheRead: 0,
              cacheWrite: 0,
            }),
          )}
        />
      </>
    )
  }
  render(<ImageComparison />)
  const user = userEvent.setup()
  await user.click(await screen.findByText("modelList:scenario.groups.image"))
  await user.click(
    await screen.findByRole("combobox", {
      name: "modelList:scenario.imageSize",
    }),
  )
  await user.click(await screen.findByRole("option", { name: "2K" }))
  expect(await screen.findByText("$0.200000")).toBeVisible()
  expect(screen.getByText("modelList:scenario.imagePrice")).toBeVisible()
  expect(
    screen.queryByText("modelList:scenario.calculationHint"),
  ).not.toBeInTheDocument()
  expect(
    screen.queryByLabelText("modelList:scenario.input"),
  ).not.toBeInTheDocument()
})

it("opens hidden comparison controls and focuses the missing image size from its quote", async () => {
  const imagePlan: PricingPlan = {
    usageMode: PRICING_USAGE_MODES.IMAGE,
    rates: {},
    groupMultiplier: PRICING_GROUP_MULTIPLIERS.INCLUDED,
    source: { kind: PRICING_SOURCE_KINDS.ACCOUNT },
    issues: [],
    requiresRuleMatch: true,
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
  }
  function Recovery() {
    const [settings, onChange] = useState(createDefaultPricingScenario)
    const [visible, setVisible] = useState(false)
    return (
      <PricingScenarioNavigation onConfigure={() => setVisible(true)}>
        {visible && (
          <PricingScenarioControls
            settings={settings}
            onChange={onChange}
            plans={[plan, imagePlan]}
          />
        )}
        <ModelPriceQuote
          quote={quoteModelPrice(
            imagePlan,
            resolvePricingScenario(settings, {
              input: 1,
              output: 1,
              cacheRead: 0,
              cacheWrite: 0,
            }),
          )}
        />
      </PricingScenarioNavigation>
    )
  }
  render(<Recovery />)
  const user = userEvent.setup()
  const initialUrl = window.location.href
  await user.click(
    await screen.findByRole("button", {
      name: "modelList:scenario.configure · modelList:scenario.imageSize",
    }),
  )
  const size = await screen.findByRole("combobox", {
    name: "modelList:scenario.imageSize",
  })
  expect(size).toBeVisible()
  expect(size).toHaveFocus()
  expect(window.location.href).toBe(initialUrl)
  await user.click(size)
  await user.click(await screen.findByRole("option", { name: "2K" }))
  expect(await screen.findByText("$0.200000")).toBeVisible()
  expect(
    screen.queryByRole("button", { name: /modelList:scenario.configure/ }),
  ).not.toBeInTheDocument()
})

const timePlan: PricingPlan = {
  ...plan,
  rules: [
    {
      id: "off-peak",
      conditions: [
        {
          kind: PRICING_CONDITION_KINDS.UTC_WINDOW,
          startMinute: 0,
          endMinute: 360,
        },
      ],
      rates: {
        input: {
          amount: 0.5,
          currency: "USD",
          unit: PRICE_RATE_UNITS.TOKEN,
          per: TOKENS_PER_MILLION,
        },
      },
    },
  ],
}
function Comparison() {
  const [settings, setSettings] = useState(createDefaultPricingScenario)
  const [weights, setWeights] = useState<ModelPriceComparisonWeights>({
    input: 1,
    output: 1,
    cacheRead: null,
    cacheWrite: null,
  })
  return (
    <PricingScenarioNavigation onConfigure={() => {}}>
      <PricingScenarioControls
        settings={settings}
        onChange={setSettings}
        plans={[plan]}
      >
        {(conditions, summary) => (
          <PriceComparisonControls
            embedded
            presetId="custom"
            onPresetIdChange={() => {}}
            weights={weights}
            onWeightsChange={setWeights}
            conditionFields={conditions}
            conditionSummary={summary}
          />
        )}
      </PricingScenarioControls>
      <ModelPriceQuote
        quote={quoteModelPrice(plan, resolvePricingScenario(settings, weights))}
      />
    </PricingScenarioNavigation>
  )
}
it("starts with a usable comparison and reveals only the selected condition group", async () => {
  const user = userEvent.setup()
  render(<Comparison />)
  expect(await screen.findByText("$1.500000")).toBeVisible()
  expect(
    screen.getByRole("heading", { name: "modelList:scenario.tokenIndex" }),
  ).toBeVisible()
  expect(
    screen.queryByText("modelList:scenario.request"),
  ).not.toBeInTheDocument()
  expect(screen.getByLabelText("modelList:scenario.input")).not.toBeVisible()
  await user.click(screen.getByText("modelList:priceComparison.customize"))
  expect(screen.getByLabelText("modelList:scenario.input")).not.toBeVisible()
  expect(
    screen.getByLabelText("modelList:scenario.serviceTier"),
  ).not.toBeVisible()
  await user.click(screen.getByText("modelList:scenario.groups.tiers"))
  expect(screen.getByLabelText("modelList:scenario.input")).toBeVisible()
  expect(
    screen.getByLabelText("modelList:scenario.serviceTier"),
  ).not.toBeVisible()
  await user.click(screen.getByText("modelList:scenario.groups.other"))
  expect(screen.getByLabelText("modelList:scenario.serviceTier")).toBeVisible()
})
it("updates the same comparison and active tier when the representative length changes", async () => {
  const user = userEvent.setup()
  render(<Comparison />)
  await user.click(
    await screen.findByText("modelList:priceComparison.customize"),
  )
  await user.click(screen.getByText("modelList:scenario.groups.tiers"))
  const input = screen.getByLabelText("modelList:scenario.input")
  await user.clear(input)
  await user.type(input, "100001")
  await user.tab()
  expect(screen.getByText("$2.500000")).toBeVisible()
  expect(screen.getByText(/modelList:scenario.currentTier/)).toBeVisible()
  expect(screen.getAllByText("50%")).toHaveLength(2)
})
it("keeps available output costs and source prices when a tier length is missing", async () => {
  const user = userEvent.setup()
  render(<Comparison />)
  await user.click(
    await screen.findByText("modelList:priceComparison.customize"),
  )
  await user.click(screen.getByText("modelList:scenario.groups.tiers"))
  await user.clear(screen.getByLabelText("modelList:scenario.input"))
  await user.tab()
  expect(screen.getByText("$1.000000")).toBeVisible()
  expect(screen.getByText("modelList:scenario.knownPrice")).toBeVisible()
  expect(screen.getByText("modelList:scenario.publishedPrices")).toBeVisible()
})
it("reopens the missing tier condition locally without exposing unrelated settings", async () => {
  const user = userEvent.setup()
  render(<Comparison />)
  await user.click(
    await screen.findByText("modelList:priceComparison.customize"),
  )
  await user.click(screen.getByText("modelList:scenario.groups.tiers"))
  await user.clear(screen.getByLabelText("modelList:scenario.input"))
  await user.tab()
  await user.click(screen.getByText("modelList:priceComparison.customize"))
  const controls = screen.getByRole("region", {
    name: "modelList:scenario.configure",
  })
  controls.scrollIntoView = vi.fn()
  const oldUrl = window.location.href
  await user.click(
    screen.getByRole("button", {
      name: "modelList:scenario.configure · modelList:scenario.input",
    }),
  )
  expect(window.location.href).toBe(oldUrl)
  expect(screen.getByLabelText("modelList:scenario.input")).toHaveFocus()
  expect(screen.getByLabelText("modelList:scenario.input")).toBeVisible()
  expect(
    screen.getByLabelText("modelList:scenario.serviceTier"),
  ).not.toBeVisible()
})
it("omits conditions that no listed model uses", async () => {
  render(
    <PricingScenarioControls
      settings={createDefaultPricingScenario()}
      onChange={() => {}}
      plans={[]}
    >
      {() => <p>Preset comparison</p>}
    </PricingScenarioControls>,
  )
  expect(await screen.findByText("Preset comparison")).toBeVisible()
  expect(
    screen.queryByLabelText("modelList:scenario.input"),
  ).not.toBeInTheDocument()
  expect(
    screen.queryByLabelText("modelList:scenario.serviceTier"),
  ).not.toBeInTheDocument()
})

it("lets people choose the time used by time-based price rules", async () => {
  const onChange = vi.fn()
  render(
    <PricingScenarioControls
      settings={{
        ...createDefaultPricingScenario(),
        at: "2026-09-09T04:00:00.000Z",
      }}
      onChange={onChange}
      plans={[timePlan]}
    >
      {(conditions) => conditions}
    </PricingScenarioControls>,
  )

  await userEvent
    .setup()
    .click(await screen.findByText("modelList:scenario.groups.other"))
  expect(
    await screen.findByText("modelList:scenario.pricingTimeEffect"),
  ).toBeVisible()
  const input = screen.getByLabelText("modelList:scenario.pricingTime")
  fireEvent.change(input, { target: { value: "2026-09-10T08:30" } })
  fireEvent.blur(input)

  expect(onChange).toHaveBeenCalledWith(
    expect.objectContaining({
      at: new Date("2026-09-10T08:30").toISOString(),
    }),
  )
  expect(
    screen.queryByText("modelList:scenario.updateTime"),
  ).not.toBeInTheDocument()
})

it("navigates to missing image quality, highlights it and quotes the selected tier", async () => {
  const qualityPlan: PricingPlan = {
    rates: {},
    usageMode: PRICING_USAGE_MODES.IMAGE,
    requiresRuleMatch: true,
    rules: [
      {
        id: "quality",
        conditions: [
          {
            kind: PRICING_CONDITION_KINDS.SELECTION,
            axis: PRICING_SELECTION_AXES.IMAGE_QUALITY,
            value: "Quality",
          },
        ],
        rates: {
          image: {
            amount: 0.09,
            currency: "USD",
            unit: PRICE_RATE_UNITS.IMAGE,
            per: 1,
          },
        },
      },
    ],
    source: { kind: PRICING_SOURCE_KINDS.CATALOG },
    groupMultiplier: PRICING_GROUP_MULTIPLIERS.INCLUDED,
    issues: [],
  }
  function Comparison() {
    const [settings, onChange] = useState(createDefaultPricingScenario)
    const [visible, setVisible] = useState(false)
    return (
      <PricingScenarioNavigation onConfigure={() => setVisible(true)}>
        {visible && (
          <PricingScenarioControls
            settings={settings}
            onChange={onChange}
            plans={[qualityPlan]}
          />
        )}
        <ModelPriceQuote
          quote={quoteModelPrice(qualityPlan, {
            ...settings,
            purpose: PRICING_PURPOSES.TOKEN_INDEX,
            usage: {},
          })}
        />
      </PricingScenarioNavigation>
    )
  }
  const user = userEvent.setup()
  render(<Comparison />)
  await user.click(
    await screen.findByRole("button", {
      name: "modelList:scenario.configure · modelList:scenario.imageQuality",
    }),
  )
  const selector = await screen.findByRole("combobox", {
    name: "modelList:scenario.imageQuality",
  })
  expect(selector).toHaveFocus()
  expect(selector).toHaveAttribute("data-pricing-highlight", "true")
  await user.click(selector)
  await user.click(await screen.findByRole("option", { name: "Quality" }))
  expect(await screen.findByText("$0.090000")).toBeVisible()
})

it.each(["pages", PRICING_METERS.OUTPUT_MEGAPIXELS] as const)(
  "recovers a cleared %s quantity through diagnostics",
  async (meter) => {
    const measuredPlan: PricingPlan = {
      rates: {
        [meter]: {
          amount: 0.025,
          currency: "USD",
          unit:
            meter === PRICING_METERS.PAGES
              ? PRICE_RATE_UNITS.PAGE
              : PRICE_RATE_UNITS.MEGAPIXEL,
          per: 1,
        },
      },
      comparison: { meter },
      usageMode: PRICING_USAGE_MODES.METERED,
      rules: [],
      source: { kind: PRICING_SOURCE_KINDS.CATALOG },
      groupMultiplier: PRICING_GROUP_MULTIPLIERS.INCLUDED,
      issues: [],
    }
    function Comparison() {
      const [settings, onChange] = useState(createDefaultPricingScenario)
      return (
        <PricingScenarioNavigation onConfigure={() => {}}>
          <PricingScenarioControls
            settings={settings}
            onChange={onChange}
            plans={[measuredPlan]}
          />
          <ModelPriceQuote
            quote={quoteModelPrice(measuredPlan, {
              ...settings,
              purpose: PRICING_PURPOSES.TOKEN_INDEX,
              usage: {},
            })}
          />
        </PricingScenarioNavigation>
      )
    }
    const user = userEvent.setup()
    render(<Comparison />)
    const groupLabel =
      meter === PRICING_METERS.PAGES
        ? "modelList:scenario.groups.other"
        : "modelList:scenario.groups.image"
    await user.click(await screen.findByText(groupLabel))
    const input = await screen.findByRole("spinbutton", {
      name: `modelList:scenario.${meter}`,
    })
    expect(input).toHaveValue(1)
    await user.clear(input)
    await user.tab()
    await user.click(screen.getByText(groupLabel))
    expect(input).not.toBeVisible()
    await user.click(
      await screen.findByRole("button", {
        name: `modelList:scenario.configure · modelList:scenario.${meter}`,
      }),
    )
    expect(input).toHaveFocus()
    expect(input).toHaveAttribute("data-pricing-highlight", "true")
    await user.type(input, meter === PRICING_METERS.PAGES ? "3" : "2.5")
    await user.tab()
    expect(await screen.findByText("$0.025000")).toBeVisible()
    expect(input).toHaveValue(meter === "pages" ? 3 : 2.5)
  },
)
