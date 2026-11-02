import { render as rtlRender, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import type { ReactElement } from "react"
import { VirtuosoMockContext } from "react-virtuoso"
import { beforeEach, expect, it, vi } from "vitest"

import { createProfileSource } from "~/features/ModelList/catalog/modelManagementSources"
import { PricingDiagnostics } from "~/features/ModelList/pricing/PricingDiagnosticsPanel"
import toast from "~/lib/notify"
import {
  PRICE_RATE_UNITS,
  PRICING_GROUP_MULTIPLIERS,
  PRICING_IMAGE_SIZES,
  PRICING_ISSUE_CODES,
  PRICING_PURPOSES,
  PRICING_SELECTION_AXES,
  PRICING_SOURCE_KINDS,
  TOKENS_PER_MILLION,
} from "~/services/modelPricing/pricingConstants"
import { quoteModelPrice } from "~/services/modelPricing/quoteModelPrice"
import { atIndex } from "~~/tests/test-utils/indexedAccess"

const render = (ui: ReactElement) =>
  rtlRender(
    <VirtuosoMockContext.Provider
      value={{ viewportHeight: 384, itemHeight: 76 }}
    >
      {ui}
    </VirtuosoMockContext.Provider>,
  )

vi.mock("~/lib/notify", () => ({
  default: { success: vi.fn(), error: vi.fn() },
}))

const mode = vi.hoisted(() => ({ development: true }))
vi.mock("~/utils/core/environment", async (importOriginal) => ({
  ...(await importOriginal<typeof import("~/utils/core/environment")>()),
  isDevelopmentMode: () => mode.development,
}))
vi.mock("react-i18next", async (importOriginal) => ({
  ...(await importOriginal<typeof import("react-i18next")>()),
  useTranslation: () => ({ t: (key: string) => key, i18n: { language: "en" } }),
}))
const source = createProfileSource({
  id: "profile",
  name: "Example",
  apiType: "openai-compatible",
  baseUrl: "https://example.com",
  apiKey: "DO_NOT_EXPORT",
  tagIds: [],
  notes: "",
  createdAt: 0,
  updatedAt: 0,
})
const models = ["complete", "missing"].map((name) => ({
  model: {
    model_name: name,
    quota_type: 0,
    model_ratio: 1,
    model_price: 0,
    completion_ratio: 1,
    enable_groups: [],
    supported_endpoint_types: [],
  },
  source,
  calculatedPrice: {
    kind: "token" as const,
    usdPerMillionTokens: { input: 1, output: 0 },
    quote: quoteModelPrice(
      {
        rates: {
          input: {
            amount: 1,
            currency: "USD",
            unit: PRICE_RATE_UNITS.TOKEN,
            per: TOKENS_PER_MILLION,
          },
        },
        rules: [],
        groupMultiplier: PRICING_GROUP_MULTIPLIERS.INCLUDED,
        source: { kind: PRICING_SOURCE_KINDS.ACCOUNT },
        issues: [],
      },
      {
        purpose: PRICING_PURPOSES.TOKEN_INDEX,
        usage: { input: 1, output: name === "missing" ? 1 : 0 },
      },
    ),
  },
}))
beforeEach(() => {
  vi.clearAllMocks()
  mode.development = true
})

it("explains threshold selection separately from conflicting prices and preserves diagnostic codes for export", async () => {
  const user = userEvent.setup()
  const copy = vi
    .spyOn(navigator.clipboard, "writeText")
    .mockResolvedValue(undefined)
  const examples = [
    [
      "threshold",
      "threshold-basis-unverified",
      "diagnostics.issueLabels.thresholdBasisUnverified",
    ],
    ["conflict", "source-conflict", "diagnostics.issueLabels.sourceConflict"],
  ] as const
  render(
    <PricingDiagnostics
      models={examples.map(([name, reason]) => ({
        ...models[1]!,
        model: {
          ...models[1]!.model,
          model_name: name,
          pricingPlan: {
            rates: {},
            rules: [],
            groupMultiplier: "included",
            source: { kind: "catalog", rulesUnavailable: true },
            issues: [{ code: "unverified-axis", reason }],
          },
        },
      }))}
      onLocate={vi.fn()}
    />,
  )
  await user.click(screen.getByRole("button", { name: /diagnostics.title/ }))
  for (const [name, reason, label] of examples) {
    await user.click(
      screen.getByRole("button", { name: `diagnostics.inspect: ${name}` }),
    )
    expect(screen.getByRole("dialog")).toHaveTextContent(label)
    expect(screen.getByRole("dialog")).toHaveTextContent(
      `unsupported:${reason}`,
    )
    await user.click(
      screen.getByRole("button", { name: "diagnostics.copyRecord" }),
    )
    expect(JSON.parse(copy.mock.lastCall![0]).rows[0].issues).toContainEqual({
      code: `unsupported:${reason}`,
    })
    await user.keyboard("{Escape}")
  }
})

it("inspects published prices from the attention shortcut and locates from the record", async () => {
  const user = userEvent.setup()
  const locate = vi.fn()
  render(
    <PricingDiagnostics
      models={[
        {
          ...models[1]!,
          model: {
            ...models[1]!.model,
            pricingPlan: {
              rates: {},
              rules: [],
              source: { kind: "catalog" },
              groupMultiplier: "included",
              issues: [
                { code: "unsupported-rule", reason: "request-condition" },
              ],
            },
          },
          calculatedPrice: {
            ...models[1]!.calculatedPrice,
            quote: undefined,
            publishedPricing: {
              source: { kind: "catalog", rulesUnavailable: true },
              schedule: [
                {
                  id: "base",
                  conditions: [],
                  rates: {
                    input: {
                      amount: 1,
                      currency: "USD",
                      unit: "token",
                      per: 1000000,
                    },
                  },
                },
              ],
            },
          },
        },
        {
          ...models[1]!,
          effectiveGroup: "premium",
          model: { ...models[1]!.model, model_name: "other" },
        },
      ]}
      onLocate={locate}
    />,
  )
  await user.click(
    screen.getByRole("button", { name: "diagnostics.attention" }),
  )
  await user.click(
    screen.getByRole("combobox", { name: "diagnostics.groupBy" }),
  )
  await user.click(
    await screen.findByRole("option", { name: "diagnostics.byGroup" }),
  )
  const group = screen.getByRole("button", { name: /diagnostics.noGroup/ })
  await user.click(group)
  expect(group).toHaveAttribute("aria-pressed", "true")
  await user.click(group)
  expect(group).toHaveAttribute("aria-pressed", "false")
  await user.click(
    screen.getByRole("button", { name: "diagnostics.inspect: missing" }),
  )
  expect(screen.getByRole("dialog")).toHaveTextContent("scenario.baseRates")
  await user.click(
    screen.getAllByRole("button", { name: "diagnostics.locate" }).at(-1)!,
  )
  expect(locate).toHaveBeenCalledWith("missing")
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument()
})

it("shows the official name while locating by the exact request id", async () => {
  const user = userEvent.setup()
  const locate = vi.fn()
  render(
    <PricingDiagnostics
      models={[
        {
          ...models[1]!,
          model: {
            ...models[1]!.model,
            display_name: "Claude Haiku 5.5",
            model_name: "anthropic/claude-haiku-5-5",
          },
        },
      ]}
      onLocate={locate}
    />,
  )
  await user.click(screen.getByRole("button", { name: /diagnostics.title/ }))
  expect(screen.getByText("Claude Haiku 5.5")).toBeVisible()
  await user.click(screen.getByRole("button", { name: "diagnostics.locate" }))
  expect(locate).toHaveBeenCalledWith("anthropic/claude-haiku-5-5")
})

it("recovers an active issue filter when refreshed models no longer contain that issue", async () => {
  const user = userEvent.setup()
  const view = render(<PricingDiagnostics models={models} onLocate={vi.fn()} />)
  await user.click(screen.getByRole("button", { name: /diagnostics.title/ }))
  await user.click(screen.getByRole("combobox", { name: "diagnostics.filter" }))
  await user.click(await screen.findByRole("option", { name: /price-missing/ }))
  expect(screen.getByText("missing", { selector: "strong" })).toBeVisible()
  expect(
    screen.queryByText("complete", { selector: "strong" }),
  ).not.toBeInTheDocument()
  view.rerender(
    <VirtuosoMockContext.Provider
      value={{ viewportHeight: 384, itemHeight: 76 }}
    >
      <PricingDiagnostics models={[models[0]!]} onLocate={vi.fn()} />
    </VirtuosoMockContext.Provider>,
  )
  expect(screen.getByText("diagnostics.empty")).toBeVisible()
  expect(
    screen.getByRole("combobox", { name: "diagnostics.filter" }),
  ).toHaveTextContent("diagnostics.issues")
})

it("shows coverage before opening and opens a bounded scrolling list with on-demand record details", async () => {
  const user = userEvent.setup()
  render(
    <PricingDiagnostics
      models={Array.from({ length: 25 }, (_, index) => ({
        ...models[1]!,
        model: { ...models[1]!.model, model_name: `model-${index}` },
      }))}
      onLocate={vi.fn()}
    />,
  )
  expect(screen.getByText("diagnostics.overview")).toBeVisible()
  expect(screen.queryByText("model-0")).not.toBeInTheDocument()
  await user.click(screen.getByRole("button", { name: /diagnostics.title/ }))
  expect(
    screen.getByRole("region", { name: "diagnostics.results" }),
  ).toBeVisible()
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument()
  await user.click(
    screen.getByRole("button", { name: /diagnostics.inspect: model-0$/ }),
  )
  expect(screen.getByRole("dialog")).toBeVisible()
  expect(screen.getByRole("heading", { name: "model-0" })).toBeVisible()
})

it("inspects and copies the selected account when visible source labels are identical", async () => {
  const user = userEvent.setup()
  const copy = vi
    .spyOn(navigator.clipboard, "writeText")
    .mockResolvedValue(undefined)
  const first = models[1]!
  const second = {
    ...first,
    source: { ...source, profile: { ...source.profile, id: "second-source" } },
    calculatedPrice: {
      ...first.calculatedPrice,
      quote: { ...first.calculatedPrice.quote, amount: 99 },
    },
  }
  render(<PricingDiagnostics models={[first, second]} onLocate={vi.fn()} />)
  await user.click(screen.getByRole("button", { name: /diagnostics.title/ }))
  await user.click(
    screen.getAllByRole("button", { name: "diagnostics.inspect: missing" })[1]!,
  )
  await user.click(
    screen.getByRole("button", { name: "diagnostics.copyRecord" }),
  )
  expect(JSON.parse(copy.mock.calls[0]![0]).rows[0].quote.amount).toBe(99)
  expect(copy.mock.calls[0]![0]).not.toContain("DO_NOT_EXPORT")
  expect(toast.success).toHaveBeenCalledWith("diagnostics.copied")
  expect(screen.queryByText("diagnostics.copied")).not.toBeInTheDocument()
})

it("is hidden outside development mode", () => {
  mode.development = false
  render(<PricingDiagnostics models={models} onLocate={vi.fn()} />)
  expect(screen.queryByRole("button")).not.toBeInTheDocument()
})

it("opens a scoped issue report, locates a model and copies an allowlisted snapshot", async () => {
  const user = userEvent.setup()
  const copy = vi
    .spyOn(navigator.clipboard, "writeText")
    .mockResolvedValue(undefined)
  const locate = vi.fn()
  render(<PricingDiagnostics models={models} onLocate={locate} />)
  expect(screen.queryByText("missing")).not.toBeInTheDocument()
  await user.click(screen.getByRole("button", { name: /diagnostics.title/ }))
  expect(screen.getByText("missing")).toBeVisible()
  expect(screen.getByText("complete", { selector: "strong" })).toBeVisible()
  await user.click(screen.getByRole("combobox", { name: "diagnostics.filter" }))
  await user.click(
    await screen.findByRole("option", { name: "diagnostics.all" }),
  )
  expect(screen.getByText("complete", { selector: "strong" })).toBeVisible()
  await user.type(
    screen.getByRole("textbox", { name: "diagnostics.search" }),
    "missing",
  )
  expect(screen.queryByText("complete")).not.toBeInTheDocument()
  await user.click(screen.getByRole("button", { name: "diagnostics.locate" }))
  expect(locate).toHaveBeenCalledWith("missing")
  await user.click(screen.getByRole("button", { name: "diagnostics.copy" }))
  const report = JSON.parse(atIndex(copy.mock.calls, 0)[0])
  expect(report.rows).toHaveLength(2)
  expect(atIndex(copy.mock.calls, 0)[0]).not.toContain("DO_NOT_EXPORT")
  expect(toast.success).toHaveBeenCalledWith("diagnostics.copied")
  expect(screen.queryByText("diagnostics.copied")).not.toBeInTheDocument()
})

it("shows an actionable selection explanation next to the diagnostic code", async () => {
  const user = userEvent.setup()
  const model = {
    ...atIndex(models, 1),
    calculatedPrice: {
      ...atIndex(models, 1).calculatedPrice,
      quote: {
        ...atIndex(models, 1).calculatedPrice.quote,
        issues: [{ code: PRICING_ISSUE_CODES.PRICE_RANGE_UNAVAILABLE }],
        conditionDetails: [
          {
            axis: PRICING_SELECTION_AXES.VIDEO_QUALITY,
            selected: PRICING_IMAGE_SIZES.K4,
            available: ["720p", "1080p"],
          },
        ],
      },
    },
  }
  render(<PricingDiagnostics models={[model]} onLocate={vi.fn()} />)
  await user.click(screen.getByRole("button", { name: /diagnostics.title/ }))
  await user.click(
    screen.getByRole("button", { name: "diagnostics.inspect: missing" }),
  )
  expect(screen.getByText("scenario.selectionUnavailable")).toBeVisible()
  expect(
    screen.getByText(PRICING_ISSUE_CODES.PRICE_RANGE_UNAVAILABLE, {
      selector: "code",
    }),
  ).toBeVisible()
})

it("limits rendered entries and reports clipboard failures", async () => {
  const user = userEvent.setup()
  vi.spyOn(navigator.clipboard, "writeText").mockRejectedValue(
    new Error("Denied"),
  )
  const manyModels = Array.from({ length: 55 }, (_, index) => ({
    ...atIndex(models, 1),
    model: { ...atIndex(models, 1).model, model_name: `model-${index}` },
  }))
  render(<PricingDiagnostics models={manyModels} onLocate={vi.fn()} />)
  await user.click(screen.getByRole("button", { name: /diagnostics.title/ }))
  expect(screen.getAllByRole("listitem").length).toBeLessThan(55)
  expect(
    screen.getByRole("region", { name: "diagnostics.results" }),
  ).toBeVisible()
  await user.click(screen.getByRole("button", { name: "diagnostics.copy" }))
  expect(toast.error).toHaveBeenCalledWith("diagnostics.copyFailed")
  expect(screen.queryByText("diagnostics.copyFailed")).not.toBeInTheDocument()
  await user.click(
    screen.getByRole("button", { name: "diagnostics.inspect: model-0" }),
  )
  await user.click(
    screen.getByRole("button", { name: "diagnostics.copyRecord" }),
  )
  expect(toast.error).toHaveBeenCalledTimes(2)
  expect(screen.queryByText("diagnostics.copyFailed")).not.toBeInTheDocument()
})

it("searches a full URL and error code, exports all matches and excludes pasted credentials", async () => {
  const user = userEvent.setup()
  const copy = vi
    .spyOn(navigator.clipboard, "writeText")
    .mockResolvedValue(undefined)
  const records = Array.from({ length: 55 }, (_, index) => ({
    ...atIndex(models, 1),
    model: { ...atIndex(models, 1).model, model_name: `model-${index}` },
  }))
  render(
    <PricingDiagnostics
      models={[atIndex(models, 0), ...records]}
      onLocate={vi.fn()}
    />,
  )
  await user.click(screen.getByRole("button", { name: /diagnostics.title/ }))
  await user.type(
    screen.getByRole("textbox", { name: "diagnostics.search" }),
    "https://user:SECRET@example.com/v1/models?key=PRIVATE price-missing:output",
  )
  expect(screen.getAllByRole("listitem").length).toBeLessThan(55)
  await user.click(
    screen.getByRole("button", { name: "diagnostics.copyFiltered" }),
  )
  expect(toast.success).toHaveBeenCalledWith("diagnostics.copiedFiltered")
  expect(
    screen.queryByText("diagnostics.copiedFiltered"),
  ).not.toBeInTheDocument()
  const exported = JSON.parse(atIndex(copy.mock.calls, 0)[0])
  expect(exported.scope).toBe("filtered-diagnostics")
  expect(exported.rows).toHaveLength(55)
  expect(exported.summary).toMatchObject({
    total: 55,
    attention: 55,
    complete: 0,
  })
  expect(exported.issueCounts).toEqual([{ code: "price-missing", count: 55 }])
  expect(atIndex(copy.mock.calls, 0)[0]).not.toMatch(
    /SECRET|PRIVATE|DO_NOT_EXPORT/,
  )
})

it("keeps every origin available above the scrolling results and supports billing-group and flat views", async () => {
  const user = userEvent.setup()
  const otherSource = createProfileSource({
    id: "other",
    name: "Other",
    apiType: "openai-compatible",
    baseUrl: "http://localhost:8080/v1",
    apiKey: "",
    tagIds: [],
    notes: "",
    createdAt: 0,
    updatedAt: 0,
  })
  const many = Array.from({ length: 55 }, (_, index) => ({
    ...atIndex(models, 1),
    effectiveGroup: "default",
    model: { ...atIndex(models, 1).model, model_name: `example-${index}` },
  }))
  render(
    <PricingDiagnostics
      models={[
        ...many,
        {
          ...atIndex(models, 1),
          source: otherSource,
          effectiveGroup: "premium",
          model: { ...atIndex(models, 1).model, model_name: "other-model" },
        },
      ]}
      onLocate={vi.fn()}
    />,
  )
  await user.click(screen.getByRole("button", { name: /diagnostics.title/ }))
  await user.click(
    screen.getByRole("combobox", { name: "diagnostics.groupBy" }),
  )
  await user.click(
    await screen.findByRole("option", { name: "diagnostics.byOrigin" }),
  )
  expect(
    screen.getByRole("button", { name: /https:\/\/example.com/ }),
  ).toHaveAttribute("aria-pressed", "false")
  await user.click(
    screen.getByRole("button", { name: /http:\/\/localhost:8080/ }),
  )
  expect(screen.getByText("other-model")).toBeVisible()
  await user.type(
    screen.getByRole("textbox", { name: "diagnostics.search" }),
    "localhost:8080/v1",
  )
  expect(screen.getByText("other-model")).toBeVisible()
  await user.click(
    screen.getByRole("button", { name: "diagnostics.clearSearch" }),
  )
  await user.click(
    screen.getByRole("combobox", { name: "diagnostics.groupBy" }),
  )
  await user.click(
    await screen.findByRole("option", { name: "diagnostics.byGroup" }),
  )
  expect(screen.getByRole("button", { name: /premium/ })).toBeVisible()
  await user.click(
    screen.getByRole("combobox", { name: "diagnostics.groupBy" }),
  )
  await user.click(
    await screen.findByRole("option", { name: "diagnostics.flat" }),
  )
  expect(screen.getAllByRole("listitem").length).toBeLessThan(55)
})
