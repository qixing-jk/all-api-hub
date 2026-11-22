import userEvent from "@testing-library/user-event"
import { expect, it } from "vitest"

import { NetInflowTotalsDisplay } from "~/features/AccountManagement/components/NetInflowTotalsDisplay"
import type { NetInflowTotals } from "~/services/accounts/metrics/netInflowTotals"
import { buildDisplaySiteData } from "~~/tests/test-utils/factories"
import {
  buildNetInflow,
  buildNetInflowItem,
} from "~~/tests/test-utils/netInflow"
import { render, screen, within } from "~~/tests/test-utils/render"

it("labels same-asset totals with their own window and keeps contributions with their total", async () => {
  const sites = [
    buildDisplaySiteData({ id: "alpha", name: "Alpha" }),
    buildDisplaySiteData({ id: "beta", name: "Beta" }),
  ]
  const totals: NetInflowTotals = {
    coverage: "partial",
    availableAccounts: 2,
    totalAccounts: 2,
    excluded: [],
    duplicateCount: 0,
    potentialDuplicateCount: 0,
    groups: sites.map(({ id }, index) => {
      const estimate = buildNetInflow("5")
      estimate.window.end += index * 3 * 60 * 60 * 1000
      const { position, seriesKey } = buildNetInflowItem(estimate)
      return {
        key: id,
        amount: estimate.amount,
        window: estimate.window,
        contributions: [{ accountId: id, position, seriesKey, estimate }],
      }
    }),
  }
  const { rerender } = render(
    <NetInflowTotalsDisplay sites={sites} totals={totals} compact />,
  )
  await screen.findByRole("region", {
    name: "account:stats.estimatedNetInflow",
  })
  const windows = screen.getAllByRole("button", {
    name: /account:financial.window/,
  })
  expect(windows).toHaveLength(2)
  expect(windows[0]?.getAttribute("aria-label")).not.toBe(
    windows[1]?.getAttribute("aria-label"),
  )

  const user = userEvent.setup()
  rerender(<NetInflowTotalsDisplay sites={sites} totals={totals} />)
  await user.click(
    screen.getByText("account:netInflow.details", { exact: true }),
  )
  const alpha = screen.getByText(/^Alpha ·/)
  const group = alpha.closest("div")!
  expect(
    within(group).getByRole("button", { name: /account:financial.window/ }),
  ).toBeVisible()
  expect(within(group).queryByText(/^Beta ·/)).not.toBeInTheDocument()
})

it("explains missing usage, identity and interval evidence without treating them as a zero total", async () => {
  const positions = [
    {
      accountId: "usage",
      reason: "missing_cashflow",
      name: "No settled charges",
    },
    {
      accountId: "interval",
      reason: "interval_mismatch",
      name: "Different billing period",
    },
    {
      accountId: "identity",
      reason: "incomparable-balance-observations",
      name: "Wallet changed",
    },
  ]
  const sites = positions.map(({ accountId, name }) =>
    buildDisplaySiteData({ id: accountId, name }),
  )
  const item = buildNetInflowItem()
  render(
    <NetInflowTotalsDisplay
      sites={sites}
      totals={{
        coverage: "partial",
        availableAccounts: 0,
        totalAccounts: 3,
        groups: [],
        excluded: positions.map(({ accountId, reason }) => ({
          accountId,
          reason,
          position: item.position,
        })),
        duplicateCount: 0,
        potentialDuplicateCount: 0,
      }}
    />,
  )

  expect(await screen.findByText("account:financial.unavailable")).toBeVisible()
  await userEvent.click(
    screen.getByText("account:netInflow.details", { exact: true }),
  )
  expect(screen.getByText(/No settled charges/)).toHaveTextContent(
    "account:netInflow.reasons.consumption",
  )
  expect(screen.getByText(/Different billing period/)).toHaveTextContent(
    "account:netInflow.reasons.interval",
  )
  expect(screen.getByText(/Wallet changed/)).toHaveTextContent(
    "account:netInflow.reasons.identity",
  )
})
