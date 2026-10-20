import { render, screen } from "@testing-library/react"
import { createInstance } from "i18next"
import { I18nextProvider } from "react-i18next"
import { expect, it } from "vitest"

import { ModelQuotaPricing } from "~/features/ModelList/presentation/ModelItem/ModelQuotaPricing"
import en from "~/locales/en/modelList.json"
import {
  QUOTA_COMPARISON_SCOPES,
  QUOTA_QUOTE_STATUSES,
  QUOTA_ROUNDING_MODES,
} from "~/services/modelPricing/quotaPricing"
import type { QuotaPricingPlan } from "~/services/modelPricing/quotaPricing"

const plan: QuotaPricingPlan = {
  unit: {
    id: "https://example.test/points",
    label: "Points",
    displayLabel: "K Points",
    displayScale: 1000,
  },
  rates: { input: { amount: 3, per: 1 }, output: { amount: 0, per: 1 } },
  adjustments: [{ id: "membership", label: { en: "Membership" } }],
  comparisonScope: QUOTA_COMPARISON_SCOPES.Source,
  rounding: QUOTA_ROUNDING_MODES.Floor,
  sourceUrl: "https://example.test/pricing",
}

it("falls back to the published English adjustment name in Chinese and explains invalid pricing", async () => {
  const i18n = createInstance()
  await i18n.init({
    lng: "zh-CN",
    resources: { "zh-CN": { modelList: en } },
    interpolation: { escapeValue: false },
  })
  const { rerender } = render(
    <I18nextProvider i18n={i18n}>
      <ModelQuotaPricing plan={plan} />
    </I18nextProvider>,
  )
  expect(
    screen.getByRole("link", { name: "Billing rules" }),
  ).toHaveAccessibleDescription(/Membership/)
  rerender(
    <I18nextProvider i18n={i18n}>
      <ModelQuotaPricing plan={{ ...plan, rates: {} }} />
    </I18nextProvider>,
  )
  expect(screen.getByText(en.quotaBilling.invalid)).toBeVisible()
  expect(screen.queryByRole("link")).not.toBeInTheDocument()
})

it("uses the standard per-million rate rows without a separate calculator or default blended quote", async () => {
  const i18n = createInstance()
  await i18n.init({
    lng: "en",
    resources: { en: { modelList: en } },
    interpolation: { escapeValue: false },
  })
  const { rerender } = render(
    <I18nextProvider i18n={i18n}>
      <ModelQuotaPricing
        plan={plan}
        quote={{
          status: QUOTA_QUOTE_STATUSES.Reference,
          baseAmount: 123,
          amount: null,
          missingAdjustments: ["membership"],
        }}
      />
    </I18nextProvider>,
  )
  expect(screen.getByText("3,000 K Points/M")).toBeVisible()
  expect(screen.getByText("0 K Points/M")).toBeVisible()
  expect(screen.getByText("Input:")).toBeVisible()
  expect(screen.getByText("Output:")).toBeVisible()
  expect(
    screen.queryByRole("button", { name: "Estimate quota usage" }),
  ).not.toBeInTheDocument()
  expect(screen.queryByRole("spinbutton")).not.toBeInTheDocument()
  expect(screen.queryByText(/million modeled tokens/)).not.toBeInTheDocument()
  expect(screen.getByRole("link", { name: "Billing rules" })).toHaveAttribute(
    "href",
    plan.sourceUrl,
  )
  expect(
    screen.getByRole("link", { name: "Billing rules" }),
  ).toHaveAccessibleDescription(/Membership/)
  rerender(
    <I18nextProvider i18n={i18n}>
      <ModelQuotaPricing
        plan={plan}
        isComparisonActive
        quote={{
          status: QUOTA_QUOTE_STATUSES.Reference,
          baseAmount: 123,
          amount: null,
          missingAdjustments: ["membership"],
        }}
      />
    </I18nextProvider>,
  )
  expect(
    screen.getByText(
      /0.123 K Points \/ million modeled tokens.*Base usage only/,
    ),
  ).toBeVisible()
})
