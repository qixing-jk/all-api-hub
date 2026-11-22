import userEvent from "@testing-library/user-event"
import { expect, it, vi } from "vitest"

import { BalancePortfolioSummary } from "~/features/AccountManagement/components/BalancePortfolioSummary"
import { FinancialAmountSummary } from "~/features/AccountManagement/components/FinancialAmountSummary"
import { FinancialTotalsPopover } from "~/features/AccountManagement/components/FinancialTotalsPopover"
import { ObservationWindow } from "~/features/AccountManagement/components/ObservationWindow"
import {
  accountBalanceScope,
  accountBalanceSnapshot,
} from "~/services/accounts/balanceSnapshot"
import {
  getDisplayConsumptionProjection,
  getDisplayIncomeProjection,
} from "~/services/accounts/metrics/consumptionProjection"
import { balancePosition, staleObservation } from "~/services/amounts/balance"
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

it("keeps duplicate, manual and last-known contribution notes in a compact overview", async () => {
  const at = Date.now()
  const site = (id: string, walletId: string, value: string) => {
    const scope = {
      ...accountBalanceScope({
        baseUrl: "https://wallet.example",
        accountId: id,
      }),
      walletId,
    }
    return buildDisplaySiteData({
      id,
      balanceSnapshot: accountBalanceSnapshot(
        scope,
        [
          balancePosition({
            id: "wallet",
            scope,
            value,
            asset: { kind: "currency", code: "USD" },
            observedAt: at,
            source: {
              kind: "reported",
              adapter: "fixture",
              operation: "wallet",
              contractVersion: "1",
            },
          }),
        ],
        at,
        "complete",
      ),
    })
  }
  const manual = site("manual", "manual", "3")
  manual.manualBalanceSnapshot = structuredClone(manual.balanceSnapshot)
  manual.manualBalanceSnapshot!.positions[0]!.amount.source.kind = "manual"
  manual.balanceSnapshot = undefined
  const retained = site("retained", "retained", "4")
  retained.balanceSnapshot!.positions[0]!.amount = staleObservation(
    retained.balanceSnapshot!.positions[0]!.amount,
  )
  render(
    <BalancePortfolioSummary
      sites={[
        site("one", "shared", "20"),
        site("two", "shared", "20"),
        manual,
        retained,
      ]}
      compact
    />,
  )
  expect(screen.getByText("$27.00")).toBeVisible()
  expect(screen.getByText("account:financial.duplicates")).toBeVisible()
  expect(screen.getByText("account:financial.manualContribution")).toBeVisible()
  expect(screen.getByText("account:financial.lastKnown")).toBeVisible()
  await userEvent
    .setup()
    .click(screen.getByRole("button", { name: "account:financial.details" }))
  expect(
    within(screen.getByRole("dialog")).getByText(/USD\s27\b/),
  ).toBeVisible()
})

it.each([false, true])(
  "keeps a saved reference separate from current compact totals (%s)",
  (withCurrent) => {
    const scope = accountBalanceScope({
      baseUrl: "https://legacy.example",
      accountId: "legacy",
    })
    const legacy = balancePosition({
      id: "legacy",
      scope,
      value: "2",
      observedAt: 100,
      asset: { kind: "currency", code: "USD" },
      source: {
        kind: "legacy",
        adapter: "release",
        operation: "balance",
        contractVersion: "1",
      },
    })
    legacy.amount = staleObservation(legacy.amount)
    const sites = [
      buildDisplaySiteData({
        id: "legacy",
        balanceSnapshot: accountBalanceSnapshot(
          scope,
          [legacy],
          100,
          "unknown",
        ),
      }),
    ]
    if (withCurrent) {
      const currentScope = accountBalanceScope({
        baseUrl: "https://current.example",
        accountId: "current",
      })
      sites.push(
        buildDisplaySiteData({
          id: "current",
          balanceSnapshot: accountBalanceSnapshot(
            currentScope,
            [
              balancePosition({
                id: "wallet",
                scope: currentScope,
                value: "10",
                observedAt: 100,
                asset: { kind: "currency", code: "USD" },
                source: {
                  kind: "reported",
                  adapter: "fixture",
                  operation: "wallet",
                  contractVersion: "1",
                },
              }),
            ],
            100,
            "complete",
          ),
        }),
      )
    }
    render(<BalancePortfolioSummary sites={sites} compact />)
    expect(
      screen.getByText(/account:financial.lastKnown.*\$2\.00/),
    ).toBeVisible()
    if (withCurrent) expect(screen.getByText("$10.00")).toBeVisible()
    expect(screen.queryByText("$12.00")).toBeNull()
  },
)

it.each(["possible", "conflicting"] as const)(
  "keeps %s wallet uncertainty visible in compact totals",
  (kind) => {
    const site = (
      id: string,
      value: string,
      walletId?: string,
      operation = "wallet",
    ) => {
      const scope = {
        ...accountBalanceScope({
          baseUrl: "https://wallet.example",
          accountId: id,
        }),
        ...(walletId ? { walletId } : {}),
      }
      return buildDisplaySiteData({
        id,
        balanceSnapshot: accountBalanceSnapshot(
          scope,
          [
            balancePosition({
              id: "wallet",
              scope,
              value,
              observedAt: 100,
              asset: { kind: "currency", code: "USD" },
              source: {
                kind: "reported",
                adapter: "fixture",
                operation,
                contractVersion: "1",
              },
            }),
          ],
          100,
          "complete",
        ),
      })
    }
    const sites =
      kind === "possible"
        ? [site("one", "20"), site("two", "20")]
        : [
            site("one", "20", "shared"),
            site("two", "20", "shared", "other"),
            site("three", "10", "independent"),
          ]
    render(<BalancePortfolioSummary sites={sites} compact />)
    expect(
      screen.getByText(kind === "possible" ? "$40.00" : "$10.00"),
    ).toBeVisible()
    expect(
      screen.getByText(
        kind === "possible"
          ? "account:financial.potentialDuplicates"
          : "account:financial.conflicts",
      ),
    ).toBeVisible()
    expect(screen.getByText(/shareSnapshots:financial.partial/)).toBeVisible()
  },
)
