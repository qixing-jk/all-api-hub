import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, expect, it, vi } from "vitest"

import { PricingDiagnostics } from "~/features/ModelList/components/PricingDiagnostics"
import { createProfileSource } from "~/features/ModelList/modelManagementSources"
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

const mode = vi.hoisted(() => ({ development: true }))
vi.mock("~/utils/core/environment", async (importOriginal) => ({
  ...(await importOriginal<typeof import("~/utils/core/environment")>()),
  isDevelopmentMode: () => mode.development,
}))
vi.mock("react-i18next", async (importOriginal) => ({
  ...(await importOriginal<typeof import("react-i18next")>()),
  useTranslation: () => ({ t: (key: string) => key }),
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
  mode.development = true
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
  expect(screen.queryByText("complete")).not.toBeInTheDocument()
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
  const report = JSON.parse(copy.mock.calls[0][0])
  expect(report.rows).toHaveLength(2)
  expect(copy.mock.calls[0][0]).not.toContain("DO_NOT_EXPORT")
  expect(screen.getByRole("status")).toHaveTextContent("diagnostics.copied")
})

it("shows an actionable selection explanation next to the diagnostic code", async () => {
  const user = userEvent.setup()
  const model = {
    ...models[1],
    calculatedPrice: {
      ...models[1].calculatedPrice,
      quote: {
        ...models[1].calculatedPrice.quote,
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
    ...models[1],
    model: { ...models[1].model, model_name: `model-${index}` },
  }))
  render(<PricingDiagnostics models={manyModels} onLocate={vi.fn()} />)
  await user.click(screen.getByRole("button", { name: /diagnostics.title/ }))
  expect(screen.getAllByRole("listitem")).toHaveLength(50)
  await user.click(screen.getByRole("button", { name: "diagnostics.more" }))
  expect(screen.getAllByRole("listitem")).toHaveLength(55)
  await user.click(screen.getByRole("button", { name: "diagnostics.copy" }))
  expect(screen.getByRole("alert")).toHaveTextContent("diagnostics.copyFailed")
})

it("searches a full URL and error code, exports all matches and excludes pasted credentials", async () => {
  const user = userEvent.setup()
  const copy = vi
    .spyOn(navigator.clipboard, "writeText")
    .mockResolvedValue(undefined)
  const records = Array.from({ length: 55 }, (_, index) => ({
    ...models[1],
    model: { ...models[1].model, model_name: `model-${index}` },
  }))
  render(
    <PricingDiagnostics models={[models[0], ...records]} onLocate={vi.fn()} />,
  )
  await user.click(screen.getByRole("button", { name: /diagnostics.title/ }))
  await user.type(
    screen.getByRole("textbox", { name: "diagnostics.search" }),
    "https://user:SECRET@example.com/v1/models?key=PRIVATE price-missing:output",
  )
  expect(screen.getAllByRole("listitem")).toHaveLength(50)
  await user.click(
    screen.getByRole("button", { name: "diagnostics.copyFiltered" }),
  )
  const exported = JSON.parse(copy.mock.calls[0][0])
  expect(exported.scope).toBe("filtered-diagnostics")
  expect(exported.rows).toHaveLength(55)
  expect(exported.summary).toMatchObject({
    total: 55,
    attention: 55,
    complete: 0,
  })
  expect(exported.issueCounts).toEqual([{ code: "price-missing", count: 55 }])
  expect(copy.mock.calls[0][0]).not.toMatch(/SECRET|PRIVATE|DO_NOT_EXPORT/)
})

it("keeps every origin visible before pagination and supports billing-group and flat views", async () => {
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
    ...models[1],
    effectiveGroup: "default",
    model: { ...models[1].model, model_name: `example-${index}` },
  }))
  render(
    <PricingDiagnostics
      models={[
        ...many,
        {
          ...models[1],
          source: otherSource,
          effectiveGroup: "premium",
          model: { ...models[1].model, model_name: "other-model" },
        },
      ]}
      onLocate={vi.fn()}
    />,
  )
  await user.click(screen.getByRole("button", { name: /diagnostics.title/ }))
  expect(screen.queryAllByRole("listitem")).toHaveLength(0)
  expect(
    screen.getByRole("button", { name: /https:\/\/example.com/ }),
  ).toHaveAttribute("aria-expanded", "false")
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
  expect(screen.getAllByRole("listitem")).toHaveLength(50)
})
