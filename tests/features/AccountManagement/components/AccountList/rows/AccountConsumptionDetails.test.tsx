import { render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"

import { AccountConsumptionDetails } from "~/features/AccountManagement/components/AccountList/rows/AccountConsumptionDetails"
import { buildFinancialPeriodFact } from "~~/tests/test-utils/accountTodayStats"

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key, i18n: { language: "en" } }),
}))

describe("saved release cashflow details", () => {
  it.each(["partial", "unknown"] as const)(
    "shows %s provider cost coverage in account details",
    (coverage) => {
      const fact = buildFinancialPeriodFact({
        accountId: "account-1",
        value: "3",
      })
      render(
        <AccountConsumptionDetails
          site={{
            usage: {
              scope: "site_today",
              cost: {
                asset: fact.asset,
                amount: fact.amount,
                scope: fact.scope,
                coverage,
              },
            },
          }}
        />,
      )
      expect(
        screen.getByText(
          coverage === "partial"
            ? "keyManagement:financial.partial"
            : "financial.coverageUnknown",
        ),
      ).toBeVisible()
    },
  )
  it("shows a retained reference beside the native amount failure", () => {
    const fact = buildFinancialPeriodFact({
      accountId: "account-1",
      value: "3.25",
    })
    fact.amount = {
      status: "unavailable",
      source: fact.amount.source,
      reason: "request-failed",
    }
    render(
      <AccountConsumptionDetails
        site={{
          settledConsumption: [fact],
          referenceConsumption: {
            amount: { USD: 3.25, CNY: 22.75 },
            lastKnown: true,
          },
        }}
      />,
    )
    expect(screen.getByText(/3\.25/)).toBeVisible()
    expect(screen.getByText("financial.legacy")).toBeVisible()
    expect(screen.getByText("financial.lastKnown")).toBeVisible()
  })
  it("keeps reference amounts readable when observation time is absent", () => {
    render(
      <AccountConsumptionDetails
        site={{
          referenceConsumption: {
            amount: { USD: 3.25, CNY: 22.75 },
            lastKnown: true,
          },
          referenceIncome: { amount: { USD: 2.5, CNY: 17.5 }, lastKnown: true },
        }}
      />,
    )
    expect(screen.getByText(/3\.25/)).toBeVisible()
    expect(screen.getByText(/2\.5/)).toBeVisible()
    expect(screen.getAllByText("financial.legacy")).toHaveLength(2)
    expect(screen.getAllByText("financial.lastKnown")).toHaveLength(2)
  })
})
