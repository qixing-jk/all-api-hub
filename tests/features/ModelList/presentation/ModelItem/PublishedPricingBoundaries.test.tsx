import { cleanup, render, screen } from "@testing-library/react"
import { afterEach, expect, it, vi } from "vitest"

import { ModelPricingSchedule } from "~/features/ModelList/presentation/ModelItem/ModelPricingSchedule"
import { ModelPublishedPricing } from "~/features/ModelList/presentation/ModelItem/ModelPublishedPricing"
import zhModelList from "~/locales/zh-CN/modelList.json"

const locale = vi.hoisted(() => ({ language: "en" }))
vi.mock("react-i18next", async (original) => ({
  ...(await original<typeof import("react-i18next")>()),
  useTranslation: () => ({
    i18n: locale,
    t: (key: string, values?: object) => {
      if (locale.language === "zh-CN") {
        const translated = key
          .split(".")
          .reduce<unknown>(
            (value, part) =>
              value && typeof value === "object"
                ? (value as Record<string, unknown>)[part]
                : undefined,
            zhModelList,
          )
        if (typeof translated === "string") return translated
      }
      return values ? `${key} ${JSON.stringify(values)}` : key
    },
  }),
}))
afterEach(() => {
  cleanup()
  locale.language = "en"
})

it.each([false, true])(
  "uses a distinct Chinese call unit without repeating the caption (details=%s)",
  (details) => {
    locale.language = "zh-CN"
    const { container } = render(
      <ModelPublishedPricing
        details={details}
        pricing={{
          source: { kind: "catalog" },
          schedule: [
            {
              id: "base",
              conditions: [],
              rates: {
                request: {
                  amount: 2,
                  currency: "USD",
                  unit: "request",
                  per: 1,
                },
              },
            },
          ],
        }}
      />,
    )
    expect(container).toHaveTextContent("按次计费")
    if (details) {
      expect(container).toHaveTextContent("按次计费 · 次")
      expect(container).toHaveTextContent("$2.0000")
    } else {
      expect(container).toHaveTextContent(/\$2(?:\.00)?\s*\/\s*次/)
    }
    expect(container).not.toHaveTextContent("每次调用:")
  },
)

it.each([
  ["USD", true, 7, "¥7"],
  ["CNY", false, 7, "$1"],
  ["CNY", false, NaN, "¥7"],
] as const)(
  "preserves currency semantics for %s rates (convert=%s, rate=%s)",
  (currency, showRealPrice, exchangeRate, expected) => {
    render(
      <ModelPublishedPricing
        pricing={{
          source: { kind: "catalog" },
          schedule: [
            {
              id: "base",
              conditions: [],
              rates: {
                request: {
                  amount: currency === "USD" ? 1 : 7,
                  currency,
                  unit: "request",
                  per: 1,
                },
              },
            },
          ],
        }}
        showRealPrice={showRealPrice}
        exchangeRate={exchangeRate}
      />,
    )
    expect(
      screen.getByText(new RegExp(expected.replace("$", "\\$"))),
    ).toBeVisible()
  },
)

it("shows conditional rule guidance and bounded measurements with native source context", () => {
  render(
    <ModelPublishedPricing
      pricing={{
        source: {
          kind: "catalog",
          rulesUnavailable: true,
          conversion: { originalCurrency: "CNY", cnyPerUsd: 7 },
        },
        schedule: [
          {
            id: "duration",
            conditions: [
              { kind: "measurement", axis: "videoSeconds", lte: 5 },
              { kind: "range", axis: "inputTokens", maxExclusive: 100 },
            ],
            rates: {
              videoSeconds: {
                amount: 0.2,
                currency: "USD",
                unit: "second",
                per: 1,
              },
            },
          },
        ],
      }}
    />,
  )
  expect(screen.getByText("scenario.websiteRulesUnavailable")).toBeVisible()
  expect(screen.getByRole("group").textContent).toContain("≥ 0, ≤ 5")
  expect(screen.getByRole("group").textContent).toContain('"min":0')
  expect(screen.getByText(/scenario.siteConversion/)).toBeVisible()
})

it.each(["zh", "en"])(
  "falls back between source description languages in %s",
  (language) => {
    locale.language = language
    render(
      <ModelPricingSchedule
        schedule={[]}
        source={{
          kind: "catalog",
          pricingDescription:
            language === "zh" ? { en: "English source" } : { zh: "中文来源" },
          notes: [
            {
              kind: "routing-context",
              channelName: "Dedicated",
              dedicated: true,
              multiplier: 1,
            },
            { kind: "routing-context", dedicated: false, multiplier: 2 },
          ],
        }}
      />,
    )
    expect(
      screen.getByText(language === "zh" ? "English source" : "中文来源", {
        exact: false,
      }),
    ).toBeVisible()
    expect(screen.getByText(/pricingNotes.namedChannel/)).toBeVisible()
    expect(screen.getByText(/pricingNotes.allChannels/)).toBeVisible()
  },
)
