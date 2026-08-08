import { afterAll, beforeAll, describe, expect, it } from "vitest"

import {
  ModelPresentationDetails,
  ModelPresentationSummary,
} from "~/features/ModelList/components/ModelItem/ModelPresentationFacts"
import {
  MODEL_DISPLAY_FACT_LABELS,
  MODEL_DISPLAY_FACT_TYPES,
  MODEL_DISPLAY_PRICE_UNITS,
  MODEL_DISPLAY_SECTION_LABELS,
  type ModelDisplayTranslationKey,
  type ModelPresentation,
} from "~/services/models/modelDisplayFacts"
import { testI18n } from "~~/tests/test-utils/i18n"
import { render, screen, within } from "~~/tests/test-utils/render"

const firstProviderPresentation: ModelPresentation = {
  summaryFacts: [
    {
      type: MODEL_DISPLAY_FACT_TYPES.TokenQuantity,
      label: MODEL_DISPLAY_FACT_LABELS.ContextLimit,
      value: 128000,
    },
    {
      type: MODEL_DISPLAY_FACT_TYPES.StringList,
      label: MODEL_DISPLAY_FACT_LABELS.OutputModalities,
      values: ["text", "image"],
    },
  ],
  sections: [
    {
      id: "limits",
      label: MODEL_DISPLAY_SECTION_LABELS.Specifications,
      facts: [
        {
          type: MODEL_DISPLAY_FACT_TYPES.TokenQuantity,
          label: MODEL_DISPLAY_FACT_LABELS.MaximumOutputTokens,
          value: 8192,
        },
      ],
    },
  ],
}

const secondProviderPresentation: ModelPresentation = {
  summaryFacts: [
    {
      type: MODEL_DISPLAY_FACT_TYPES.Text,
      label: { fallback: "Latency" },
      value: "120 ms",
    },
    {
      type: MODEL_DISPLAY_FACT_TYPES.StringList,
      label: { fallback: "Supported features" },
      values: ["streaming", "tools"],
    },
  ],
  sections: [
    {
      id: "runtime",
      label: { fallback: "Runtime" },
      facts: [
        {
          type: MODEL_DISPLAY_FACT_TYPES.TokenQuantity,
          label: { fallback: "Maximum batch size" },
          value: 32,
        },
      ],
    },
  ],
}

beforeAll(() => {
  testI18n.addResourceBundle(
    "en",
    "modelList",
    {
      displayFacts: {
        contextLimit: "Context limit",
        maximumOutputTokens: "Maximum output tokens",
        outputModalities: "Output modalities",
        sections: { specifications: "Specifications" },
        boolean: { no: "No", yes: "Yes" },
        benchmarkTable: {
          arena: "Arena",
          category: "Category",
          rank: "Rank",
          score: "Score",
          winRate: "Win rate",
        },
        priceConditions: {
          minimumPromptTokens: "More than {{formattedCount}} prompt tokens",
          utcWindow: "{{start}}–{{end}} UTC",
        },
        priceUnits: {
          millionInputTokens: "1M input tokens",
          request: "request",
        },
        tokenCount_one: "{{formattedCount}} token",
        tokenCount_other: "{{formattedCount}} tokens",
      },
    },
    true,
    true,
  )
})

afterAll(() => {
  testI18n.removeResourceBundle("en", "modelList")
})

