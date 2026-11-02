import { cleanup, render, screen } from "@testing-library/react"
import { afterEach, expect, it, vi } from "vitest"

import { ModelPricingSchedule } from "~/features/ModelList/presentation/ModelItem/ModelPricingSchedule"
import { ModelPublishedPricing } from "~/features/ModelList/presentation/ModelItem/ModelPublishedPricing"

const locale = vi.hoisted(() => ({ language: "en" }))
vi.mock("react-i18next", async (original) => ({
  ...(await original<typeof import("react-i18next")>()),
  useTranslation: () => ({
    i18n: locale,
    t: (key: string, values?: object) =>
      values ? `${key} ${JSON.stringify(values)}` : key,
  }),
}))
afterEach(() => {
  cleanup()
  locale.language = "en"
})

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
