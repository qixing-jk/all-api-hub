import userEvent from "@testing-library/user-event"
import { expect, it, vi } from "vitest"

import { FinancialAmountSummary } from "~/features/AccountManagement/components/FinancialAmountSummary"
import { FinancialTotalsPopover } from "~/features/AccountManagement/components/FinancialTotalsPopover"
import { ObservationWindow } from "~/features/AccountManagement/components/ObservationWindow"
import {
  getDisplayConsumptionProjection,
  getDisplayIncomeProjection,
} from "~/services/accounts/metrics/consumptionProjection"
import { buildDisplaySiteData } from "~~/tests/test-utils/factories"
import { render, screen, within } from "~~/tests/test-utils/render"

vi.mock("~/contexts/UserPreferencesContext", () => ({
  UserPreferencesProvider: ({ children }: { children: React.ReactNode }) =>
    children,
  useUserPreferencesContext: () => ({
    currencyType: "USD",
    currencyDisplay: "original",
    preferences: {},
  }),
}))

it("keeps saved reference amounts and their account and clock visible in total details", async () => {
  const sites = [
    buildDisplaySiteData({
      id: "saved",
      name: "Saved site",
      referenceConsumption: {
        amount: { USD: 2, CNY: 14 },
        observedAt: 1000,
        lastKnown: true,
      },
      referenceIncome: {
        amount: { USD: 5, CNY: 35 },
        observedAt: 1000,
        lastKnown: true,
      },
    }),
  ]
  render(
    <FinancialTotalsPopover
      sites={sites}
      consumption={getDisplayConsumptionProjection(sites)}
      income={getDisplayIncomeProjection(sites)}
      showTodayCashflow
      showAccountBreakdown
      title="Totals"
      triggerLabel="Totals details"
    />,
  )
  await userEvent
    .setup()
    .click(screen.getByRole("button", { name: "Totals details" }))
  const panel = within(screen.getByRole("dialog"))
  expect(panel.getByText(/^USD\s2$/)).toBeVisible()
  expect(panel.getByText(/^USD\s5$/)).toBeVisible()
  expect(panel.getAllByText("Saved site").length).toBeGreaterThan(0)
  expect(
    panel.getAllByText(/account:financial.lastKnown/).length,
  ).toBeGreaterThan(0)
  expect(
    screen
      .getByRole("dialog")
      .querySelectorAll('time[datetime="1970-01-01T00:00:01.000Z"]').length,
  ).toBeGreaterThan(0)
})

it("uses a UTC range when an observation's reported timezone is unreadable", () => {
  render(
    <ObservationWindow
      window={{ start: 1000, end: 2000, timeZone: "Mars/Olympus" }}
    />,
  )
  expect(screen.getByRole("button")).toHaveTextContent("0:00:01")
})

it("shows the native amounts and how many further assets are available", () => {
  render(
    <FinancialAmountSummary
      label="Funds"
      emptyLabel="Unavailable"
      amounts={["USD", "EUR", "GBP"].map((code, index) => ({
        asset: { kind: "currency", code },
        value: String(index + 1),
      }))}
    />,
  )
  expect(screen.getByText(/USD\s1/)).toBeVisible()
  expect(screen.getByText(/EUR\s2/)).toBeVisible()
  expect(screen.getByText("+1")).toBeVisible()
})