describe("generic model presentation facts", () => {
  it("preserves each provider policy's selected fact order and structured lists", () => {
    const { rerender } = render(
      <ModelPresentationSummary presentation={firstProviderPresentation} />,
      { withUserPreferencesProvider: false, withThemeProvider: false },
    )

    let facts = screen.getAllByTestId("model-display-fact")
    expect(
      facts.map((fact) => within(fact).getByRole("term").textContent),
    ).toEqual(["Context limit", "Output modalities"])
    expect(within(facts[0]).getByText("128,000 tokens")).toBeInTheDocument()
    expect(
      within(facts[1])
        .getAllByRole("listitem")
        .map((item) => item.textContent),
    ).toEqual(["text", "image"])

    rerender(
      <ModelPresentationSummary
        presentation={{
          summaryFacts: [
            firstProviderPresentation.sections![0].facts[0],
            firstProviderPresentation.summaryFacts![0],
          ],
        }}
      />,
    )

    facts = screen.getAllByTestId("model-display-fact")
    expect(
      facts.map((fact) => within(fact).getByRole("term").textContent),
    ).toEqual(["Maximum output tokens", "Context limit"])

    rerender(
      <ModelPresentationSummary presentation={secondProviderPresentation} />,
    )

    facts = screen.getAllByTestId("model-display-fact")
    expect(
      facts.map((fact) => within(fact).getByRole("term").textContent),
    ).toEqual(["Latency", "Supported features"])
    expect(within(facts[0]).getByText("120 ms")).toBeInTheDocument()
  })

  it("omits missing sections and renders long values without truncating their content", () => {
    const longValue = "modality-".repeat(40)
    const { rerender } = render(
      <ModelPresentationDetails presentation={{}} />,
      { withUserPreferencesProvider: false, withThemeProvider: false },
    )

    expect(screen.queryByTestId("model-presentation-details")).toBeNull()

    rerender(
      <ModelPresentationDetails
        presentation={{
          sections: [
            {
              id: "long-values",
              label: MODEL_DISPLAY_SECTION_LABELS.Specifications,
              facts: [
                {
                  type: MODEL_DISPLAY_FACT_TYPES.Text,
                  label: MODEL_DISPLAY_FACT_LABELS.OutputModalities,
                  value: longValue,
                },
              ],
            },
          ],
        }}
      />,
    )

    expect(screen.getByText(longValue)).toHaveTextContent(longValue)
  })

  it("keeps section labelling unique across repeated renderers", () => {
    render(
      <>
        <ModelPresentationDetails presentation={firstProviderPresentation} />
        <ModelPresentationDetails presentation={firstProviderPresentation} />
      </>,
      { withUserPreferencesProvider: false, withThemeProvider: false },
    )

    const sections = screen
      .getAllByTestId("model-presentation-details")
      .map((details) => details.querySelector("section"))
      .filter(
        (section): section is HTMLElement => section instanceof HTMLElement,
      )
    const labelledByIds = sections.map((section) =>
      section.getAttribute("aria-labelledby"),
    )

    expect(new Set(labelledByIds).size).toBe(2)
    sections.forEach((section, index) => {
      expect(labelledByIds[index]).toBeTruthy()
      expect(section.querySelector("h4")).toHaveAttribute(
        "id",
        labelledByIds[index],
      )
    })
  })

  it("uses the fallback for translation keys outside the model-facts namespace", () => {
    render(
      <ModelPresentationSummary
        presentation={{
          summaryFacts: [
            {
              type: MODEL_DISPLAY_FACT_TYPES.Text,
              label: {
                translationKey: "foreign.label" as ModelDisplayTranslationKey,
                fallback: "Safe label",
              },
              value: "value",
            },
          ],
        }}
      />,
      { withUserPreferencesProvider: false, withThemeProvider: false },
    )

    expect(screen.getByRole("term")).toHaveTextContent("Safe label")
  })

  it("renders typed prices, conditions, dates, booleans, links, and benchmarks accessibly", () => {
    render(
      <ModelPresentationDetails
        presentation={{
          sections: [
            {
              id: "rich-facts",
              label: { fallback: "Rich facts" },
              facts: [
                {
                  type: MODEL_DISPLAY_FACT_TYPES.CurrencyPrice,
                  label: { fallback: "Input price" },
                  amount: 1.5,
                  currency: "USD",
                  unit: MODEL_DISPLAY_PRICE_UNITS.MillionInputTokens,
                },
                {
                  type: MODEL_DISPLAY_FACT_TYPES.Boolean,
                  label: { fallback: "Moderated" },
                  value: false,
                },
                {
                  type: MODEL_DISPLAY_FACT_TYPES.Number,
                  label: { fallback: "Default temperature" },
                  value: 0,
                },
                {
                  type: MODEL_DISPLAY_FACT_TYPES.Date,
                  label: { fallback: "Added" },
                  value: "2024-01-02",
                },
                {
                  type: MODEL_DISPLAY_FACT_TYPES.Link,
                  label: { fallback: "Details" },
                  href: "https://docs.example.invalid/model",
                  text: { fallback: "Open model details" },
                },
                {
                  type: MODEL_DISPLAY_FACT_TYPES.PriceOverrides,
                  label: { fallback: "Conditional prices" },
                  overrides: [
                    {
                      conditions: [
                        {
                          type: "minimum-prompt-tokens",
                          value: 200_000,
                        },
                      ],
                      prices: [
                        {
                          label: { fallback: "Input price" },
                          amount: 3,
                          currency: "USD",
                          unit: MODEL_DISPLAY_PRICE_UNITS.MillionInputTokens,
                        },
                      ],
                    },
                    {
                      conditions: [
                        { type: "utc-window", start: 1630, end: 30 },
                      ],
                      prices: [
                        {
                          label: { fallback: "Request price" },
                          amount: 0,
                          currency: "USD",
                          unit: MODEL_DISPLAY_PRICE_UNITS.Request,
                        },
                      ],
                    },
                  ],
                },
                {
                  type: MODEL_DISPLAY_FACT_TYPES.BenchmarkList,
                  label: { fallback: "Benchmark rankings" },
                  entries: [
                    {
                      arena: "models",
                      category: "website",
                      score: 1385.2,
                      rank: 5,
                      winRatePercent: 62.5,
                    },
                  ],
                },
              ],
            },
          ],
        }}
      />,
      { withUserPreferencesProvider: false, withThemeProvider: false },
    )

    expect(screen.getByText("$1.50 / 1M input tokens")).toBeInTheDocument()
    expect(screen.getByText("No")).toBeInTheDocument()
    expect(screen.getByText("0")).toBeInTheDocument()
    expect(screen.getByText("Jan 2, 2024")).toBeInTheDocument()
    expect(
      screen.getByRole("link", { name: "Open model details" }),
    ).toHaveAttribute("href", "https://docs.example.invalid/model")
    expect(
      screen.getByRole("link", { name: "Open model details" }),
    ).toHaveAttribute("rel", "noreferrer noopener")
    expect(
      screen.getByText("More than 200,000 prompt tokens"),
    ).toBeInTheDocument()
    expect(screen.getByText("16:30–00:30 UTC")).toBeInTheDocument()
    expect(screen.getByText("$3.00 / 1M input tokens")).toBeInTheDocument()
    expect(screen.getByText("$0.00 / request")).toBeInTheDocument()

    const table = screen.getByRole("table", { name: "Benchmark rankings" })
    expect(
      within(table).getByRole("columnheader", { name: "Arena" }),
    ).toBeInTheDocument()
    expect(
      within(table).getByRole("cell", { name: "models" }),
    ).toBeInTheDocument()
    expect(
      within(table).getByRole("cell", { name: "62.5%" }),
    ).toBeInTheDocument()
  })
})
