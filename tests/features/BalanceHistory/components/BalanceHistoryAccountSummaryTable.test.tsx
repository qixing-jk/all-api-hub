import userEvent from "@testing-library/user-event"
import type { ReactNode } from "react"
import { describe, expect, it, vi } from "vitest"

import BalanceHistoryAccountSummaryTable, {
  type BalanceHistoryAccountSummaryRow,
} from "~/features/BalanceHistory/components/BalanceHistoryAccountSummaryTable"
import { render, screen, within } from "~~/tests/test-utils/render"

vi.mock("react-i18next", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react-i18next")>()

  return {
    ...actual,
    useTranslation: () => ({
      t: (
        key: string,
        options?: {
          covered?: number
          total?: number
        },
      ) =>
        key === "table.coverageFormat"
          ? `${options?.covered}/${options?.total}`
          : `balanceHistory:${key}`,
    }),
  }
})

vi.mock("~/components/AccountLinkButton", () => ({
  default: ({ accountName }: { accountName: string }) => (
    <button type="button" data-testid="account-link">
      {accountName}
    </button>
  ),
}))

vi.mock("~/contexts/UserPreferencesContext", () => ({
  UserPreferencesProvider: ({ children }: { children: ReactNode }) => children,
  useUserPreferencesContext: () => ({}),
}))

const buildRow = (
  overrides: Partial<BalanceHistoryAccountSummaryRow> = {},
): BalanceHistoryAccountSummaryRow => ({
  id: "account-1",
  label: "Account",
  startBalance: 10,
  endBalance: 12,
  netTotal: 2,
  incomeTotal: 4,
  outcomeTotal: 2,
  snapshotDays: 3,
  cashflowDays: 2,
  totalDays: 4,
  ...overrides,
})

const getAccountOrder = () =>
  screen.getAllByTestId("account-link").map((element) => element.textContent)

describe("BalanceHistoryAccountSummaryTable", () => {
  it("shows the loading state when there are no rows yet", () => {
    render(
      <BalanceHistoryAccountSummaryTable
        rows={[]}
        isLoading={true}
        currencySymbol="$"
      />,
    )

    expect(screen.getByText("balanceHistory:table.loading")).toBeInTheDocument()
    expect(screen.queryByText("balanceHistory:table.empty")).toBeNull()
    expect(screen.queryByTestId("account-link")).toBeNull()
  })

  it("keeps rendered rows visible while a refresh is in flight", () => {
    render(
      <BalanceHistoryAccountSummaryTable
        rows={[buildRow({ label: "Primary Account" })]}
        isLoading={true}
        currencySymbol="$"
      />,
    )

    expect(
      screen.getByRole("button", { name: "Primary Account" }),
    ).toBeInTheDocument()
    expect(screen.queryByText("balanceHistory:table.loading")).toBeNull()
  })

  it("shows the empty state when loading has finished without any rows", () => {
    render(
      <BalanceHistoryAccountSummaryTable
        rows={[]}
        isLoading={false}
        currencySymbol="$"
      />,
    )

    expect(screen.getByText("balanceHistory:table.empty")).toBeInTheDocument()
    expect(screen.queryByText("balanceHistory:table.loading")).toBeNull()
  })

  it("renders rows sorted by label and formats nullable money and coverage values", () => {
    render(
      <BalanceHistoryAccountSummaryTable
        rows={[
          buildRow({
            id: "bravo",
            label: "Bravo",
            startBalance: 20,
            endBalance: 25.4,
            netTotal: 5.4,
            incomeTotal: 9.9,
            outcomeTotal: 4.5,
            snapshotDays: 2,
            cashflowDays: 1,
            totalDays: 2,
          }),
          buildRow({
            id: "alpha",
            label: "Alpha",
            startBalance: null,
            endBalance: 12.345,
            netTotal: 2.5,
            incomeTotal: 5,
            outcomeTotal: 3,
            snapshotDays: 4,
            cashflowDays: 3,
            totalDays: 5,
          }),
        ]}
        isLoading={false}
        currencySymbol="$"
      />,
    )

    expect(getAccountOrder()).toEqual(["Alpha", "Bravo"])

    const alphaRow = screen.getByRole("button", { name: "Alpha" }).closest("tr")
    expect(alphaRow).not.toBeNull()

    const alphaRowScope = within(alphaRow!)
    expect(alphaRowScope.getByText("-")).toBeInTheDocument()
    expect(alphaRowScope.getByText("$12.35")).toBeInTheDocument()
    expect(alphaRowScope.getByText("$2.50")).toBeInTheDocument()
    expect(alphaRowScope.getByText("$5.00")).toBeInTheDocument()
    expect(alphaRowScope.getByText("$3.00")).toBeInTheDocument()
    expect(alphaRowScope.getByText("4/5")).toBeInTheDocument()
    expect(alphaRowScope.getByText("3/5")).toBeInTheDocument()
  })

  it("toggles nullable numeric sorting from descending to ascending while keeping null balances observable", async () => {
    const user = userEvent.setup()

    render(
      <BalanceHistoryAccountSummaryTable
        rows={[
          buildRow({
            id: "null-balance",
            label: "Zulu",
            startBalance: null,
          }),
          buildRow({
            id: "high-balance",
            label: "Alpha",
            startBalance: 25,
          }),
          buildRow({
            id: "low-balance",
            label: "Mike",
            startBalance: 5,
          }),
        ]}
        isLoading={false}
        currencySymbol="$"
      />,
    )

    await user.click(
      screen.getByRole("button", {
        name: "balanceHistory:table.columns.startBalance",
      }),
    )

    expect(getAccountOrder()).toEqual(["Zulu", "Alpha", "Mike"])

    await user.click(
      screen.getByRole("button", {
        name: "balanceHistory:table.columns.startBalance",
      }),
    )

    expect(getAccountOrder()).toEqual(["Mike", "Alpha", "Zulu"])
  })

  it("sorts snapshot coverage using zero for rows without total days while preserving the displayed counts", async () => {
    const user = userEvent.setup()

    render(
      <BalanceHistoryAccountSummaryTable
        rows={[
          buildRow({
            id: "partial-coverage",
            label: "Zulu",
            snapshotDays: 1,
            totalDays: 2,
          }),
          buildRow({
            id: "zero-total",
            label: "Alpha",
            snapshotDays: 7,
            totalDays: 0,
          }),
          buildRow({
            id: "full-coverage",
            label: "Mike",
            snapshotDays: 4,
            totalDays: 4,
          }),
        ]}
        isLoading={false}
        currencySymbol="$"
      />,
    )

    const snapshotCoverageHeader = screen.getByRole("button", {
      name: "balanceHistory:table.columns.snapshotCoverage",
    })

    await user.click(snapshotCoverageHeader)

    expect(getAccountOrder()).toEqual(["Mike", "Zulu", "Alpha"])

    const zeroCoverageRow = screen
      .getByRole("button", { name: "Alpha" })
      .closest("tr")
    expect(zeroCoverageRow).not.toBeNull()
    expect(within(zeroCoverageRow!).getByText("7/0")).toBeInTheDocument()

    expect(getAccountOrder()).toEqual(["Mike", "Zulu", "Alpha"])

    await user.click(snapshotCoverageHeader)

    expect(getAccountOrder()).toEqual(["Alpha", "Zulu", "Mike"])
  })
})
