import { describe, expect, it } from "vitest"

import { AccountConsumptionDetails } from "~/features/AccountManagement/components/AccountList/rows/AccountConsumptionDetails"
import { buildFinancialPeriodFact } from "~~/tests/test-utils/accountTodayStats"
import { render, screen } from "~~/tests/test-utils/render"

describe("saved release cashflow details", () => {
  const providers = {
    withUserPreferencesProvider: false,
    withThemeProvider: false,
  }
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
        providers,
      )
      expect(
        screen.getByText(
          coverage === "partial"
            ? "keyManagement:financial.partial"
            : "account:financial.coverageUnknown",
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
      providers,
    )
    expect(screen.getByText(/3\.25/)).toBeVisible()
    expect(screen.getByText("account:financial.legacy")).toBeVisible()
    expect(screen.getByText("account:financial.lastKnown")).toBeVisible()
    expect(
      screen.getByRole("group", {
        name: "account:financial.usagePeriod · account:financial.unavailable",
      }),
    ).toBeVisible()
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
      providers,
    )
    expect(screen.getByText(/3\.25/)).toBeVisible()
    expect(screen.getByText(/2\.5/)).toBeVisible()
    expect(screen.getAllByText("account:financial.legacy")).toHaveLength(2)
    expect(screen.getAllByText("account:financial.lastKnown")).toHaveLength(2)
  })
})
